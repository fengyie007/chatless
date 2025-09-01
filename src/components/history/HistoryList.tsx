'use client';

import HistoryCard from './HistoryCard';
import { useEffect, useMemo, useCallback, useState, useRef } from 'react';
import { useHistoryStore } from '@/store/historyStore';
import { Loader2, Search, Archive } from 'lucide-react';
import { memo } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { downloadService } from '@/lib/utils/downloadService';
import { toast } from '@/components/ui/sonner';

export default function HistoryList() {
  const {
    groupedHistory,
    isLoading,
    selectedItems,
    loadGroupedHistory,
    loadStats,
    toggleSelection,
    toggleImportant,
    toggleFavorite,
    deleteItem,
    exportItem,
    searchQuery
  } = useHistoryStore();

  const router = useRouter();

  // 删除确认相关状态
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<{ id: string; title: string } | null>(null);

  // 组件挂载时加载数据 - 同时加载分组历史和统计信息
  useEffect(() => {
    const loadData = async () => {
      await Promise.all([
        loadGroupedHistory(),
        loadStats()
      ]);
    };
    
    loadData();
  }, [loadGroupedHistory, loadStats]);

  // 优化的事件处理函数 - 使用 useCallback 避免不必要的重渲染
  const handleSelectChange = useCallback((id: string, selected: boolean) => {
    toggleSelection(id);
  }, [toggleSelection]);

  const handleToggleImportant = useCallback(async (id: string) => {
    await toggleImportant(id);
  }, [toggleImportant]);

  const handleToggleFavorite = useCallback(async (id: string) => {
    await toggleFavorite(id);
  }, [toggleFavorite]);

  // 实现查看对话功能 - 导航到聊天页面并加载指定对话
  const handleView = useCallback((id: string) => {
    console.log('查看对话:', id);
    // 导航到聊天页面，传递会话ID作为查询参数
    router.push(`/chat?conversation=${id}&mode=view`);
  }, [router]);

  // 实现继续对话功能 - 导航到聊天页面并设置为可编辑模式
  const handleContinue = useCallback((id: string) => {
    console.log('继续对话:', id);
    // 导航到聊天页面，传递会话ID并设置为编辑模式
    router.push(`/chat?conversation=${id}&mode=continue`);
  }, [router]);

  const handleDelete = useCallback(async (id: string) => {
    // 找到要删除的对话信息
    const conversation = groupedHistory.flatMap(group => group.items).find(item => item.id === id);
    if (conversation) {
      setItemToDelete({ id, title: conversation.title });
      setDeleteDialogOpen(true);
    }
  }, [groupedHistory]);

  // 确认删除操作
  const handleConfirmDelete = async () => {
    if (itemToDelete) {
      await deleteItem(itemToDelete.id);
    }
    setDeleteDialogOpen(false);
    setItemToDelete(null);
  };

  // 取消删除
  const handleCancelDelete = () => {
    setDeleteDialogOpen(false);
    setItemToDelete(null);
  };

  const handleExport = useCallback(async (id: string) => {
    try {
      // 默认导出为 Markdown 格式
      const content = await exportItem(id, 'markdown');
      
      if (content) {
        const fileName = `chatless-conversation-${id}.md`;
        const success = await downloadService.downloadMarkdown(fileName, content);
        
        if (success) {
          toast.success('对话已成功导出');
        }
      } else {
        toast.error('导出失败，请稍后重试');
      }
    } catch (error) {
      console.error('导出失败:', error);
      toast.error('导出失败，请稍后重试');
    }
  }, [exportItem]);

  // 计算总对话数
  const totalConversations = useMemo(() => {
    return groupedHistory.reduce((total, group) => total + group.items.length, 0);
  }, [groupedHistory]);

  // Loading indicator with delay to avoid flash
  const [showLoading, setShowLoading] = useState(false);
  useEffect(() => {
    let timer: any;
    if (isLoading) {
      timer = setTimeout(() => setShowLoading(true), 150); // show after 150ms
    } else {
      setShowLoading(false);
    }
    return () => clearTimeout(timer);
  }, [isLoading]);

  // 加载状态
  if (showLoading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-50/50">
        <div className="flex items-center gap-3 text-gray-500">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span className="text-sm">加载历史记录中...</span>
        </div>
      </div>
    );
  }

  // 空状态
  if (groupedHistory.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-50/50 dark:bg-gray-800/40">
        <div className="text-center text-gray-500 max-w-md">
          {searchQuery ? (
            <>
              <Search className="w-12 h-12 mx-auto mb-4 text-gray-300" />
              <div className="text-lg font-medium mb-2">未找到匹配的对话</div>
              <div className="text-sm text-gray-400">
                尝试使用不同的关键词或调整筛选条件
              </div>
            </>
          ) : (
            <>
              <Archive className="w-12 h-12 mx-auto mb-4 text-gray-300" />
              <div className="text-lg font-medium mb-2">暂无历史记录</div>
              <div className="text-sm text-gray-400">
                开始一个新对话来创建历史记录
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="flex-1 bg-white dark:bg-gray-900 flex flex-col">
        {/* 统计信息条 - 更清晰的信息显示 */}
        <div className="px-4 py-2 bg-gray-50 dark:bg-gray-800/70 border-b border-gray-100 dark:border-gray-700 text-xs text-gray-600 dark:text-gray-300 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <span className="font-medium">
              共 {totalConversations} 个对话
            </span>
            <span className="text-gray-400">
              {groupedHistory.length} 个分组
            </span>
          </div>
          {selectedItems.length > 0 && (
            <span className="text-blue-600 font-medium bg-blue-50 px-2 py-1 rounded">
              已选择 {selectedItems.length} 个
            </span>
          )}
        </div>
        
        {/* 优化的滚动列表 */}
        <div className="flex-1 overflow-y-auto history-scroll">
          {groupedHistory.map((group) => (
            <div key={group.date} className="mb-1">
              {/* 分组标题 - 更清晰的设计 */}
              <div className="flex items-center gap-3 px-4 py-2 bg-gray-50 dark:bg-gray-800/60 history-sticky-header border-b border-gray-100 dark:border-gray-700">
                <div className="text-sm font-semibold text-gray-700">
                  {group.displayName}
                </div>
                <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700/70"></div>
                <div className="text-xs text-gray-500 dark:text-gray-300 bg-white dark:bg-gray-800/60 px-2 py-0.5 rounded border border-gray-200 dark:border-gray-700">
                  {group.items.length} 个
                </div>
              </div>
              
              {/* 对话列表 - 改进间距和布局 */}
              <div className="px-4 py-2 space-y-2">
                {group.items.map((item) => (
                  <HistoryCard 
                    key={item.id} 
                    {...item} 
                    isSelected={selectedItems.includes(item.id)}
                    onSelectChange={handleSelectChange}
                    onToggleImportant={handleToggleImportant}
                    onToggleFavorite={handleToggleFavorite}
                    onView={handleView}
                    onContinue={handleContinue}
                    onDelete={handleDelete}
                    onExport={handleExport}
                  />
                ))}
              </div>
            </div>
          ))}
          
          {/* 底部留白 */}
          <div className="h-6"></div>
        </div>
      </div>

      {/* 删除确认对话框 */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          {/* 右上角关闭按钮 */}
          <button
            onClick={() => setDeleteDialogOpen(false)}
            className="absolute top-4 right-4 p-1 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 transition-all duration-200 cursor-pointer"
            aria-label="关闭"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          
          <AlertDialogHeader className="pr-8">
            <AlertDialogTitle>确认删除</AlertDialogTitle>
            <AlertDialogDescription>
              确定要删除会话 "{itemToDelete?.title}" 吗？此操作无法撤销。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleCancelDelete}>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDelete}>
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
} 