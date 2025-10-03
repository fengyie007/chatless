"use client";

import { useRef, useState, useEffect } from 'react';
import { SelectContent } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Search, Clock, X, SettingsIcon } from 'lucide-react';
import { ModelList } from './ModelList';
import { RecentModelsList } from './RecentModelsList';
import type { ProviderMetadata, ModelMetadata } from '@/lib/metadata/types';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useRouter } from 'next/navigation';

interface ModelSelectContentProps {
  filteredModels: ProviderMetadata[];
  recentModelDetails: { provider: ProviderMetadata, model: ModelMetadata }[];
  globalDefaultModel: string | null;
  currentModelId: string | null;
  currentSelection?: string | null;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  onSetDefault: (e: React.MouseEvent, providerName: string, modelName: string) => void;
  onOpenChange: (open: boolean) => void; // Pass this down to manage focus
  onRefresh: () => void;
  onOpenParameters?: (providerName: string, modelId: string, modelLabel?: string) => void;
}

export function ModelSelectContent({
  filteredModels,
  recentModelDetails,
  globalDefaultModel,
  currentModelId,
  currentSelection,
  searchQuery,
  setSearchQuery,
  onSetDefault,
  onOpenChange,
  onRefresh,
  onOpenParameters,
}: ModelSelectContentProps) {
  const [activeTab, setActiveTab] = useState('all');
  const searchInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  // 当搜索词变化（即用户输入或列表更新）时，确保输入框重新获得焦点，
  // 解决 Radix Select 因自动聚焦选中项导致的偶发失焦问题。
  useEffect(() => {
    searchInputRef.current?.focus();
  }, [searchQuery]);

  function handleToAiSetting () { 
    router.push('/settings?tab=localModels');
  };

  // Focus search input when dropdown opens
  // This logic is now managed by the parent, but we keep the ref
  // The onOpenChange prop handles the focus logic directly in the parent.
  
  const handleFocusCapture = (e: React.FocusEvent) => {
    if (e.target !== searchInputRef.current) {
      searchInputRef.current?.focus();
    }
  };

  return (
    <TooltipProvider delayDuration={150}>
      <SelectContent
        onFocusCapture={handleFocusCapture}
        className="max-h-[600px] w-[520px] p-0 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl border border-slate-300/60 dark:border-slate-600/50 rounded-2xl shadow-2xl"
      >
      {/* 搜索栏 */}
      <div className="sticky top-0 z-10 p-3 bg-gradient-to-b from-white to-slate-50/50 dark:from-slate-900 dark:to-slate-900/80 border-b border-slate-200/60 dark:border-slate-700/50 backdrop-blur-sm">
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
          <input
            ref={searchInputRef}
            type="text"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            placeholder="搜索模型或提供商..."
            className="w-full py-2.5 pl-10 pr-20 border border-slate-300/60 dark:border-slate-600/50 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400/60 bg-white dark:bg-slate-800/60 dark:text-slate-200 transition-all placeholder:text-slate-400/80 shadow-sm"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDownCapture={(e) => {
              // 捕获阶段阻止事件冒泡，彻底隔离 Radix Select 的键盘处理
              e.stopPropagation();
            }}
            onKeyUpCapture={(e) => {
              e.stopPropagation();
            }}
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-11 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700/60 rounded-lg transition-all"
              title="清除搜索"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
            {/* 设置按钮 */}
           
           <button
             onClick={() => handleToAiSetting()}
             title="设置AI模型"
             className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700/60 rounded-lg transition-all"
           >
            <SettingsIcon className="w-4 h-4" />
           </button>
           
         </div>
       </div>

      {/* 标签页 */}
      <Tabs defaultValue="all" value={activeTab} onValueChange={setActiveTab} className="p-3">
        <TabsList className="w-full grid grid-cols-2 mb-3 bg-slate-100/80 dark:bg-slate-800/60 rounded-xl p-1 border border-slate-200/50 dark:border-slate-700/40">
          <TabsTrigger value="all" className="text-sm font-medium rounded-lg data-[state=active]:bg-white dark:data-[state=active]:bg-slate-700/80 data-[state=active]:text-blue-600 dark:data-[state=active]:text-blue-400 data-[state=active]:shadow-sm transition-all">
            全部模型
          </TabsTrigger>
          <TabsTrigger value="recent" className="text-sm font-medium rounded-lg data-[state=active]:bg-white dark:data-[state=active]:bg-slate-700/80 data-[state=active]:text-blue-600 dark:data-[state=active]:text-blue-400 data-[state=active]:shadow-sm transition-all" disabled={filteredModels.length === 0}>
            <Clock className="w-3.5 h-3.5 mr-1.5" />
            最近使用
          </TabsTrigger>
        </TabsList>

        <TabsContent value="all" className="mt-0 space-y-2 max-h-[440px] overflow-y-auto pr-1 custom-scrollbar">
          {filteredModels.length === 0 ? (
            <div className="p-6 text-center">
              <div className="text-sm text-slate-500 dark:text-slate-400">{searchQuery ? '无匹配结果' : '正在加载模型列表...'}</div>
              {searchQuery && <div className="text-xs text-slate-400 dark:text-slate-500 mt-2">尝试使用其他关键词</div>}
            </div>
          ) : (
            <ModelList
              models={filteredModels}
              globalDefaultModel={globalDefaultModel}
              currentModelId={currentModelId}
              currentSelection={currentSelection}
              searchQuery={searchQuery}
              onSetDefault={onSetDefault}
              onOpenParameters={onOpenParameters}
            />
          )}
        </TabsContent>
        <TabsContent value="recent" className="mt-0 space-y-2 max-h-[440px] overflow-y-auto pr-1 custom-scrollbar">
          <RecentModelsList
            recentModelDetails={recentModelDetails}
            globalDefaultModel={globalDefaultModel}
            currentModelId={currentModelId}
            onSetDefault={onSetDefault}
            onOpenParameters={onOpenParameters}
          />
        </TabsContent>
      </Tabs>
      </SelectContent>
    </TooltipProvider>
  );
} 