"use client";

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { Trash2, AlertTriangle } from 'lucide-react';

interface Student {
  id: string;
  full_name: string;
  email: string;
  company: string;
  department: string;
  position: string;
}

interface StudentDeleteButtonProps {
  student: Student;
  onDeleteSuccess: () => void;
}

export function StudentDeleteButton({ student, onDeleteSuccess }: StudentDeleteButtonProps) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      console.log('🗑️ 生徒削除開始:', { 
        studentId: student.id, 
        name: student.full_name 
      });

      // 認証トークンを取得
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      
      if (sessionError || !session?.access_token) {
        toast.error('認証セッションが無効です。再ログインしてください。');
        return;
      }

      // 削除API呼び出し
      const response = await fetch(`/api/delete-student?studentId=${student.id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        }
      });

      const result = await response.json();

      if (result.success) {
        console.log('✅ 生徒削除成功:', result.deletedStudent);
        toast.success(result.message);
        setIsDialogOpen(false);
        onDeleteSuccess(); // 親コンポーネントで生徒一覧を再読み込み
      } else {
        console.error('❌ 生徒削除失敗:', result.error);
        toast.error(result.error || '生徒の削除に失敗しました');
      }

    } catch (error) {
      console.error('❌ 生徒削除例外:', error);
      toast.error('生徒の削除に失敗しました');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <AlertDialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
      <AlertDialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="text-red-500 hover:text-red-700 hover:bg-red-50"
          disabled={isDeleting}
        >
          <Trash2 className="w-4 h-4" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-red-500" />
            生徒を削除しますか？
          </AlertDialogTitle>
          <AlertDialogDescription className="space-y-3">
            <p className="text-red-600 font-medium">
              この操作は取り消せません。以下の生徒とその関連データがすべて削除されます。
            </p>
            
            <div className="bg-gray-50 p-3 rounded-lg">
              <div className="font-medium text-gray-900">{student.full_name}</div>
              <div className="text-sm text-gray-600">{student.email}</div>
              <div className="text-sm text-gray-600">{student.company}</div>
            </div>

            <div className="bg-red-50 p-3 rounded-lg border border-red-200">
              <div className="text-sm text-red-800 font-medium mb-2">削除されるデータ:</div>
              <ul className="text-sm text-red-700 space-y-1">
                <li>• プロフィール情報</li>
                <li>• 課題提出状況</li>
                <li>• チャット履歴</li>
                <li>• 提出履歴</li>
                <li>• ログインアカウント</li>
              </ul>
            </div>
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
              <>
                <Trash2 className="w-4 h-4 mr-2" />
                削除する
              </>
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}