import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { useState, useEffect } from 'react';
import { toast } from '@/components/ui/sonner';
import type { KnowledgeBase } from '@/lib/knowledgeService';

interface EditKnowledgeDialogProps {
  open: boolean;
  kb: KnowledgeBase | null;
  onOpenChange: (open: boolean) => void;
  onSave: (name: string, description: string) => Promise<void>;
}

export function EditKnowledgeDialog({ open, kb, onOpenChange, onSave }: EditKnowledgeDialogProps) {
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (kb) {
      setName(kb.name);
      setDesc(kb.description || '');
    }
  }, [kb]);

  const validName = (str: string) => /^[\u4e00-\u9fa5A-Za-z0-9 _-]+$/.test(str);

  const handleSubmit = async () => {
    if (!kb) return;
    if (!name.trim()) {
      toast.error('名称不能为空');
      return;
    }
    if (!validName(name.trim())) {
      toast.error('名称包含非法字符');
      return;
    }
    try {
      setLoading(true);
      await onSave(name.trim(), desc.trim());
      onOpenChange(false);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md rounded-2xl border border-slate-200/60 dark:border-slate-700/60 shadow-xl dark:bg-slate-900">
        <DialogHeader className="border-b border-slate-100/80 dark:border-slate-800/60 pb-3 bg-gradient-to-b from-slate-50/50 to-transparent dark:from-slate-900/30">
          <DialogTitle className="text-lg font-semibold text-slate-900 dark:text-slate-100">编辑知识库</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div>
            <label className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5 block">知识库名称</label>
            <Input className="h-10 rounded-lg border-slate-200 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-100 focus:border-blue-400 dark:focus:border-blue-500 transition-colors" value={name} onChange={(e)=>setName(e.target.value)} placeholder="知识库名称" />
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5 block">知识库描述</label>
            <Textarea className="rounded-lg border-slate-200 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-100 focus:border-blue-400 dark:focus:border-blue-500 transition-colors resize-none" rows={3} value={desc} onChange={(e)=>setDesc(e.target.value)} placeholder="知识库描述" />
          </div>
        </div>
        <DialogFooter className="border-t border-slate-100/80 dark:border-slate-800/60 pt-4 bg-gradient-to-t from-slate-50/30 to-transparent dark:from-slate-900/20">
          <Button variant="dialogSecondary" onClick={()=>onOpenChange(false)} disabled={loading} className="rounded-lg">取消</Button>
          <Button variant="dialogPrimary" onClick={handleSubmit} disabled={loading} className="rounded-lg shadow-sm">保存</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
} 