import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';

// 型定義
export interface PromptPreset {
  id: string;
  name: string;
  ai_name: string;
  ai_description: string;
  initial_message: string;
  system_instruction: string;
  knowledge_base: string;
  created_at: string;
}

export interface PromptData {
  ai_name: string;
  ai_description: string;
  initial_message: string;
  system_instruction: string;
  knowledge_base: string;
}

export function usePromptPresets() {
  const [presets, setPresets] = useState<PromptPreset[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // プリセット一覧の読み込み
  const loadPresets = useCallback(async () => {
    try {
      setIsLoading(true);
      const { data, error } = await supabase
        .from('prompt_presets')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setPresets(data || []);
    } catch (error) {
      console.error('プリセット読み込みエラー:', error);
      toast.error('プリセットの読み込みに失敗しました');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // 初回読み込み
  useEffect(() => {
    loadPresets();
  }, [loadPresets]);

  // プリセット保存
  const savePreset = useCallback(async (nameOrId: string, promptData: PromptData): Promise<boolean> => {
    // nameOrId が既存プリセットのIDかどうかを判定
    const existingPreset = presets.find(p => p.id === nameOrId);
    const isUpdate = !!existingPreset;
    
    if (!isUpdate) {
      // 新規作成の場合
      if (!nameOrId.trim()) {
        toast.error('プリセット名を入力してください');
        return false;
      }

      // 重複チェック
      if (presets.some(p => p.name === nameOrId.trim())) {
        toast.error('同じ名前のプリセットが既に存在します');
        return false;
      }
    }

    try {
      setIsSaving(true);
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        toast.error('認証が必要です');
        return false;
      }

      let data, error;
      
      if (isUpdate) {
        // 上書き保存
        const result = await supabase
          .from('prompt_presets')
          .update({
            ...promptData,
            updated_at: new Date().toISOString()
          })
          .eq('id', nameOrId)
          .select()
          .single();
        data = result.data;
        error = result.error;
      } else {
        // 新規作成
        const result = await supabase
          .from('prompt_presets')
          .insert({
            user_id: user.id,
            name: nameOrId.trim(),
            ...promptData
          })
          .select()
          .single();
        data = result.data;
        error = result.error;
      }

      if (error) throw error;

      // ローカル状態を更新
      if (isUpdate) {
        setPresets(prev => prev.map(p => p.id === nameOrId ? data : p));
        toast.success(`プリセット「${existingPreset.name}」を上書きしました`);
      } else {
        setPresets(prev => [data, ...prev]);
        toast.success('プリセットを保存しました');
      }
      return true;
    } catch (error) {
      console.error('プリセット保存エラー:', error);
      toast.error(isUpdate ? 'プリセットの上書きに失敗しました' : 'プリセットの保存に失敗しました');
      return false;
    } finally {
      setIsSaving(false);
    }
  }, [presets]);

  // プリセット削除
  const deletePreset = useCallback(async (presetId: string): Promise<boolean> => {
    try {
      setIsLoading(true);
      const { error } = await supabase
        .from('prompt_presets')
        .delete()
        .eq('id', presetId);

      if (error) throw error;

      // ローカル状態を更新
      setPresets(prev => prev.filter(p => p.id !== presetId));
      toast.success('プリセットを削除しました');
      return true;
    } catch (error) {
      console.error('プリセット削除エラー:', error);
      toast.error('プリセットの削除に失敗しました');
      return false;
    } finally {
      setIsLoading(false);
    }
  }, []);

  // プリセットをPromptDataに変換
  const getPromptData = useCallback((preset: PromptPreset): PromptData => ({
    ai_name: preset.ai_name,
    ai_description: preset.ai_description,
    initial_message: preset.initial_message,
    system_instruction: preset.system_instruction,
    knowledge_base: preset.knowledge_base
  }), []);

  return {
    presets,
    isLoading,
    isSaving,
    loadPresets,
    savePreset,
    updatePreset: savePreset, // 上書き保存用（同じ処理）
    deletePreset,
    getPromptData
  };
}