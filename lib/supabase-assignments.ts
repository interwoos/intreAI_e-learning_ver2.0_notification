// 事前課題管理・プリセット機能のSupabaseサービス層
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

// チャットプロンプトプリセット用の型定義
export interface ChatPromptPreset {
  id: string;
  user_id: string;
  name: string;
  ai_name: string;
  ai_description: string;
  initial_message: string;
  system_instruction: string;
  knowledge_base: string;
  created_at: string;
  updated_at: string;
}

/**
 * 事前課題データの取得
 */
export async function getPreAssignments(termId: string): Promise<PreAssignment[]> {
  const { data, error } = await supabase
    .from('pre_assignments')
    .select('*')
    .eq('term_id', termId)
    .order('assignment_id');

  if (error) {
    console.error('事前課題取得エラー:', error);
    throw error;
  }

  return data || [];
}

/**
 * 事前課題データの単一フィールド更新（API Route経由）
 */
export async function updatePreAssignmentField(
  termId: string,
  assignmentId: string,
  field: keyof Omit<PreAssignment, 'term_id' | 'assignment_id' | 'created_at' | 'updated_at'>,
  value: string
): Promise<void> {
  try {
    const response = await fetch('/api/pre-assignments/update-field', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        termId,
        assignmentId,
        field,
        value
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'フィールド更新に失敗しました');
    }

    const result = await response.json();
    if (!result.success) {
      throw new Error(result.error || 'フィールド更新に失敗しました');
    }

    console.log(`✅ 事前課題フィールド更新完了: ${assignmentId}.${field}`);
  } catch (error) {
    console.error('❌ 事前課題フィールド更新失敗:', error);
    throw error;
  }
}

/**
 * 事前課題データの一括更新（API Route経由）
 */
export async function updatePreAssignment(
  termId: string,
  assignmentId: string,
  data: Partial<Omit<PreAssignment, 'term_id' | 'assignment_id' | 'created_at' | 'updated_at'>>
): Promise<void> {
  try {
    const response = await fetch('/api/pre-assignments/update', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        termId,
        assignmentId,
        data
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || '一括更新に失敗しました');
    }

    const result = await response.json();
    if (!result.success) {
      throw new Error(result.error || '一括更新に失敗しました');
    }

    console.log(`✅ 事前課題一括更新完了: ${assignmentId}`);
  } catch (error) {
    console.error('❌ 事前課題一括更新失敗:', error);
    throw error;
  }
}

/**
 * プリセット一覧の取得
 */
export async function getPromptPresets(): Promise<ChatPromptPreset[]> {
  const { data, error } = await supabase
    .from('prompt_presets')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('プリセット取得エラー:', error);
    throw error;
  }

  return data || [];
}

/**
 * プリセットの保存
 */
export async function savePromptPreset(
  name: string,
  promptData: {
    ai_name: string;
    ai_description: string;
    initial_message: string;
    system_instruction: string;
    knowledge_base: string;
  }
): Promise<ChatPromptPreset> {
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    throw new Error('認証が必要です');
  }

  const { data, error } = await supabase
    .from('prompt_presets')
    .insert({
      user_id: user.id,
      name,
      ...promptData
    })
    .select()
    .single();

  if (error) {
    console.error('プリセット保存エラー:', error);
    throw error;
  }

  return data;
}

/**
 * プリセットの削除
 */
export async function deletePromptPreset(presetId: string): Promise<void> {
  const { error } = await supabase
    .from('prompt_presets')
    .delete()
    .eq('id', presetId);

  if (error) {
    console.error('プリセット削除エラー:', error);
    throw error;
  }
}

/**
 * 期の初期化時に事前課題レコードを作成
 */
export async function initializePreAssignmentsForTerm(termId: string): Promise<void> {
  console.log('📋 事前課題初期化開始:', termId);
  
  try {
    const response = await fetch('/api/initialize-pre-assignments', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ termId }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || '事前課題初期化に失敗しました');
    }

    const result = await response.json();
    if (!result.success) {
      throw new Error(result.error || '事前課題初期化に失敗しました');
    }

    console.log('✅ 事前課題初期化API呼び出し成功');
  } catch (error) {
    console.error('❌ 事前課題初期化例外:', error);
    throw error;
  }
}