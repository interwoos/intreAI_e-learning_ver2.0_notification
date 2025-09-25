// 事前課題管理用カスタムフック
import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { getPreAssignments } from '@/lib/supabase-assignments';
import { supabase } from '@/lib/supabase';

// 型定義
export interface PreAssignment {
  term_id: string;
  assignment_id: string;
  title: string;
  edit_title: string;
  description: string;
  ai_name: string;
  ai_description: string;
  initial_message: string;
  system_instruction: string;
  knowledge_base: string;
  created_at: string;
  updated_at: string;
}

export function usePreAssignments(termId: string) {
  const [assignments, setAssignments] = useState<Record<string, PreAssignment>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // 事前課題データの読み込み
  const loadAssignments = useCallback(async () => {
    if (!termId) return;

    try {
      setIsLoading(true);
      const data = await getPreAssignments(termId);
      
      const assignmentMap: Record<string, PreAssignment> = {};
      data.forEach(assignment => {
        assignmentMap[assignment.assignment_id] = assignment;
      });
      
      setAssignments(assignmentMap);
    } catch (error) {
      console.error('事前課題読み込みエラー:', error);
      toast.error('事前課題の読み込みに失敗しました');
    } finally {
      setIsLoading(false);
    }
  }, [termId]);

  // 初回読み込み
  useEffect(() => {
    loadAssignments();
  }, [loadAssignments]);

  // フィールド更新（リアルタイム保存、プリセット機能なし）
  const updateField = useCallback(async (
    assignmentId: string,
    field: keyof Omit<PreAssignment, 'term_id' | 'assignment_id' | 'created_at' | 'updated_at'>,
    value: string
  ) => {
    // ローカル状態を即座に更新
    setAssignments(prev => ({
      ...prev,
      [assignmentId]: {
        ...prev[assignmentId],
        [field]: value
      }
    }));

    // 未保存変更フラグのみ設定（自動保存は無効化）
    setHasUnsavedChanges(true);
  }, [termId]);

  // 特定の課題データを取得
  const getAssignment = useCallback((assignmentId: string): PreAssignment | null => {
    return assignments[assignmentId] || null;
  }, [assignments]);

  // 手動保存関数を追加
  const saveChanges = useCallback(async (assignmentId: string) => {
    const assignment = assignments[assignmentId];
    if (!assignment) return false;

    try {
      // 直接Supabaseクライアント経由で保存
      const { error } = await supabase
        .from('pre_assignments')
        .upsert({
          term_id: termId,
          assignment_id: assignmentId,
          edit_title: assignment.edit_title,
          description: assignment.description,
          ai_name: assignment.ai_name,
          ai_description: assignment.ai_description,
          initial_message: assignment.initial_message,
          system_instruction: assignment.system_instruction,
          knowledge_base: assignment.knowledge_base,
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'term_id,assignment_id'
        });

      if (error) {
        console.error('❌ 事前課題保存エラー:', error);
        throw new Error(`保存に失敗しました: ${error.message}`);
      }

      setHasUnsavedChanges(false);
      toast.success('保存しました');
      console.log(`✅ 事前課題保存完了: ${assignmentId}`);
      return true;
    } catch (error) {
      console.error('❌ 事前課題保存例外:', error);
      toast.error('保存に失敗しました');
      return false;
    }
  }, [termId, assignments]);

  return {
    assignments,
    isLoading,
    hasUnsavedChanges,
    updateField,
    getAssignment,
    loadAssignments,
    saveChanges
  };
}