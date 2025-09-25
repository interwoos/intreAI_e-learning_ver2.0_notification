"use client";

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase';
import { FileVideo, ExternalLink, Clock } from 'lucide-react';

interface UploadedFileStatusProps {
  taskId: string;
  userId?: string; // 管理者が他ユーザーの状況を見る場合
  showUploadButton?: boolean;
}

interface FileStatus {
  hasFile: boolean;
  fileName?: string;
  fileUrl?: string;
  uploadedAt?: string;
}

export function UploadedFileStatus({ 
  taskId, 
  userId, 
  showUploadButton = true 
}: UploadedFileStatusProps) {
  const [fileStatus, setFileStatus] = useState<FileStatus>({ hasFile: false });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchFileStatus = async () => {
      try {
        let targetUserId = userId;
        
        // userIdが指定されていない場合は現在のユーザーを取得
        if (!targetUserId) {
          const { data: { user }, error: authError } = await supabase.auth.getUser();
          if (authError || !user) {
            console.error('❌ 認証エラー:', authError);
            return;
          }
          targetUserId = user.id;
        }

        // ファイル状況を取得
        const { data: assignment, error } = await supabase
          .from('user_assignments')
          .select('drive_file_id, drive_webview_link, upload_file_name, last_submitted_at')
          .eq('user_id', targetUserId)
          .eq('task_id', taskId)
          .single();

        if (error) {
          console.error('❌ ファイル状況取得エラー:', error);
          return;
        }

        if (assignment?.drive_webview_link) {
          setFileStatus({
            hasFile: true,
            fileName: assignment.upload_file_name || 'アップロード済みファイル',
            fileUrl: assignment.drive_webview_link,
            uploadedAt: assignment.last_submitted_at
          });
        } else {
          setFileStatus({ hasFile: false });
        }

      } catch (error) {
        console.error('❌ ファイル状況取得例外:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchFileStatus();
  }, [taskId, userId]);

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-gray-500">
        <div className="w-4 h-4 animate-spin rounded-full border-2 border-gray-300 border-t-transparent" />
        <span className="text-xs">確認中...</span>
      </div>
    );
  }

  if (fileStatus.hasFile) {
    return (
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1 px-2 py-1 bg-green-50 rounded-full">
          <FileVideo className="w-3 h-3 text-green-600" />
          <span className="text-xs text-green-700 font-medium">
            アップロード済み
          </span>
        </div>
        {fileStatus.fileUrl && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => window.open(fileStatus.fileUrl, '_blank')}
            className="h-6 px-2 text-green-600 hover:text-green-700 hover:bg-green-50"
          >
            <ExternalLink className="w-3 h-3" />
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1 px-2 py-1 bg-gray-50 rounded-full">
      <Clock className="w-3 h-3 text-gray-500" />
      <span className="text-xs text-gray-600">
        未アップロード
      </span>
    </div>
  );
}