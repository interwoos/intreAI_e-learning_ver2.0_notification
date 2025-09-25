"use client";

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
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
import { Card } from '@/components/ui/card';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { 
  Copy, 
  Play, 
  AlertTriangle,
  CheckCircle2,
  Database,
  Video,
  FileText,
  MessageSquare
} from 'lucide-react';

interface Term {
  id: string;
  name: string;
  term_number: number;
}

interface CopyResult {
  lectures: { copied: number; skipped: number };
  videosMeta: { copied: number; skipped: number };
  assignments: { copied: number; skipped: number };
  prompts: { copied: number; skipped: number };
  settings: { copied: number; skipped: number };
}

interface TermImportModalProps {
  targetTermId: string;
  targetTermName: string;
  onImportComplete: () => void;
}

export function TermImportModal({ 
  targetTermId, 
  targetTermName, 
  onImportComplete 
}: TermImportModalProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [terms, setTerms] = useState<Term[]>([]);
  const [sourceTermId, setSourceTermId] = useState<string>('');
  const [isExecuting, setIsExecuting] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [copyResult, setCopyResult] = useState<CopyResult | null>(null);

  // 期一覧を取得
  useEffect(() => {
    const fetchTerms = async () => {
      const { data, error } = await supabase
        .from('terms')
        .select('id, name, term_number')
        .neq('id', targetTermId) // 自分以外の期
        .order('term_number', { ascending: true });

      if (data && !error) {
        setTerms(data);
      }
    };

    if (isOpen) {
      fetchTerms();
    }
  }, [isOpen, targetTermId]);

  // 一発コピー実行
  const handleExecute = async () => {
    setIsExecuting(true);
    try {
      // 認証トークンを取得
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      
      if (sessionError || !session?.access_token) {
        toast.error('認証セッションが無効です。再ログインしてください。');
        return;
      }

      // 全ての項目を有効にしてコピー実行
      const copyOptions = {
        lectures: true,
        videosMeta: true,
        assignments: true,
        prompts: true,
        settings: false,
        storageFiles: false
      };

      const response = await fetch(`/api/terms/${targetTermId}/import`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          sourceTermId,
          copy: copyOptions,
          dryRun: false
        })
      });

      const result = await response.json();
      
      if (result.ok) {
        setCopyResult(result.counts);
        const totalCopied = Object.values(result.counts).reduce(
          (sum: number, item: any) => sum + item.copied, 0
        );
        
        toast.success(`コピーが完了しました（${totalCopied}件）`);
        onImportComplete();
      } else {
        toast.error(result.error || 'コピーに失敗しました');
      }
    } catch (error) {
      console.error('コピー実行エラー:', error);
      toast.error('コピーの実行に失敗しました');
    } finally {
      setIsExecuting(false);
      setShowConfirmDialog(false);
    }
  };

  // モーダルを閉じる
  const handleClose = () => {
    setIsOpen(false);
    setSourceTermId('');
    setCopyResult(null);
  };

  const selectedTerm = terms.find(t => t.id === sourceTermId);
  const canExecute = sourceTermId && !isExecuting;

  return (
    <>
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogTrigger asChild>
          <Button 
            variant="outline" 
            className="flex items-center gap-2 border-custom-dark-gray text-custom-dark-gray hover:bg-custom-dark-gray hover:text-white"
          >
            <Copy className="w-4 h-4" />
            他期からコピー
          </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Copy className="w-5 h-5 text-custom-dark-gray" />
              期間コンテンツの一括コピー
            </DialogTitle>
            <p className="text-sm text-gray-600">
              他の期のコンテンツを「{targetTermName}」に一括コピーします
            </p>
          </DialogHeader>

          <div className="space-y-6 py-4">
            {/* ソース期選択 */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-custom-black">
                コピー元の期を選択
              </label>
              <Select value={sourceTermId} onValueChange={setSourceTermId}>
                <SelectTrigger className="focus:ring-custom-dark-gray">
                  <SelectValue placeholder="期を選択してください" />
                </SelectTrigger>
                <SelectContent>
                  {terms.map(term => (
                    <SelectItem key={term.id} value={term.id}>
                      {term.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* コピー内容の説明 */}
            <Card className="p-4 bg-blue-50 border-blue-200">
              <h4 className="text-sm font-medium text-blue-900 mb-3 flex items-center gap-2">
                <Copy className="w-4 h-4" />
                一括コピーされる内容
              </h4>
              <div className="grid grid-cols-1 gap-2 text-sm">
                <div className="flex items-center gap-2">
                  <Video className="w-4 h-4 text-purple-600" />
                  <span>動画管理（タイトル・URL・表示順序・サブタイトル）</span>
                </div>
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-green-600" />
                  <span>事前課題（タイトル・編集タイトル・説明）</span>
                </div>
                <div className="flex items-center gap-2">
                  <MessageSquare className="w-4 h-4 text-orange-600" />
                  <span>チャットプロンプト（AI名・説明・システム指示・知識ベース）</span>
                </div>
                <div className="flex items-center gap-2">
                  <Database className="w-4 h-4 text-blue-600" />
                  <span>講義データ（スケジュール・設定）</span>
                </div>
              </div>
              <div className="mt-3 p-2 bg-blue-100 rounded text-xs text-blue-800">
                <strong>注意:</strong> 既存のデータに追加される形でコピーされます
              </div>
            </Card>

            {/* 実行結果 */}
            {copyResult && (
              <Card className="p-4 bg-green-50 border-green-200">
                <h4 className="text-sm font-medium text-green-900 mb-3 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4" />
                  コピー完了
                </h4>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2">
                      <Video className="w-4 h-4 text-purple-600" />
                      動画管理
                    </span>
                    <span className="font-medium text-green-700">
                      {copyResult.videosMeta.copied}件
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2">
                      <FileText className="w-4 h-4 text-green-600" />
                      事前課題
                    </span>
                    <span className="font-medium text-green-700">
                      {copyResult.assignments.copied}件
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2">
                      <MessageSquare className="w-4 h-4 text-orange-600" />
                      プロンプト
                    </span>
                    <span className="font-medium text-green-700">
                      {copyResult.prompts.copied}件
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2">
                      <Database className="w-4 h-4 text-blue-600" />
                      講義データ
                    </span>
                    <span className="font-medium text-green-700">
                      {copyResult.lectures.copied}件
                    </span>
                  </div>
                </div>
              </Card>
            )}
          </div>

          {/* フッター */}
          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button variant="outline" onClick={handleClose}>
              {copyResult ? '閉じる' : 'キャンセル'}
            </Button>
            {!copyResult && (
              <Button
                onClick={() => setShowConfirmDialog(true)}
                disabled={!canExecute}
                className="bg-custom-dark-gray hover:bg-[#2a292a] text-white"
              >
                <Play className="w-4 h-4 mr-2" />
                一括コピーを実行
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* 実行確認ダイアログ */}
      <AlertDialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              一括コピーを実行しますか？
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>
                「{selectedTerm?.name}」から「{targetTermName}」に
                全てのコンテンツを一括コピーします。
              </p>
              <div className="text-sm text-gray-600 bg-gray-50 p-3 rounded">
                <strong>コピー内容:</strong>
                <ul className="mt-1 space-y-1">
                  <li>• 動画管理（タイトル・URL・表示順序・サブタイトル）</li>
                  <li>• 事前課題（タイトル・編集タイトル・説明）</li>
                  <li>• チャットプロンプト（AI名・説明・システム指示・知識ベース）</li>
                  <li>• 講義データ（スケジュール・設定）</li>
                </ul>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isExecuting}>
              キャンセル
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleExecute}
              disabled={isExecuting}
              className="bg-custom-dark-gray hover:bg-[#2a292a] text-white"
            >
              {isExecuting ? (
                <>
                  <div className="w-4 h-4 mr-2 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  実行中...
                </>
              ) : (
                '一括コピーを実行'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}