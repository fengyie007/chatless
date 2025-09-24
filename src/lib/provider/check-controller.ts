import { providerStatusService } from './services/ProviderStatusService';
import { providerModelService } from './services/ProviderModelService';
import type { ProviderEntity } from './types';

type CheckReason = 'blur' | 'url_saved' | 'manual' | 'init' | 'pref_changed';

export type CheckResult = {
  name: string;
  entity?: ProviderEntity;
  status: 'CONNECTED' | 'NOT_CONNECTED' | 'NO_KEY' | 'UNKNOWN';
  reason?: string;
  message?: string | null;
};

interface RequestOptions {
  reason: CheckReason;
  withModels?: boolean;
  debounceMs?: number;
  minIntervalMs?: number;
}

type Listener = (p: CheckResult) => void;

class EventBus {
  private map = new Map<string, Set<Listener>>();
  on(evt: 'start'|'success'|'fail'|'timeout'|'cancel', cb: Listener) {
    const set = this.map.get(evt) ?? new Set<Listener>();
    set.add(cb);
    this.map.set(evt, set);
    return () => { set.delete(cb); };
  }
  emit(evt: 'start'|'success'|'fail'|'timeout'|'cancel', payload: CheckResult) {
    const set = this.map.get(evt); if (!set) return;
    for (const cb of set) cb(payload);
  }
}

class CheckController {
  private bus = new EventBus();
  private inflight = new Map<string, Promise<ProviderEntity | undefined>>();
  private debounceTimers = new Map<string, any>();
  private lastRunAt = new Map<string, number>();
  private lastModelFetchAt = new Map<string, number>();

  on(evt: 'start'|'success'|'fail'|'timeout'|'cancel', cb: Listener) {
    return this.bus.on(evt, cb);
  }

  requestCheck(name: string, opts: RequestOptions) {
    const { debounceMs = 300, minIntervalMs = 2000 } = opts;
    const now = Date.now();
    const last = this.lastRunAt.get(name) || 0;
    if (now - last < minIntervalMs && opts.reason !== 'manual') {
      return; // 节流：短时间内避免重复检查
    }
    // 若已有待执行的去抖任务或正在进行的检查，直接忽略，避免 silent no-op
    if (this.debounceTimers.has(name)) {
      clearTimeout(this.debounceTimers.get(name));
    }
    const timer = setTimeout(() => this.run(name, opts).catch(() => {}), debounceMs);
    this.debounceTimers.set(name, timer);
  }

  cancel(name: string) {
    const t = this.debounceTimers.get(name);
    if (t) clearTimeout(t);
    this.debounceTimers.delete(name);
    const p = this.inflight.get(name);
    if (p) {
      // 无法真正取消 Promise，但发出取消事件用于 UI 清理
      this.bus.emit('cancel', { name, status: 'UNKNOWN' });
    }
  }

  private async run(name: string, opts: RequestOptions) {
    this.lastRunAt.set(name, Date.now());
    console.log('[ProviderCheck] run -> start', name, opts);
    this.bus.emit('start', { name, status: 'UNKNOWN' });

    try {
      // 统一避免并发：同一 provider 若仍在进行中，取消之前的并复用最新一次
      const prev = this.inflight.get(name);
      if (prev) {
        console.log('[ProviderCheck] cancel previous inflight', name);
        this.bus.emit('cancel', { name, status: 'UNKNOWN' });
      }

      const promise = providerStatusService.refresh(name).finally(() => {
        this.inflight.delete(name);
      });
      this.inflight.set(name, promise);

      const updated = await promise.catch((e)=>{ console.error('[ProviderCheck] error', name, e); throw e; });
      if (!updated) {
        this.bus.emit('fail', { name, status: 'UNKNOWN', message: '刷新失败' });
        return;
      }

      const status = ((): CheckResult['status'] => {
        switch ((updated as any).status) {
          case 'CONNECTED': return 'CONNECTED';
          case 'NOT_CONNECTED': return 'NOT_CONNECTED';
          case 'NO_KEY': return 'NO_KEY';
          default: return 'UNKNOWN';
        }
      })();

      // 先向 UI 发出成功事件，避免因后续模型拉取阻塞而卡在“检查中”
      this.bus.emit('success', {
        name,
        entity: updated,
        status,
        reason: (updated as any).lastReason,
        message: (updated as any).lastMessage ?? null,
      });
      console.log('[ProviderCheck] success event emitted', name, status);
      // 将稳定结果写入状态存储，确保“最后检查时间/结果”立即更新
      try {
        const { useProviderStatusStore } = await import('@/store/providerStatusStore');
        const stable: 'CONNECTED' | 'NOT_CONNECTED' | 'UNKNOWN' = (status === 'CONNECTED' || status === 'NOT_CONNECTED') ? status : 'UNKNOWN';
        useProviderStatusStore.getState().setStatus(name, {
          lastCheckedAt: (updated as any).lastChecked || Date.now(),
          lastResult: stable,
          lastMessage: (updated as any).lastMessage ?? null,
        }, false);
      } catch { /* noop */ }

      // 成功后：按需异步拉取模型，做节流
      if (status === 'CONNECTED' && (opts.withModels ?? true)) {
        const lastFetch = this.lastModelFetchAt.get(name) || 0;
        if (Date.now() - lastFetch > 60_000) {
          this.lastModelFetchAt.set(name, Date.now());
          setTimeout(() => {
            providerModelService.fetchIfNeeded(name).catch(() => {});
          }, 0);
        }
      }
    } catch (e: any) {
      const msg = e?.message || String(e ?? '');
      console.log('[ProviderCheck] catch', name, msg);
      this.bus.emit('fail', { name, status: 'NOT_CONNECTED', message: msg });
    }
  }
}

export const checkController = new CheckController();


