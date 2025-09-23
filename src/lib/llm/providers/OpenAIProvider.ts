import { BaseProvider, CheckResult, LlmMessage, StreamCallbacks } from './BaseProvider';
import { getStaticModels } from '../../provider/staticModels';
import { SSEClient } from '@/lib/sse-client';

export class OpenAIProvider extends BaseProvider {
  private sseClient: SSEClient;
  private aborted: boolean = false;

  constructor(baseUrl: string, apiKey?: string, displayName: string = 'OpenAI') {
    super(displayName, baseUrl, apiKey);
    this.sseClient = new SSEClient('OpenAIProvider');
  }

  async fetchModels(): Promise<Array<{name: string, label?: string, aliases?: string[]}> | null> {
    // 暂不进行在线拉取，统一使用静态模型清单；按 provider 名称读取对应静态清单
    const key = this.name || 'OpenAI';
    const list = getStaticModels(key);
    return list?.map((m)=>({ name: m.id, label: m.label, aliases: [m.id] })) ?? null;
  }

  async checkConnection(): Promise<CheckResult> {
    const apiKey = await this.getApiKey();
    if (!apiKey) return { ok: false, reason: 'NO_KEY', message: 'NO_KEY' };
    
    // 使用专门的连通性检查函数
    const baseUrl = this.baseUrl.replace(/\/$/, '');
    console.log(`[OpenAIProvider] 开始检查网络连通性: ${baseUrl}`);
    
    const { checkConnectivity } = await import('@/lib/request');
    const result = await checkConnectivity(baseUrl, {
      timeout: 5000,
      debugTag: 'OpenAIProvider-Connectivity'
    });
    
    if (result.ok) {
      console.log(`[OpenAIProvider] 网络连通性检查成功，状态码: ${result.status}`);
      return { ok: true, message: '网络连接正常' };
    } else {
      console.error(`[OpenAIProvider] 网络连通性检查失败: ${result.reason}`, result.error);
      
      switch (result.reason) {
        case 'TIMEOUT':
          return { ok: false, reason: 'TIMEOUT', message: '连接超时' };
        case 'NETWORK':
          return { ok: false, reason: 'NETWORK', message: '网络连接失败' };
        default:
          return { ok: false, reason: 'UNKNOWN', message: result.error || '未知错误' };
      }
    }
  }

  async chatStream(
    model: string, 
    messages: LlmMessage[], 
    cb: StreamCallbacks,
    opts: Record<string, any> = {}
  ): Promise<void> {
    const apiKey = await this.getApiKey(model);
    if (!apiKey) {
      const err = new Error('NO_KEY');
      (err as any).code = 'NO_KEY';
      (err as any).userMessage = '未配置 API 密钥，请在“设置 → 模型与Provider”中为当前 Provider 或模型配置密钥';
      cb.onError?.(err);
      return;
    }

    const url = `${this.baseUrl.replace(/\/$/, '')}/chat/completions`;
    // 将通用选项映射为 OpenAI 字段（snake_case）
    const mapped: any = { ...opts };
    const o: any = opts as any;
    if (o.maxTokens !== undefined && mapped.max_tokens === undefined) mapped.max_tokens = o.maxTokens;
    if (o.maxOutputTokens !== undefined && mapped.max_tokens === undefined) mapped.max_tokens = o.maxOutputTokens;
    if (o.topP !== undefined && mapped.top_p === undefined) mapped.top_p = o.topP;
    if (o.topK !== undefined && mapped.top_k === undefined) mapped.top_k = o.topK;
    if (o.minP !== undefined && mapped.min_p === undefined) mapped.min_p = o.minP;
    if (o.frequencyPenalty !== undefined && mapped.frequency_penalty === undefined) mapped.frequency_penalty = o.frequencyPenalty;
    if (o.presencePenalty !== undefined && mapped.presence_penalty === undefined) mapped.presence_penalty = o.presencePenalty;
    if (o.stop !== undefined && mapped.stop === undefined) mapped.stop = o.stop;

    const body = {
      model,
      messages: messages.map(m => ({ role: m.role, content: m.content })),
      stream: true,
      ...mapped,
    };

    try {
      this.aborted = false;
      await this.sseClient.startConnection(
        {
          url,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          },
          body,
          debugTag: 'OpenAIProvider'
        },
        {
          onStart: cb.onStart,
          onError: cb.onError,
          onData: (rawData: string) => {
            if (this.aborted) { this.sseClient.stopConnection(); return; }
            // 严格 OpenAI：只处理以 data: 开头的行
            if (!rawData.startsWith('data:')) return;
            const jsonStr = rawData.substring(5).trim();
            if (!jsonStr) return;
            if (jsonStr === '[DONE]') {
              cb.onComplete?.();
              this.sseClient.stopConnection();
              return;
            }
            try {
              const json = JSON.parse(jsonStr);
              const token = json?.choices?.[0]?.delta?.content;
              if (token) cb.onToken?.(token);
            } catch (err) {
              console.warn('[OpenAIProvider] JSON parse error', err);
            }
          }
        }
      );
    } catch (error: any) {
      console.error('[OpenAIProvider] SSE connection failed:', error);
      cb.onError?.(error);
    }
  }

  /**
   * 清理资源
   */
  async destroy(): Promise<void> {
    await this.sseClient.destroy();
  }

  /**
   * 取消流式连接
   */
  cancelStream(): void {
    this.aborted = true;
    this.sseClient.stopConnection();
  }
}
