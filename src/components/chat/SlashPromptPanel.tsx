"use client";

import { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { usePromptStore } from '@/store/promptStore';
import { generateShortcutCandidates } from '@/lib/prompt/shortcut';
import { StorageUtil } from '@/lib/storage';
import { createPortal } from 'react-dom';
import { Button } from '@/components/ui/button';
import { Plus, Zap } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface SlashPromptPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (promptId: string, opts?: { action?: 'apply' | 'send' | 'fill'; mode?: 'permanent' | 'oneOff' }) => void;
  anchorRef?: React.RefObject<HTMLElement>;
  // 来自主输入框的文本，用于统一过滤，避免重复输入
  queryText?: string;
}

export function SlashPromptPanel({ open, onOpenChange, onSelect, anchorRef, queryText }: SlashPromptPanelProps) {
  const prompts = usePromptStore((s) => s.prompts);
  const loadFromDatabase = usePromptStore((s)=> (s as any).loadFromDatabase);
  const [activeIndex, setActiveIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const [anchorRect, setAnchorRect] = useState<{left:number; width:number; top:number} | null>(null);
  const [pendingVars, setPendingVars] = useState<Record<string, any>>({});
  const router = useRouter();
  const [altPreview, setAltPreview] = useState(false);

  // 使用 Ref 保存最新的 activeIndex / filtered / pendingVars，避免键盘事件闭包读取到旧值
  const activeIndexRef = useRef(0);
  useEffect(() => { activeIndexRef.current = activeIndex; }, [activeIndex]);
  // filtered 的 Ref 需在其定义之后设置（见下方 useMemo）
  const pendingVarsRef = useRef(pendingVars);
  useEffect(() => { pendingVarsRef.current = pendingVars; }, [pendingVars]);

  useEffect(() => {
    if (open) {
      setActiveIndex(0);
      activeIndexRef.current = 0;
      // 若还未加载提示词，尝试从数据库拉取
      try { if (prompts.length === 0 && typeof loadFromDatabase === 'function') { loadFromDatabase(); } } catch {}
      // 计算锚点位置
      const calc = () => {
        try {
          const el = anchorRef?.current as HTMLElement | null;
          if (!el) return;
          const rect = el.getBoundingClientRect();
          setAnchorRect({ left: rect.left, width: rect.width, top: rect.top });
        } catch {}
      };
      calc();
      window.addEventListener('scroll', calc, true);
      window.addEventListener('resize', calc);
      const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Alt') setAltPreview(true); };
      const onKeyUp = (e: KeyboardEvent) => { if (e.key === 'Alt') setAltPreview(false); };
      window.addEventListener('keydown', onKeyDown);
      window.addEventListener('keyup', onKeyUp);
      return () => {
        window.removeEventListener('scroll', calc, true);
        window.removeEventListener('resize', calc);
        window.removeEventListener('keydown', onKeyDown);
        window.removeEventListener('keyup', onKeyUp);
      };
    }
  }, [open]);

  // 解析 queryText -> pendingVars（副作用，不要在渲染期间 setState）
  useEffect(() => {
    const q = (queryText || '').trim().toLowerCase();
    let text = q;
    const tagMatch = q.match(/tag:([^\s]+)/);
    if (tagMatch) {
      text = q.replace(tagMatch[0], '').trim();
    }
    if (!text.startsWith('/')) { setPendingVars({}); return; }
    const parts = text.split(/\s+/);
    const rest = text.slice(parts[0].length).trim();
    const inlineVars: Record<string,string> = {};
    const varRe = /([^\s=]+)\s*=\s*("([^"]*)"|'([^']*)'|([^\s]+))/gu;
    let m: RegExpExecArray | null;
    while ((m = varRe.exec(rest))) { inlineVars[m[1]] = (m[3] ?? m[4] ?? m[5] ?? '').toString(); }
    if (Object.keys(inlineVars).length === 0 && rest) {
      const asciiIdx = rest.indexOf('| ');
      const fullIdx = rest.indexOf('｜ ');
      const cutIdx = [asciiIdx, fullIdx].filter(v=>v>=0).sort((a,b)=>a-b)[0];
      if (cutIdx !== undefined) {
        const before = rest.slice(0, cutIdx);
        const after = rest.slice(cutIdx + 2).trim();
        const hasDelimBefore = /[|｜]/.test(before);
        const positional = hasDelimBefore ? before.split(/[|｜]/g).map(s=>s.trim()).filter(Boolean) : [before.trim()].filter(Boolean);
        setPendingVars({ __positional: positional, __postText: after });
      } else {
        const hasDelim = /[|｜]/.test(rest);
        const positional = hasDelim ? rest.split(/[|｜]/g).map(s=>s.trim()).filter(Boolean) : [rest];
        setPendingVars({ __positional: positional });
      }
    } else {
      setPendingVars(inlineVars);
    }
  }, [queryText]);

  const filtered = useMemo(() => {
    const q = (queryText || '').trim().toLowerCase();
    let tagFilter: string | null = null;
    let text = q;
    const tagMatch = q.match(/tag:([^\s]+)/);
    if (tagMatch) {
      tagFilter = tagMatch[1];
      text = q.replace(tagMatch[0], '').trim();
    }
    // 记忆选择（localStorage）
    let pref: Record<string,string> = {};
    try { pref = (window as any).__prompt_pref_cache__ || {}; } catch {}
    // 仅用于过滤/排序的 token
    let token = '';
    if (text.startsWith('/')) {
      const parts = text.split(/\s+/);
      token = parts[0].replace(/^\//,'');
    } else {
      token = text || '';
    }
    const list = prompts
      .filter((p) => {
        const byTag = tagFilter ? (p.tags || []).some((t) => t.toLowerCase().includes(tagFilter)) : true;
        if (!byTag) return false;
        if (!text) return true;
        const hay = `${p.name} ${(p.tags || []).join(' ')} ${p.description || ''}`.toLowerCase();
        const hasSaved = (p as any).shortcuts?.some((s:string)=> s.toLowerCase().startsWith(token));
        const suggested = token && generateShortcutCandidates(p.name, p.tags || [], p.languages || []).some((s)=> s.startsWith(token));
        return hay.includes(text) || hasSaved || suggested;
      })
      .map((p) => {
        const savedShortcuts: string[] = (p as any).shortcuts || [];
        const hasExactSaved = token && savedShortcuts.some(s=>s.toLowerCase()===token);
        const hasSavedPrefix = token && savedShortcuts.some(s=>s.toLowerCase().startsWith(token));
        const isPreferred = token && pref[token] === p.id;
        const suggestedHit = token && !hasSavedPrefix && generateShortcutCandidates(p.name, p.tags || [], p.languages || []).some(s=>s.startsWith(token));
        return { p, hasExactSaved, hasSavedPrefix, isPreferred, suggestedHit };
      });
    if (!q) {
      // 打开时优先展示：收藏其一 + 最近使用 Top，最多 10 个
      const withScore = list.map(({p}) => ({
        p,
        score: (p.favorite ? 1000 : 0) + (p.stats?.uses || 0) * 10 + (p.stats?.lastUsedAt || 0) / 1e12,
      }));
      return withScore.sort((a,b)=>b.score-a.score).map(x=>({ p: x.p, note: ''})).slice(0, 10);
    }
    // 排序：exact saved > preferred memory > saved prefix > suggested > 其他文本命中
    const sorted = list.sort((a,b)=>{
      const scoreA = (a.hasExactSaved?1000:0) + (a.isPreferred?500:0) + (a.hasSavedPrefix?100:0) + (a.suggestedHit?10:0);
      const scoreB = (b.hasExactSaved?1000:0) + (b.isPreferred?500:0) + (b.hasSavedPrefix?100:0) + (b.suggestedHit?10:0);
      return scoreB - scoreA;
    });
    return sorted.slice(0, 20).map(x=>({ p: x.p, note: x.suggestedHit && !x.hasSavedPrefix ? '(建议)' : '' }));
  }, [prompts, queryText]);

  // 将最新的 filtered 列表写入 Ref，供键盘事件读取
  const filteredRef = useRef<any[]>([]);
  useEffect(() => { filteredRef.current = filtered as any[]; }, [filtered]);

  // 当列表变化时，纠正 activeIndex，避免键盘高亮与提交不一致
  useEffect(() => {
    setActiveIndex((i) => Math.max(0, Math.min(i, filtered.length - 1)));
  }, [filtered.length]);

  const isPositionalMode = useMemo(() => {
    const raw = (queryText || '').trim();
    if (!raw.startsWith('/')) return false;
    const parts = raw.split(/\s+/);
    if (parts.length < 2) return false;
    const rest = raw.slice(parts[0].length).trim();
    if (!rest) return false;
    return !/([^\s=]+)\s*=/u.test(rest);
  }, [queryText]);

  // 从元数据或模板内容推导变量定义顺序
  const getVariableKeys = (p: any): string[] => {
    if (!p) return [];
    const metaKeys: string[] = (Array.isArray(p.variables) ? (p.variables as any[]).map(v=>v.key).filter(Boolean) : []) as string[];
    if (metaKeys.length > 0) return metaKeys;
    const content: string = String(p.content || '');
    const pattern = /\{\{\s*([^\s{}=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^}]+)))?\s*\}\}/gu;
    const keys: string[] = [];
    let m: RegExpExecArray | null;
    while ((m = pattern.exec(content))) {
      const key = m[1];
      if (key && !keys.includes(key)) keys.push(key);
    }
    return keys;
  };

  // 计算用于渲染的变量值（支持位置参数，并合并默认值）
  const computeVariableValues = (p: any): Record<string, string> => {
    if (!p) return {};
    const defs: Array<{ key: string; defaultValue?: string }> = ((p.variables || []) as any[]).filter(Boolean);
    const keys = getVariableKeys(p);
    const basePairs: Array<[string, string]> = keys.map(k => {
      const meta = defs.find(d=>d.key===k);
      return [k, meta?.defaultValue ?? ''];
    });
    const base: Record<string, string> = Object.fromEntries(basePairs);
    const pos: string[] | undefined = (pendingVars as any).__positional;
    if (Array.isArray(pos) && keys.length > 0) {
      keys.forEach((k, idx) => { base[k] = pos[idx] ?? base[k] ?? ''; });
      return base;
    }
    // key=value 模式：覆盖默认
    const provided = pendingVars as Record<string, string>;
    for (const k in provided) { if (k !== '__positional') base[k] = String(provided[k] ?? ''); }
    return base;
  };

  // 返回变量与填充状态（input/default/missing）供 UI 展示
  const getVariableStatuses = (p: any): Array<{ key: string; value: string; source: 'input' | 'default' | 'missing' }> => {
    const keys = getVariableKeys(p);
    if (keys.length === 0) return [];
    const values = computeVariableValues(p);
    const providedKV = pendingVars;
    const pos = (providedKV as any).__positional as string[] | undefined;
    return keys.map((k, idx) => {
      const v = values[k] ?? '';
      const hasMetaDefault = Array.isArray(p.variables) && !!(p.variables as any[]).find((d:any)=>d.key===k && d.defaultValue);
      const fromInput = (pos ? idx < (pos?.length || 0) && pos[idx] !== undefined : Object.prototype.hasOwnProperty.call(providedKV, k));
      const source: 'input' | 'default' | 'missing' = v ? (fromInput ? 'input' : (hasMetaDefault ? 'default' : 'input')) : (hasMetaDefault ? 'default' : 'missing');
      return { key: k, value: v, source };
    });
  };

  // 将模板渲染为高亮 React 片段（高亮变量值）
  const renderHighlighted = (template: string, values: Record<string, string>) => {
    const pattern = /\{\{\s*([^\s{}=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^}]+)))?\s*\}\}/gu;
    const nodes: React.ReactNode[] = [];
    let lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = pattern.exec(template))) {
      const [match, key, d1, d2, d3] = m as unknown as [string, string, string?, string?, string?];
      const before = template.slice(lastIndex, m.index);
      if (before) nodes.push(before);
      const fallback = d1 ?? d2 ?? (d3 ? String(d3).trim() : undefined);
      const value = (values[key] ?? fallback ?? '').toString();
      nodes.push(
        <span key={m.index} className="px-1 rounded bg-yellow-100/70 dark:bg-yellow-900/40 text-yellow-900 dark:text-yellow-100">
          {value}
        </span>
      );
      lastIndex = m.index + match.length;
    }
    const tail = template.slice(lastIndex);
    if (tail) nodes.push(tail);
    return nodes;
  };

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!open) return;
      if (e.key === 'Escape') { onOpenChange(false); return; }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        const next = Math.min(activeIndexRef.current + 1, (filteredRef.current).length - 1);
        activeIndexRef.current = next;
        setActiveIndex(next);
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        const prev = Math.max(activeIndexRef.current - 1, 0);
        activeIndexRef.current = prev;
        setActiveIndex(prev);
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        const list: any[] = filteredRef.current;
        const idx = Math.max(0, Math.min(activeIndexRef.current, list.length - 1));
        const id = (list[idx])?.p?.id || (list[idx])?.id;
        if (id) {
          try { const ev = new CustomEvent('prompt-inline-vars', { detail: pendingVarsRef.current }); window.dispatchEvent(ev); } catch {}
          // 新规则：回车直接发送；Alt+回车应用为系统（Shift+Alt 为一次性）
          const useApply = (e as any).altKey || (e as any).metaKey; // 允许 ⌘ 兼容
          if (useApply) {
            const oneOff = (e as any).shiftKey;
            onSelect(id, { action: 'apply', mode: oneOff ? 'oneOff' : 'permanent' });
          } else {
            onSelect(id, { action: 'fill' });
          }
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onSelect, onOpenChange]);

  if (!open) return null;

  const fixedStyle = anchorRect ? {
    position: 'fixed' as const,
    left: `${anchorRect.left}px`,
    width: `${anchorRect.width}px`,
    bottom: `${window.innerHeight - anchorRect.top + 36}px`,
    zIndex: 2147483000,
  } : undefined;

  const panel = (
    <div ref={containerRef} className="bg-white dark:bg-gray-900/95 shadow-md border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden" style={fixedStyle}>
      {/* 顶部提示：一行操作提示 + 一行位置参数提示（按需显示） */}
      <div className="px-3 pt-2 pb-1.5 relative">
        {/* 动态操作提示：默认发送（绿色），按住 Alt 变为应用为系统提示词（紫色） */}
        <div
          className={cn(
            "inline-flex items-center gap-1 rounded border px-2 py-1 text-[11px]",
            altPreview
              ? "text-purple-700 bg-purple-50 border-purple-200 dark:text-purple-200 dark:bg-purple-900/20 dark:border-purple-800"
              : "text-green-700 bg-green-50 border-green-200 dark:text-green-200 dark:bg-green-900/20 dark:border-green-800"
          )}
        >
          {altPreview ? (
            <span>回车：设为系统提示词</span>
          ) : (
            <span>回车：代入提示词　Alt+回车：设为系统提示词</span>
          )}
        </div>
        {/* 引导说明：为“指令/分隔符/标签筛选”等片段添加背景以区分文案 */}
        <div className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">
          <span><span className="px-1 rounded bg-gray-100 dark:bg-gray-800 font-mono text-gray-700 dark:text-gray-300">空格</span>继续输入变量，</span>
          <span className="px-1 rounded bg-gray-100 dark:bg-gray-800 font-mono text-gray-700 dark:text-gray-300">|</span>
          <span> 分隔位置参数/结束变量；</span>
          <span className="px-1 rounded bg-gray-100 dark:bg-gray-800 font-mono text-gray-700 dark:text-gray-300">/tag:写作</span>
          <span> 可过滤标签</span>
        </div>
        {filtered.length === 0 && (
          <Button aria-label="添加提示词" variant="ghost" size="icon" className="absolute top-1.5 right-1.5 h-7 w-7 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800" onMouseDown={(e)=>{ e.preventDefault(); onOpenChange(false); router.push('/prompts'); }}>
            <Plus className="w-4 h-4" />
          </Button>
        )}
        {/* 去掉位置参数提示，简洁显示 */}
      </div>
      {/* 按需预览已移除，避免与条目内的内容预览重复 */}
      <ScrollArea className="max-h-60">
        <ul className="py-1">
          {filtered.map((item, idx) => (
            <li key={item.p.id} className={cn('px-3 py-2 cursor-pointer text-sm flex items-center justify-between', idx === activeIndex ? 'bg-indigo-50/70 dark:bg-indigo-900/40' : 'hover:bg-gray-50 dark:hover:bg-gray-800/60')} onMouseEnter={() => setActiveIndex(idx)} onMouseDown={(e) => {
              e.preventDefault();
              // 记忆本次选择的指令 -> 提示词映射
              const q = (queryText || '').trim().toLowerCase();
              const token = q.startsWith('/') ? q.replace(/^\//,'') : '';
              if (token) {
                (async ()=>{
                  try {
                    const cur = (await StorageUtil.getItem<Record<string,string>>('prompt-shortcut-preference', {}, 'user-preferences.json')) || {};
                    cur[token] = item.p.id;
                    await StorageUtil.setItem('prompt-shortcut-preference', cur, 'user-preferences.json');
                    try { (window as any).__prompt_pref_cache__ = cur; } catch {}
                  } catch {}
                })();
              }
              // 选择时把解析到的变量透传给父层（用于代入渲染到输入框 / 应用为系统提示词）
              try { const ev = new CustomEvent('prompt-inline-vars', { detail: pendingVars }); window.dispatchEvent(ev); } catch {}
              const useApply = (e as any).altKey || (e as any).metaKey; // Alt 或 ⌘
              if (useApply) {
                const oneOff = (e as any).shiftKey;
                onSelect(item.p.id, { action: 'apply', mode: oneOff ? 'oneOff' : 'permanent' });
              } else {
                onSelect(item.p.id, { action: 'fill' });
              }
            }}>
              <div className="min-w-0">
                <div className="font-medium text-gray-800 dark:text-gray-100 truncate flex items-center gap-2">
                  <span className="truncate">{item.p.name}</span>
                  {/* 显示已绑定的快捷指令，最多展示3个 */}
                  {Array.isArray((item.p as any).shortcuts) && (item.p as any).shortcuts.length > 0 && (
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {((item.p as any).shortcuts as string[]).slice(0,3).map(s => (
                        <span key={s} className="px-1.5 py-0.5 rounded-md border border-indigo-200 bg-indigo-50/80 text-[11px] text-indigo-700">/{s}</span>
                      ))}
                      {((item.p as any).shortcuts as string[]).length > 3 && (
                        <span className="text-[11px] text-indigo-600">+{((item.p as any).shortcuts as string[]).length - 3}</span>
                      )}
                    </div>
                  )}
                </div>
                {/* 标签以小徽章展示，过多时自动折行 */}
                {item.p.tags && item.p.tags.length > 0 && (
                  <div className="mt-0.5 flex flex-wrap gap-1">
                    {item.p.tags.slice(0,6).map((t:string) => (
                      <span key={t} className="px-1.5 py-0.5 rounded-md bg-gray-100 dark:bg-gray-800 text-[11px] text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700">{t}</span>
                    ))}
                    {item.p.tags.length > 6 && (
                      <span className="text-[11px] text-gray-500">+{item.p.tags.length - 6}</span>
                    )}
                  </div>
                )}
                {/* 内容占位预览：在模板中将 {{var}} 以灰色chip展示，若输入有值则显示值；限制最多三行，过长省略 */}
                <div className="mt-1 rounded bg-gray-50/70 dark:bg-gray-800/40 border border-gray-200 dark:border-gray-700 px-2 py-1 text-[12px] leading-5 whitespace-normal break-words line-clamp-3">
                  {renderHighlighted(item.p.content, computeVariableValues(item.p))}
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                {item.p.stats?.uses ? <span className="text-[11px] text-gray-400">{item.p.stats.uses} 次</span> : null}
                {item.note && <span className="text-[11px] text-indigo-600">{item.note}</span>}
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-xs text-gray-600 hover:bg-gray-200 dark:hover:bg-gray-700"
                  onMouseDown={(ev)=>{ ev.preventDefault(); try { const ce = new CustomEvent('prompt-inline-vars', { detail: pendingVars }); window.dispatchEvent(ce); } catch {} ; onSelect(item.p.id, { action: 'fill' }); }}
                  title="代入到输入框（不直接发送）"
                >
                  <Zap className="w-3.5 h-3.5" />
                </Button>
              </div>
            </li>
          ))}
          {filtered.length === 0 && (
            <li className="px-3 py-2 text-[12px] text-gray-600 dark:text-gray-300">
              没有匹配的提示词 · 试试 <span className="font-medium">tag:写作</span>
            </li>
          )}
        </ul>
      </ScrollArea>
    </div>
  );

  // Portal 到 body，避免被上层 overflow 裁剪/遮挡
  if (typeof window !== 'undefined') {
    return createPortal(panel, document.body);
  }
  return panel;
}

