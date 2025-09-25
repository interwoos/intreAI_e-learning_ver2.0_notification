"use client";

import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { 
  MessageSquare, 
  Save, 
  Trash2, 
  Eye,
} from 'lucide-react';
import { ChatPromptData, ChatPromptPreset } from '@/types/chat-prompt';

interface ChatPromptEditorProps {
  taskId: string;
  taskTitle: string;
  currentData: ChatPromptData;
  presets: ChatPromptPreset[];
  selectedPresetId: string | null;
  isModified: boolean;
  onFieldChange: (field: keyof ChatPromptData, value: string) => void;
  onSavePreset: (presetName: string) => boolean;
  onLoadPreset: (presetId: string) => boolean;
  onDeletePreset: (presetId: string) => boolean;
  onPreview?: () => void;
}

export function ChatPromptEditor({
  taskId,
  taskTitle,
  currentData,
  presets,
  selectedPresetId,
  isModified,
  onFieldChange,
  onSavePreset,
  onLoadPreset,
  onDeletePreset,
  onPreview
}: ChatPromptEditorProps) {
  const [isSaveDialogOpen, setIsSaveDialogOpen] = useState(false);
  const [presetName, setPresetName] = useState('');
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const handleSavePreset = () => {
    if (onSavePreset(presetName)) {
      setPresetName('');
      setIsSaveDialogOpen(false);
    }
  };

  const handleLoadPreset = (presetId: string) => {
    onLoadPreset(presetId);
  };

  const handleDeletePreset = () => {
    if (deleteConfirmId) {
      onDeletePreset(deleteConfirmId);
      setDeleteConfirmId(null);
    }
  };

  const selectedPreset = presets.find(p => p.id === selectedPresetId);

  return (
    <Card className="flex-1 flex flex-col h-full">
      {/* ヘッダー */}
      <div className="p-4 border-b bg-white">
        {/* タイトル表示 */}
        <div className="flex items-center gap-3 mb-4">
          <MessageSquare className="w-5 h-5 text-custom-dark-gray" />
          <h4 className="text-lg font-semibold text-custom-black">
            {taskId} チャットプロンプト編集
          </h4>
          <span className="text-sm text-custom-red px-2 py-1 bg-red-50 rounded">
            {taskTitle}
          </span>
        </div>
        
        {/* プリセット操作エリア */}
        <div className="flex items-center gap-3 flex-wrap">
          {/* プリセット選択ドロップダウン */}
          <Select value={selectedPresetId || ''} onValueChange={handleLoadPreset}>
            <SelectTrigger className="w-[220px]">
              <SelectValue placeholder="プリセットを選択してください" />
            </SelectTrigger>
            <SelectContent>
              {presets.map((preset) => (
                <SelectItem key={preset.id} value={preset.id}>
                  <div className="flex items-center justify-between w-full">
                    <span>{preset.name}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-4 w-4 p-0 ml-2 hover:bg-red-100"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteConfirmId(preset.id);
                      }}
                    >
                      <Trash2 className="w-3 h-3 text-red-500" />
                    </Button>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* プリセット保存ダイアログ */}
          <Dialog open={isSaveDialogOpen} onOpenChange={setIsSaveDialogOpen}>
            <DialogTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="flex items-center gap-2 border-custom-dark-gray text-custom-dark-gray hover:bg-custom-dark-gray hover:text-white"
                disabled={!Object.values(currentData).some(v => v.trim())}
              >
                <Save className="w-4 h-4" />
                プリセット保存
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>プリセット名を入力してください</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div>
                  <label className="text-sm font-medium text-custom-black">プリセット名</label>
                  <Input
                    value={presetName}
                    onChange={(e) => setPresetName(e.target.value)}
                    placeholder="例: 感想文サポーター、アイデア発想支援"
                    className="mt-1"
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setIsSaveDialogOpen(false)}>
                    キャンセル
                  </Button>
                  <Button 
                    onClick={handleSavePreset}
                    disabled={!presetName.trim()}
                    className="bg-custom-dark-gray hover:bg-[#2a292a] text-white"
                  >
                    保存
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>

          {/* プレビューボタン */}
          {onPreview && (
            <Button
              variant="outline"
              size="sm"
              onClick={onPreview}
              className="flex items-center gap-2 text-gray-600 hover:text-custom-dark-gray"
            >
              <Eye className="w-4 h-4" />
              プレビュー
            </Button>
          )}
        </div>
      </div>

      {/* 選択中のプリセット表示 */}
      {selectedPreset && (
        <div className="px-4 py-3 bg-blue-50 border-b">
          <div className="flex items-center gap-2 text-sm">
            <div className="w-2 h-2 bg-blue-600 rounded-full"></div>
            <span className="text-blue-800">
              プリセット「{selectedPreset.name}」を使用中
            </span>
            {isModified && (
              <span className="text-orange-600">（編集済み）</span>
            )}
          </div>
        </div>
      )}

      {/* フォーム */}
      <div className="flex-1 p-4 space-y-6 overflow-y-auto">
        {/* AI名前 */}
        <div>
          <label className="block text-sm font-medium text-custom-black mb-2">
            AI名前
          </label>
          <Input 
            placeholder="例: 感想文サポーター"
            value={currentData.aiName}
            onChange={(e) => onFieldChange('aiName', e.target.value)}
            className="focus:ring-custom-dark-gray"
          />
        </div>
        
        {/* 説明 */}
        <div>
          <label className="block text-sm font-medium text-custom-black mb-2">
            説明
          </label>
          <Input 
            placeholder="例: キーワードやメモから感想文を書くためのアシストAI"
            value={currentData.description}
            onChange={(e) => onFieldChange('description', e.target.value)}
            className="focus:ring-custom-dark-gray"
          />
        </div>

        {/* 会話の開始者メッセージ */}
        <div>
          <label className="block text-sm font-medium text-custom-black mb-2">
            会話の開始者メッセージ
          </label>
          <Textarea 
            placeholder="例: 動画を見た感想やキーワードを教えてください。"
            className="min-h-[80px] focus:ring-custom-dark-gray"
            value={currentData.starterMessage}
            onChange={(e) => onFieldChange('starterMessage', e.target.value)}
          />
        </div>

        {/* システム指示 */}
        <div>
          <label className="block text-sm font-medium text-custom-black mb-2">
            システム指示
          </label>
          <Textarea 
            placeholder="AIの役割や振る舞いを詳細に記述してください..."
            className="min-h-[200px] font-mono text-sm focus:ring-custom-dark-gray"
            value={currentData.systemInstruction}
            onChange={(e) => onFieldChange('systemInstruction', e.target.value)}
          />
        </div>

        {/* 知識ベース */}
        <div>
          <label className="block text-sm font-medium text-custom-black mb-2">
            知識ベース
          </label>
          <Textarea 
            placeholder="AIが参照する追加の知識や情報を入力してください..."
            className="min-h-[120px] font-mono text-sm focus:ring-custom-dark-gray"
            value={currentData.knowledgeBase}
            onChange={(e) => onFieldChange('knowledgeBase', e.target.value)}
          />
        </div>
      </div>

      {/* プリセット削除確認ダイアログ */}
      <AlertDialog open={!!deleteConfirmId} onOpenChange={() => setDeleteConfirmId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>プリセットを削除しますか？</AlertDialogTitle>
            <AlertDialogDescription>
              この操作は取り消せません。プリセット「
              {presets.find(p => p.id === deleteConfirmId)?.name}
              」を削除してもよろしいですか？
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>キャンセル</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeletePreset}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              削除する
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}