"use client";

import React from 'react';
import { cn } from '@/lib/utils';
// 不再在卡片内部触发重试逻辑

type ToolCallStatus = 'success' | 'error' | 'running';

interface ToolCallCardProps {
  server: string;
  tool: string;
  status: ToolCallStatus;
  args?: Record<string, unknown>;
  resultPreview?: string;
  errorMessage?: string;
  schemaHint?: string; // e.g. required keys or example JSON
  messageId?: string; // enable inline retry when present
}

export function ToolCallCard({ server, tool, status, args, resultPreview, errorMessage, schemaHint }: ToolCallCardProps) {
  // 固定展示状态，不再提供重试按钮（由上层流程自动处理重试/继续）
  const [open, setOpen] = React.useState(status === 'error');
  React.useEffect(() => {
    if (status === 'error') setOpen(true);
  }, [status]);
  return (
    <div className={cn(
      // 固定卡片最大宽度，防止随思考栏文本宽度变化
      'w-full max-w-[720px] rounded-xl border text-sm overflow-hidden backdrop-blur supports-[backdrop-filter]:bg-white/60 dark:supports-[backdrop-filter]:bg-slate-900/40 transition-shadow shadow-sm hover:shadow-md',
      status === 'error' ? 'border-red-200/70 bg-red-50/40 dark:border-red-900/40 dark:bg-red-900/10' :
      status === 'running' ? 'border-emerald-200/70 bg-emerald-50/40 dark:border-emerald-900/40 dark:bg-emerald-900/10' :
      'border-slate-200/70 bg-slate-50/30 dark:border-slate-800/60 dark:bg-slate-900/30'
    )}>
      <div className="px-3 py-2 flex items-center gap-2 border-b border-slate-200/60 dark:border-slate-800/60">
        <span className="px-1.5 py-0.5 rounded-md border border-emerald-200/70 bg-emerald-50/70 text-emerald-700 text-[11px]">@</span>
        <button onClick={()=>setOpen(o=>!o)} className="cursor-pointer font-medium truncate hover:underline/60">{server}</button>
        <span className="text-slate-400">·</span>
        <span className="font-mono text-[12px] truncate">{tool}</span>
        {/* 状态指示器：增强视觉反馈 */}
        <div className="ml-auto flex items-center gap-1.5">
          <span
            className={cn(
              'inline-flex items-center justify-center w-2 h-2 rounded-full',
              status === 'error' ? 'bg-red-500 shadow-[0_0_0_3px_rgba(248,113,113,0.2)]' :
              status === 'running' ? 'bg-emerald-500 animate-pulse shadow-[0_0_0_3px_rgba(16,185,129,0.15)]' :
              'bg-emerald-600 shadow-[0_0_0_3px_rgba(16,185,129,0.1)]'
            )}
            title={status === 'error' ? '调用失败' : status === 'running' ? '调用中...' : '调用成功'}
          />
          {status === 'running' && (
            <span className="text-[10px] text-emerald-600 font-medium animate-pulse">调用中</span>
          )}
          {status === 'error' && (
            <span className="text-[10px] text-red-600 font-medium">失败</span>
          )}
        </div>
      </div>
      {open && args && Object.keys(args).length > 0 && (
        <div className="px-3 py-2 text-[12px] text-slate-600 dark:text-slate-300">
          <div className="mb-1 font-medium">参数</div>
          <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-all text-[12px]">{JSON.stringify(args, null, 2)}</pre>
        </div>
      )}
      {open && status === 'success' && resultPreview && (
        <div className="px-3 py-2 text-[12px] text-slate-600 dark:text-slate-300">
          <div className="mb-1 font-medium">结果</div>
          <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-all text-[12px]">{resultPreview}</pre>
        </div>
      )}
      {open && status === 'error' && (
        <div className="px-3 py-2 text-[12px] text-red-700 dark:text-red-300">
          <div className="mb-1 font-medium flex items-center gap-2">
            <span>错误信息</span>
            <span className="text-[10px] px-1.5 py-0.5 bg-red-100 text-red-600 rounded">自动重试中...</span>
          </div>
          <div className="max-h-32 overflow-auto whitespace-pre-wrap break-all text-[12px] bg-red-50/50 rounded p-2 border border-red-200">
            {errorMessage || '未知错误'}
          </div>
          {schemaHint && (
            <div className="mt-3 text-[12px] text-slate-600 dark:text-slate-300">
              <div className="mb-1 font-medium">修复建议</div>
              <div className="max-h-40 overflow-auto whitespace-pre-wrap break-all text-[12px] bg-slate-50 rounded p-2 border border-slate-200">
                {schemaHint}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

