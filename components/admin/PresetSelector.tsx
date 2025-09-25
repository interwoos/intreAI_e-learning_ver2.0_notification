"use client";

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import { Trash2, AlertTriangle } from 'lucide-react';
import { PromptPreset } from '@/hooks/usePromptPresets';

interface PresetSelectorProps {
  presets: PromptPreset[];
  selectedPresetId: string | null;
  isLoading: boolean;
  onSelect: (presetId: string) => void;
  onDelete: (presetId: string) => Promise<boolean>;
}

export function PresetSelector({
  presets,
  selectedPresetId,
  isLoading,
  onSelect,
  onDelete
}: PresetSelectorProps) {
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async () => {
    if (!deleteConfirmId) return;

    setIsDeleting(true);
    const success = await onDelete(deleteConfirmId);
    
    if (success) {
      setDeleteConfirmId(null);
    }
    setIsDeleting(false);
  };

  const selectedPreset = presets.find(p => p.id === selectedPresetId);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <Select 
            value={selectedPresetId || ''} 
            onValueChange={onSelect}
            disabled={isLoading}
          >
            <SelectTrigger className="focus:ring-custom-dark-gray">
              <SelectValue placeholder="プリセットを選択してください" />
            </SelectTrigger>
            <SelectContent>
              {presets.map((preset) => (
                <SelectItem key={preset.id} value={preset.id}>
                  <div className="flex items-center justify-between w-full">
                    <span className="truncate">{preset.name}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-4 w-4 p-0 ml-2 hover:bg-red-100 opacity-0 group-hover:opacity-100"
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
        </div>

        {selectedPreset && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setDeleteConfirmId(selectedPreset.id)}
            className="text-red-500 hover:text-red-700 hover:bg-red-50"
            disabled={isLoading}
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        )}
      </div>

      {/* 選択中のプリセット表示 */}
      {selectedPreset && (
        <div className="px-3 py-2 bg-blue-50 border border-blue-200 rounded-md">
          <div className="flex items-center gap-2 text-sm">
            <div className="w-2 h-2 bg-blue-600 rounded-full"></div>
            <span className="text-blue-800 font-medium">
              「{selectedPreset.name}」を使用中
            </span>
            <span className="text-blue-600 text-xs">
              {new Date(selectedPreset.created_at).toLocaleDateString('ja-JP')}
            </span>
          </div>
        </div>
      )}

      {/* 削除確認ダイアログ */}
      <AlertDialog open={!!deleteConfirmId} onOpenChange={() => !isDeleting && setDeleteConfirmId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-red-500" />
              プリセットを削除しますか？
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>この操作は取り消せません。</p>
              <p className="font-medium">
                プリセット「{presets.find(p => p.id === deleteConfirmId)?.name}」を削除してもよろしいですか？
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>
              キャンセル
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {isDeleting ? (
                <>
                  <div className="w-4 h-4 mr-2 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  削除中...
                </>
              ) : (
                '削除する'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}