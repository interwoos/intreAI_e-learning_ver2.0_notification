"use client";

import { useState, useEffect, ReactNode } from 'react';
import { cn } from '@/lib/utils';

// タブアイテムの型定義
export interface TabItem {
  id: string;
  title: string;
  content: React.ReactNode;
}

// プロパティの型定義
interface IntegratedTabContentProps {
  tabs: TabItem[];
  defaultActiveTab?: string;
  className?: string;
  onTabChange?: (tabId: string) => void;
  tabsClassName?: string;
  contentClassName?: string;
}

export function IntegratedTabContent({
  tabs,
  defaultActiveTab,
  className = "",
  onTabChange,
  tabsClassName = '',
  contentClassName = ''
}: IntegratedTabContentProps) {
  // アクティブタブの状態管理
  const [activeTab, setActiveTab] = useState<string>(
    defaultActiveTab || tabs[0]?.id || ''
  );

  // defaultActiveTabが変更されたときに追従
  useEffect(() => {
    if (defaultActiveTab && defaultActiveTab !== activeTab) {
      setActiveTab(defaultActiveTab);
      onTabChange?.(defaultActiveTab);
    }
  }, [defaultActiveTab]);

  // タブ変更ハンドラー
  const handleTabChange = (tabId: string) => {
    console.log('📋 IntegratedTabContent: タブ変更:', { from: activeTab, to: tabId });
    setActiveTab(tabId);
    onTabChange?.(tabId);
  };

  // アクティブなコンテンツを取得
  const activeContent = tabs.find(tab => tab.id === activeTab)?.content;

  return (
    <div className={`bg-white border border-gray-200 rounded-xl flex-1 overflow-hidden flex flex-col ${className}`}>
      {/* タブヘッダー部分 */}
      <div className={`flex border-b border-gray-200 ${tabsClassName}`}>
        {tabs.map((tab, index) => {
          const isActive = activeTab === tab.id;
          const isFirst = index === 0;
          
          return (
            <div
              key={tab.id}
              className={`flex-1 relative ${
                isActive
                  ? 'bg-white text-custom-black'
                  : 'bg-gray-200 text-gray-700 hover:text-gray-500 hover:bg-gray-100'
              } ${isFirst ? '' : 'border-l border-gray-200'}`}
            >
              <button
                onClick={() => handleTabChange(tab.id)}
                className="w-full py-3 px-4 text-sm font-medium transition-colors"
              >
                {tab.title}
              </button>
              {/* アクティブタブの下境界線を完全に削除 */}
              {isActive && (
                <div className="absolute bottom-[-1px] left-0 right-0 h-[1px] bg-white z-10" />
              )}
            </div>
          );
        })}
      </div>

      {/* コンテンツ表示部分 */}
      <div className={cn("bg-white border border-gray-200 rounded-b-lg", contentClassName)}>
        {activeContent}
      </div>
    </div>
  );
}