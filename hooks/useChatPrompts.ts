import { useState, useCallback, useMemo } from 'react';
import { ChatPromptData, ChatPromptPreset, ChatPromptState } from '@/types/chat-prompt';
import { toast } from 'sonner';

// デフォルトのプロンプトデータ
const defaultPromptData: ChatPromptData = {
  aiName: '',
  description: '',
  starterMessage: '',
  systemInstruction: '',
  knowledgeBase: ''
};

// チャットプロンプト用初期プリセット（例）
const initialPresets: ChatPromptPreset[] = [
  {
    id: 'preset-1',
    name: '感想文サポーター',
    data: {
      aiName: '感想文サポーター',
      description: 'キーワードやメモから感想文を書くためのアシストAI',
      starterMessage: '動画を見た感想やキーワードを教えてください。',
      systemInstruction: 'あなたは受講生の感想文作成をサポートするAIです。受講生が提供するキーワードや断片的な感想から、構造化された感想文の作成を支援してください。',
      knowledgeBase: '企業内起業、新規事業開発、イノベーション創出に関する基礎知識'
    },
    createdAt: new Date()
  },
  {
    id: 'preset-2',
    name: 'アイデア発想支援',
    data: {
      aiName: 'アイデア発想支援AI',
      description: '新規事業アイデアの発想と整理をサポート',
      starterMessage: 'どのような事業アイデアについて考えていますか？',
      systemInstruction: 'あなたは新規事業アイデアの発想と整理を支援するAIです。受講生のアイデアを聞き、質問を通じてより具体的で実現可能なアイデアに発展させてください。',
      knowledgeBase: 'ビジネスモデル、市場分析、競合分析、収益モデルに関する知識'
    },
    createdAt: new Date()
  }
];

export function useChatPrompts(taskId: string) {
  // タスクIDごとの状態管理
  const [promptStates, setPromptStates] = useState<Record<string, ChatPromptState>>({});
  const [isLoading, setIsLoading] = useState(false);

  // 現在のタスクの状態を取得
  const currentState = useMemo(() => {
    return promptStates[taskId] || {
      currentData: { ...defaultPromptData },
      presets: [...initialPresets],
      selectedPresetId: null,
      isModified: false
    };
  }, [promptStates, taskId]);

  // チャットプロンプトプリセット一覧の読み込み
  const loadPresets = useCallback(async () => {
    try {
      setIsLoading(true);
      // TODO: 実際のAPI実装時にここを修正
      const presets: any[] = [];
      
      const convertedPresets: ChatPromptPreset[] = presets.map(preset => ({
        id: preset.id,
        name: preset.name,
        data: {
          aiName: preset.ai_name,
          description: preset.ai_description,
          starterMessage: preset.initial_message,
          systemInstruction: preset.system_instruction,
          knowledgeBase: preset.knowledge_base
        },
        createdAt: new Date(preset.created_at)
      }));

      updateCurrentState({
        presets: convertedPresets
      });
    } catch (error) {
      console.error('プリセット読み込みエラー:', error);
      toast.error('プリセットの読み込みに失敗しました');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // 状態更新のヘルパー関数
  const updateCurrentState = useCallback((updates: Partial<ChatPromptState>) => {
    setPromptStates(prev => ({
      ...prev,
      [taskId]: {
        ...currentState,
        ...updates
      }
    }));
  }, [taskId, currentState]);

  // フィールド更新
  const updateField = useCallback((field: keyof ChatPromptData, value: string) => {
    const newData = {
      ...currentState.currentData,
      [field]: value
    };
    
    updateCurrentState({
      currentData: newData,
      isModified: true,
      selectedPresetId: null // 編集時はプリセット選択を解除
    });
  }, [currentState.currentData, updateCurrentState]);

  // チャットプロンプトプリセット保存
  const savePreset = useCallback(async (presetName: string) => {
    if (!presetName.trim()) return false;

    try {
      setIsLoading(true);
      
      // TODO: 実際のAPI実装時にここを修正
      const savedPreset = {
        id: `preset-${Date.now()}`,
        name: presetName.trim(),
        created_at: new Date().toISOString()
      };

      const newPreset: ChatPromptPreset = {
        id: savedPreset.id,
        name: savedPreset.name,
        data: { ...currentState.currentData },
        createdAt: new Date(savedPreset.created_at)
      };

      const updatedPresets = [...currentState.presets, newPreset];
      
      updateCurrentState({
        presets: updatedPresets,
        selectedPresetId: newPreset.id,
        isModified: false
      });

      toast.success('プリセットを保存しました');
      return true;
    } catch (error) {
      console.error('プリセット保存エラー:', error);
      toast.error('プリセットの保存に失敗しました');
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [currentState.currentData, currentState.presets, updateCurrentState]);

  // プリセット読み込み
  const loadPreset = useCallback((presetId: string) => {
    const preset = currentState.presets.find(p => p.id === presetId);
    if (!preset) return false;

    updateCurrentState({
      currentData: { ...preset.data },
      selectedPresetId: presetId,
      isModified: false
    });

    return true;
  }, [currentState.presets, updateCurrentState]);

  // チャットプロンプトプリセット削除
  const deletePreset = useCallback(async (presetId: string) => {
    try {
      setIsLoading(true);
      
      // TODO: 実際のAPI実装時にここを修正
      // await deleteChatPromptPreset(presetId);
      
      const updatedPresets = currentState.presets.filter(p => p.id !== presetId);
      const newSelectedId = currentState.selectedPresetId === presetId ? null : currentState.selectedPresetId;
      
      updateCurrentState({
        presets: updatedPresets,
        selectedPresetId: newSelectedId
      });

      toast.success('プリセットを削除しました');
      return true;
    } catch (error) {
      console.error('プリセット削除エラー:', error);
      toast.error('プリセットの削除に失敗しました');
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [currentState.presets, currentState.selectedPresetId, updateCurrentState]);

  // データリセット

  // プレビュー用データ生成
  const getPreviewData = useCallback(() => {
    return {
      taskId,
      ...currentState.currentData,
      hasContent: Object.values(currentState.currentData).some(value => value.trim() !== '')
    };
  }, [taskId, currentState.currentData]);

  return {
    // 状態
    currentData: currentState.currentData,
    presets: currentState.presets,
    selectedPresetId: currentState.selectedPresetId,
    isModified: currentState.isModified,
    isLoading,
    
    // アクション
    updateField,
    savePreset,
    loadPreset,
    deletePreset,
    getPreviewData,
    loadPresets
  };
}