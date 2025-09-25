"use client";

import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { 
  MessageSquare,
  User,
  Info,
  MessageCircle,
  Settings,
  BookOpen,
  Save
} from 'lucide-react';
import { usePreAssignments, PreAssignment } from '@/hooks/usePreAssignments';
import { usePromptPresets, PromptData } from '@/hooks/usePromptPresets';
import { PresetSelector } from './PresetSelector';
import { PresetSaveDialog } from './PresetSaveDialog';

interface PreAssignmentEditorProps {
  termId: string;
  assignmentId: string;
  taskTitle: string;
}

export function PreAssignmentEditor({
  termId,
  assignmentId,
  taskTitle
}: PreAssignmentEditorProps) {
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null);
  const {
    isLoading,
    hasUnsavedChanges,
    updateField,
    getAssignment,
    saveChanges
  } = usePreAssignments(termId);

  const {
    presets,
    isLoading: presetsLoading,
    savePreset,
    deletePreset,
    getPromptData
  } = usePromptPresets();

  const assignment = getAssignment(assignmentId);

  const handleFieldChange = async (
    field: keyof Omit<PreAssignment, 'term_id' | 'assignment_id' | 'created_at' | 'updated_at'>,
    value: string
  ) => {
    setSelectedPresetId(null); // 編集時はプリセット選択を解除
    await updateField(assignmentId, field, value);
  };

  // プリセット選択時の処理
  const handlePresetSelect = (presetId: string) => {
    const preset = presets.find(p => p.id === presetId);
    if (!preset) return;

    const promptData = getPromptData(preset);
    
    // プリセットデータをフォームに反映（ローカル表示のみ）
    Object.entries(promptData).forEach(([key, value]) => {
      const field = key as keyof Omit<PreAssignment, 'term_id' | 'assignment_id' | 'created_at' | 'updated_at'>;
      handleFieldChange(field, value);
    });

    setSelectedPresetId(presetId);
  };

  // 現在のプロンプトデータを取得
  const getCurrentPromptData = (): PromptData => ({
    ai_name: assignment?.ai_name || '',
    ai_description: assignment?.ai_description || '',
    initial_message: assignment?.initial_message || '',
    system_instruction: assignment?.system_instruction || '',
    knowledge_base: assignment?.knowledge_base || ''
  });


  // 手動保存ハンドラー
  const handleSave = async () => {
    await saveChanges(assignmentId);
  };

  if (isLoading) {
    return (
      <Card className="p-6">
        <div className="flex items-center justify-center py-8">
          <div className="text-gray-500">読み込み中...</div>
        </div>
      </Card>
    );
  }

  if (!assignment) {
    return (
      <Card className="p-6">
        <div className="flex items-center justify-center py-8">
          <div className="text-gray-500">課題データが見つかりません</div>
        </div>
      </Card>
    );
  }

  return (
    <Card className="flex-1 flex flex-col h-full">
      {/* ヘッダー */}
      <div className="p-4 border-b bg-white">
        <div className="flex items-center gap-3">
          <MessageSquare className="w-5 h-5 text-custom-dark-gray" />
          <div>
            <h4 className="text-lg font-semibold text-custom-black">
              チャットプロンプト編集
            </h4>
            <span className="text-sm text-custom-red">
              {taskTitle}
            </span>
          </div>
        </div>
        
        {/* プリセット操作エリア */}
        <div className="mt-4 flex items-center gap-3 flex-wrap">
          <PresetSelector
            presets={presets}
            selectedPresetId={selectedPresetId}
            isLoading={presetsLoading}
            onSelect={handlePresetSelect}
            onDelete={deletePreset}
          />
          
          <PresetSaveDialog
            promptData={getCurrentPromptData()}
            presets={presets}
            isSaving={false}
            onSave={savePreset}
            onUpdate={savePreset} // 同じ関数を使用（内部でINSERT/UPDATE判定）
            disabled={presetsLoading}
          />
        </div>
      </div>

      {/* 未保存変更の警告 */}

      {/* フォーム */}
      <div className="flex-1 p-4 space-y-6 overflow-y-auto">
          <div>
            <label className="block text-sm font-medium text-custom-black mb-2 flex items-center gap-2">
              <User className="w-4 h-4" />
              AI名前
            </label>
            <Input 
              placeholder="例: 感想文サポーター"
              value={assignment.ai_name}
              onChange={(e) => handleFieldChange('ai_name', e.target.value)}
              className="focus:ring-custom-dark-gray"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-custom-black mb-2 flex items-center gap-2">
              <Info className="w-4 h-4" />
              説明
            </label>
            <Input 
              placeholder="例: キーワードやメモから感想文を書くためのアシストAI"
              value={assignment.ai_description}
              onChange={(e) => handleFieldChange('ai_description', e.target.value)}
              className="focus:ring-custom-dark-gray"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-custom-black mb-2 flex items-center gap-2">
              <MessageCircle className="w-4 h-4" />
              会話の開始者メッセージ
            </label>
            <Textarea 
              placeholder="例: 動画を見た感想やキーワードを教えてください。"
              className="min-h-[80px] focus:ring-custom-dark-gray"
              value={assignment.initial_message}
              onChange={(e) => handleFieldChange('initial_message', e.target.value)}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-custom-black mb-2 flex items-center gap-2">
              <Settings className="w-4 h-4" />
              システム指示
            </label>
            <Textarea 
              placeholder="AIの役割や振る舞いを詳細に記述してください..."
              className="min-h-[200px] font-mono text-sm focus:ring-custom-dark-gray"
              value={assignment.system_instruction}
              onChange={(e) => handleFieldChange('system_instruction', e.target.value)}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-custom-black mb-2 flex items-center gap-2">
              <BookOpen className="w-4 h-4" />
              知識ベース
            </label>
            <Textarea 
              placeholder="AIが参照する追加の知識や情報を入力してください..."
              className="min-h-[120px] font-mono text-sm focus:ring-custom-dark-gray"
              value={assignment.knowledge_base}
              onChange={(e) => handleFieldChange('knowledge_base', e.target.value)}
            />
          </div>

        <div className="flex justify-end pt-4">
          <Button 
            onClick={handleSave}
            disabled={!hasUnsavedChanges}
            className={`${
              hasUnsavedChanges 
                ? 'bg-custom-dark-gray hover:bg-[#2a292a] text-white' 
                : 'bg-gray-300 text-gray-500 cursor-not-allowed'
            }`}
          >
            <Save className="w-4 h-4 mr-2" />
            {hasUnsavedChanges ? '変更を保存' : '保存済み'}
          </Button>
        </div>
      </div>
    </Card>
  );
}