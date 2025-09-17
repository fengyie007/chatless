"use client";
import React, { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/components/ui/sonner";

type Strategy = 'default' | 'auto' | 'openai-compatible' | 'openai-responses' | 'openai' | 'anthropic' | 'gemini' | 'deepseek';

type Row = { id: string; label: string; strategy: Strategy };

const STRATEGY_OPTIONS: Array<{ value: Strategy; label: string }> = [
  { value: 'default', label: '跟随默认' },
  { value: 'auto', label: '自动推断策略（按模型ID）' },
  { value: 'openai-compatible', label: 'OpenAI Compatible (/v1/chat/completions)' },
  { value: 'openai-responses', label: 'OpenAI Responses (/v1/responses)' },
  { value: 'openai', label: 'OpenAI Strict' },
  { value: 'anthropic', label: 'Anthropic (messages)' },
  { value: 'gemini', label: 'Google Gemini (generateContent)' },
  { value: 'deepseek', label: 'DeepSeek (chat/completions)' },
];

export function ProviderAddModelDialog({ providerName, onAdded }: { providerName: string; onAdded?: () => void }) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Row[]>([{ id: '', label: '', strategy: 'default' }]);
  const [saving, setSaving] = useState(false);

  const canSubmit = useMemo(() => rows.some(r => (r.id || '').trim().length > 0), [rows]);

  const addRow = () => setRows(prev => [...prev, { id: '', label: '', strategy: 'default' }]);
  const removeRow = (idx: number) => setRows(prev => prev.length <= 1 ? prev : prev.filter((_, i) => i !== idx));

  const submit = async () => {
    const payload = rows
      .map(r => ({ id: (r.id || '').trim(), label: (r.label || '').trim(), strategy: r.strategy }))
      .filter(r => !!r.id);
    if (payload.length === 0) { toast.error('请至少填写一个模型 ID'); return; }

    setSaving(true);
    try {
      const { modelRepository } = await import('@/lib/provider/ModelRepository');
      const { specializedStorage } = await import('@/lib/storage');
      const list = (await modelRepository.get(providerName)) || [];

      // 以覆盖为准：存在则更新 label，不存在则追加
      const idToIndex = new Map(list.map((m: any, i: number) => [String(m.name).toLowerCase(), i]));
      for (const r of payload) {
        const key = r.id.toLowerCase();
        if (idToIndex.has(key)) {
          const i = idToIndex.get(key)!;
          list[i] = { ...list[i], label: r.label || list[i].label };
        } else {
          list.push({ provider: providerName, name: r.id, label: r.label || undefined, aliases: [r.id] } as any);
        }
      }

      await modelRepository.save(providerName, list);

      // 写入模型策略覆盖（非 default 才写；auto 则按ID推断）
      const { inferStrategyFromModelId } = require('@/lib/provider/strategyInference');
      await Promise.all(
        payload.filter(p => p.strategy !== 'default').map(p => {
          const st = p.strategy === 'auto' ? inferStrategyFromModelId(p.id) : p.strategy;
          if (!st) return Promise.resolve();
          return specializedStorage.models.setModelStrategy(providerName, p.id, st);
        })
      );

      toast.success(`已添加/更新 ${payload.length} 个模型`);
      setOpen(false);
      setRows([{ id: '', label: '', strategy: 'default' }]);
      onAdded?.();
    } catch (e: any) {
      console.error(e);
      toast.error('保存失败', { description: e?.message || String(e) });
    }
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" size="sm" variant="secondary" className="h-7 px-2 text-xs">添加</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[720px]">
        <DialogHeader>
          <DialogTitle className="text-[16px] font-semibold text-gray-800 dark:text-gray-100">添加模型</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          {/* 表头仅显示一次，避免每行重复列名 */}
          <div className="grid grid-cols-12 gap-2 items-center px-1">
            <div className="col-span-4 text-[11px] text-gray-500">模型名称（显示名，可选）</div>
            <div className="col-span-4 text-[11px] text-gray-500">模型 ID</div>
            <div className="col-span-3 text-[11px] text-gray-500">请求策略</div>
            <div className="col-span-1" />
          </div>

          {rows.map((row, idx) => (
            <div key={idx} className="grid grid-cols-12 gap-2 items-center">
              <div className="col-span-4">
                <input
                  className="w-full h-9 px-3 rounded-md border border-gray-200 dark:border-gray-700 bg-white/90 dark:bg-gray-800/90 text-sm"
                  value={row.label}
                  onChange={e=>setRows(prev=> prev.map((r,i)=> i===idx? { ...r, label: e.target.value } : r))}
                  placeholder="如：Gemini 2.5 Pro" />
              </div>
              <div className="col-span-4">
                <input
                  className="w-full h-9 px-3 rounded-md border border-gray-200 dark:border-gray-700 bg-white/90 dark:bg-gray-800/90 text-sm"
                  value={row.id}
                  onChange={e=>setRows(prev=> prev.map((r,i)=> i===idx? { ...r, id: e.target.value } : r))}
                  placeholder="如：gemini-2.5-pro" />
              </div>
              <div className="col-span-3">
                <Select value={row.strategy} onValueChange={(v:any)=>setRows(prev=> prev.map((r,i)=> i===idx? { ...r, strategy: v } : r))}>
                  <SelectTrigger className="h-9 text-xs w-full truncate">
                    <SelectValue placeholder="跟随默认" className="truncate" />
                  </SelectTrigger>
                  <SelectContent className="max-w-[360px]">
                    {STRATEGY_OPTIONS.map(opt=> (
                      <SelectItem key={opt.value} value={opt.value} className="text-xs truncate">{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-1 flex items-center gap-1 justify-end">
                <Button type="button" aria-label="添加一行" variant="outline" className="h-7 w-7 rounded-md bg-blue-50 hover:bg-blue-100 text-blue-700 border-blue-200 p-0" onClick={addRow}>+</Button>
                <Button type="button" aria-label="删除该行" variant="outline" className="h-7 w-7 rounded-md text-gray-500 p-0" onClick={()=>removeRow(idx)} disabled={rows.length<=1}>−</Button>
              </div>
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" className="bg-white text-gray-600 h-8 px-3" onClick={()=>setOpen(false)} disabled={saving}>取消</Button>
          <Button className="bg-blue-500/80 hover:bg-blue-500 text-white h-8 px-3" onClick={submit} disabled={saving || !canSubmit}>{saving? '保存中…' : '批量添加/更新'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

