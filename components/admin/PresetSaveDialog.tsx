"use client";

import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Save } from 'lucide-react';
import { PromptData, PromptPreset } from '@/hooks/usePromptPresets';

interface PresetSaveDialogProps {
  promptData: PromptData;
  presets: PromptPreset[];
  isSaving: boolean;
  onSave: (name: string, promptData: PromptData) => Promise<boolean>;
  onUpdate: (presetId: string, promptData: PromptData) => Promise<boolean>;
  disabled?: boolean;
}

export function PresetSaveDialog({
  promptData,
  presets,
  isSaving,
  onSave,
  onUpdate,
  disabled = false
}: PresetSaveDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [presetName, setPresetName] = useState('');
  const [saveMode, setSaveMode] = useState<'create' | 'overwrite'>('create');
  const [selectedPresetId, setSelectedPresetId] = useState<string>('');

  const handleSave = async () => {
    let success = false;
    
    if (saveMode === 'create') {
      success = await onSave(presetName, promptData);
    } else {
      success = await onUpdate(selectedPresetId, promptData);
    }
    
    if (success) {
      resetForm();
      setIsOpen(false);
    }
  };

  const resetForm = () => {
    setPresetName('');
    setSaveMode('create');
    setSelectedPresetId('');
  };

  const handleOpenChange = (open: boolean) => {
    if (!isSaving) {
      setIsOpen(open);
      if (!open) {
        resetForm();
      }
    }
  };

  // プロンプトデータが空の場合は無効化
  const hasContent = Object.values(promptData).some(value => value.trim() !== '');
  
  // 保存可能かどうかの判定
  const canSave = useMemo(() => {
    if (saveMode === 'create') {
      return presetName.trim() !== '';
    } else {
      return selectedPresetId !== '';
    }
  }, [saveMode, presetName, selectedPresetId]);

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="flex items-center gap-2 border-custom-dark-gray text-custom-dark-gray hover:bg-custom-dark-gray hover:text-white"
          disabled={disabled || !hasContent}
        >
          <Save className="w-4 h-4" />
          プリセット保存
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>プリセットを保存</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          {/* 保存モード選択 */}
          <div className="space-y-3">
            <label className="text-sm font-medium text-custom-black">
              保存方法を選択
            </label>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="saveMode"
                  value="create"
                  checked={saveMode === 'create'}
                  onChange={(e) => setSaveMode(e.target.value as 'create' | 'overwrite')}
                  disabled={isSaving}
                />
                <span className="text-sm">新規プリセット作成</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="saveMode"
                  value="overwrite"
                  checked={saveMode === 'overwrite'}
                  onChange={(e) => setSaveMode(e.target.value as 'create' | 'overwrite')}
                  disabled={isSaving || presets.length === 0}
                />
                <span className="text-sm">既存プリセット上書き</span>
              </label>
            </div>
          </div>

          {/* 新規作成モード */}
          {saveMode === 'create' && (
          <div className="space-y-2">
            <label className="text-sm font-medium text-custom-black">
              プリセット名 <span className="text-red-500">*</span>
            </label>
            <Input
              value={presetName}
              onChange={(e) => setPresetName(e.target.value)}
              placeholder="例: 感想文サポーター、アイデア発想支援"
              className="focus:ring-custom-dark-gray"
              disabled={isSaving}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault(); // Enterキーでの保存を無効化
                }
              }}
            />
            <p className="text-xs text-gray-500">
              わかりやすい名前を付けてください
            </p>
          </div>
          )}

          {/* 上書き保存モード */}
          {saveMode === 'overwrite' && (
            <div className="space-y-2">
              <label className="text-sm font-medium text-custom-black">
                上書きするプリセットを選択 <span className="text-red-500">*</span>
              </label>
              <Select 
                value={selectedPresetId} 
                onValueChange={setSelectedPresetId}
                disabled={isSaving}
              >
                <SelectTrigger className="focus:ring-custom-dark-gray">
                  <SelectValue placeholder="プリセットを選択してください" />
                </SelectTrigger>
                <SelectContent>
                  {presets.map((preset) => (
                    <SelectItem key={preset.id} value={preset.id}>
                      {preset.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-red-500">
                選択したプリセットの内容が現在の入力内容で上書きされます
              </p>
            </div>
          )}

          {/* プレビュー情報 */}
          <div className="p-3 bg-gray-50 rounded-md space-y-2">
            <p className="text-xs font-medium text-gray-700">保存される内容:</p>
            <div className="text-xs text-gray-600 space-y-1">
              <div>AI名: {promptData.ai_name || '（未設定）'}</div>
              <div>説明: {promptData.ai_description || '（未設定）'}</div>
              <div>開始メッセージ: {promptData.initial_message ? '設定済み' : '（未設定）'}</div>
              <div>システム指示: {promptData.system_instruction ? '設定済み' : '（未設定）'}</div>
              <div>知識ベース: {promptData.knowledge_base ? '設定済み' : '（未設定）'}</div>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button 
              variant="outline" 
              onClick={() => handleOpenChange(false)}
              disabled={isSaving}
            >
              キャンセル
            </Button>
            <Button 
              onClick={handleSave}
              disabled={!canSave || isSaving}
              className="bg-custom-dark-gray hover:bg-[#2a292a] text-white"
            >
              {isSaving ? (
                <>
                  <div className="w-4 h-4 mr-2 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  {saveMode === 'create' ? '保存中...' : '上書き中...'}
                </>
              ) : (
                <>
                  <Save className="w-4 h-4 mr-2" />
                  {saveMode === 'create' ? '新規保存' : '上書き保存'}
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}