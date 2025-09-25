"use client";

import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Bug, 
  ChevronDown, 
  ChevronUp, 
  Database, 
  MessageSquare,
  Settings,
  User
} from 'lucide-react';

interface PromptDebugInfo {
  taskId: string;
  source: 'pre_assignments' | 'default' | 'default_empty' | 'default_error';
  systemPrompt: string;
  details: any;
}

interface PromptDebugPanelProps {
  taskId: string;
  className?: string;
}

export function PromptDebugPanel({ taskId, className = '' }: PromptDebugPanelProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [debugInfo, setDebugInfo] = useState<PromptDebugInfo | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const checkPromptImplementation = async () => {
    setIsLoading(true);
    try {
      // 現在のユーザーIDを取得
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setDebugInfo({
          taskId,
          source: 'error',
          systemPrompt: 'デフォルトプロンプト',
          details: { error: 'ユーザーが認証されていません' }
        });
        return;
      }

      const response = await fetch('/api/debug-prompt', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ taskId, userId: user.id }),
      });

      if (response.ok) {
        const data = await response.json();
        setDebugInfo(data);
      }
    } catch (error) {
      console.error('プロンプトデバッグエラー:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const getSourceBadge = (source: string) => {
    switch (source) {
      case 'pre_assignments':
        return <Badge className="bg-green-100 text-green-800">DB設定</Badge>;
      case 'default_empty':
        return <Badge className="bg-yellow-100 text-yellow-800">未設定</Badge>;
      case 'default_error':
        return <Badge className="bg-red-100 text-red-800">エラー</Badge>;
      default:
        return <Badge className="bg-gray-100 text-gray-800">デフォルト</Badge>;
    }
  };

  return (
    <Card className={`p-4 border-dashed border-2 border-gray-300 ${className}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bug className="w-4 h-4 text-gray-600" />
          <span className="text-sm font-medium text-gray-700">
            プロンプト実装確認
          </span>
          <span className="text-xs text-gray-500">({taskId})</span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={checkPromptImplementation}
            disabled={isLoading}
            className="text-xs"
          >
            {isLoading ? '確認中...' : '確認'}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1"
          >
            {isExpanded ? (
              <ChevronUp className="w-4 h-4" />
            ) : (
              <ChevronDown className="w-4 h-4" />
            )}
          </Button>
        </div>
      </div>

      {isExpanded && debugInfo && (
        <div className="mt-4 space-y-3 border-t pt-4">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">プロンプトソース:</span>
            {getSourceBadge(debugInfo.source)}
          </div>

          {debugInfo.source === 'pre_assignments' && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <User className="w-4 h-4 text-blue-600" />
                <span className="text-sm">AI名: {debugInfo.details.ai_name || '未設定'}</span>
              </div>
              <div className="flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-green-600" />
                <span className="text-sm">
                  システム指示: {debugInfo.details.system_instruction_length}文字
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Database className="w-4 h-4 text-purple-600" />
                <span className="text-sm">
                  知識ベース: {debugInfo.details.knowledge_base_length}文字
                </span>
              </div>
            </div>
          )}

          <div className="bg-gray-50 p-3 rounded-md">
            <div className="text-xs font-medium text-gray-700 mb-2">
              実際のシステムプロンプト（最初の200文字）:
            </div>
            <div className="text-xs text-gray-600 font-mono bg-white p-2 rounded border">
              {debugInfo.systemPrompt.substring(0, 200)}
              {debugInfo.systemPrompt.length > 200 && '...'}
            </div>
          </div>

          {debugInfo.details.error && (
            <div className="bg-red-50 p-3 rounded-md">
              <div className="text-xs font-medium text-red-700 mb-1">エラー詳細:</div>
              <div className="text-xs text-red-600">{debugInfo.details.error}</div>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}