'use client';

import { useMemo, useState } from 'react';
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/ui/select";
import { PromptCard, Prompt } from "./PromptCard";
import { usePromptStore } from "@/store/promptStore";
import { useChatStore } from "@/store/chatStore";
import { toast } from "@/components/ui/sonner";
import { PromptEditorDialog } from "./PromptEditorDialog";
//
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

interface PromptListProps {
  prompts: Prompt[];
  // Add handlers from PromptCard if needed at this level
}

export function PromptList({ prompts }: PromptListProps) {
  // 轻量化：移除批量选择
  const toggleFavorite = usePromptStore((s)=>s.toggleFavorite);
  const updatePrompt = usePromptStore((s)=>s.updatePrompt);
  const deletePrompt = usePromptStore((s)=>s.deletePrompt);
  const setSortBy = usePromptStore((s)=>s.setSortBy);
  const ui = usePromptStore((s)=>s.ui);
  const allPrompts = usePromptStore((s)=>s.prompts);
  const updateConversation = useChatStore((s)=>s.updateConversation);
  const currentConversationId = useChatStore((s)=>s.currentConversationId);

  // 仅使用收藏/编辑/删除/应用
  const handleToggleFavorite = (id: string) => toggleFavorite(id);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const editingInitial = useMemo(() => allPrompts.find(p=>p.id===editingId) || null, [allPrompts, editingId]);
  const handleEdit = (id: string) => { setEditingId(id); setEditorOpen(true); };
  // 删除无用的占位函数
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const handleDelete = (id: string) => { setPendingDeleteId(id); };

  const applyToCurrentChat = (id: string) => {
    if (!currentConversationId) { toast.info('请先选择一个对话'); return; }
    updateConversation(currentConversationId, { system_prompt_applied: { promptId: id, mode: 'permanent' } as any });
    toast.success('已应用到当前对话');
  };

  return (
    <>
      {/* 移除多余的排序下拉，统一在 Header 控制；若保留次入口，则使用同一封装组件 */}
      <div className="flex items-center justify-end mb-3 hidden">
        <Select value={ui?.sortBy || 'recent'} onValueChange={(v)=> setSortBy(v as any)}>
          <SelectTrigger data-size="sm"><SelectValue placeholder="排序" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="recent">按最近更新</SelectItem>
            <SelectItem value="frequency">按使用次数</SelectItem>
            <SelectItem value="name">按名称</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4 auto-rows-fr">
        {prompts.map((prompt) => (
          <PromptCard 
            key={prompt.id} 
            {...prompt} 
            onToggleFavorite={handleToggleFavorite}
            onApply={(id)=>{applyToCurrentChat(id);}}
            onEdit={handleEdit}
            onDelete={handleDelete}
          />
        ))}
      </div>
      <PromptEditorDialog
        open={editorOpen}
        onOpenChange={(o)=>{ setEditorOpen(o); if(!o) setEditingId(null); }}
        initial={editingInitial}
        onSubmit={(data)=>{
          if (!editingId) return;
          updatePrompt(editingId, {
            name: data.name,
            description: data.description,
            content: data.content,
            tags: data.tags,
            languages: data.languages,
            modelHints: data.modelHints,
            variables: data.variables,
            favorite: data.favorite,
            shortcuts: (data as any).shortcuts,
          } as any);
          toast.success('已保存修改');
        }}
      />
      <AlertDialog open={!!pendingDeleteId} onOpenChange={(o)=>{ if(!o) setPendingDeleteId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除提示词？</AlertDialogTitle>
            <AlertDialogDescription>
              删除后无法恢复，相关使用统计将一并移除。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={()=>setPendingDeleteId(null)}>取消</AlertDialogCancel>
            <AlertDialogAction onClick={()=>{ if(pendingDeleteId){ deletePrompt(pendingDeleteId); toast.success('已删除提示词'); setPendingDeleteId(null);} }}>删除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
} 