"use client";

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { TaskCompletion } from "@/components/ui/task-completion";
import FileUpload from "@/components/ui/file-upload";
import { UploadedFileStatus } from "@/components/ui/uploaded-file-status";

interface PreAssignmentData {
  assignment_id: string;
  title: string;
  edit_title: string;
  description: string;
  allow_file_upload?: boolean;
}

interface TaskContentProps {
  activeTab: string;
  termId: string;
  preloadedData: PreAssignmentData | null;
}

/**
 * 並び順：
 * タイトル → 説明 → （必要なら）ファイル選択 → 課題シートを開く/課題完了
 */
export default function TaskContent({ activeTab, termId, preloadedData }: TaskContentProps) {
  const [taskData, setTaskData] = useState<PreAssignmentData | null>(preloadedData);
  const [currentTermId, setCurrentTermId] = useState<string>(termId);
  const [isLoading, setIsLoading] = useState(!preloadedData);

  // プリロードがあれば即反映
  useEffect(() => {
    if (preloadedData) {
      setTaskData(preloadedData);
      setIsLoading(false);
    }
  }, [preloadedData]);

  // ★ preloadedData の有無に関係なく termId は必ず取得
  useEffect(() => {
    const fetchTaskData = async () => {
      if (!activeTab) return;

      try {
        setIsLoading(true);

        // ユーザーの期IDを取得
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          console.error('❌ TaskContent: ユーザー認証失敗');
          return;
        }

        const { data: profile, error: profileErr } = await supabase
          .from('profiles')
          .select('term_id')
          .eq('id', user.id)
          .single();

        if (profileErr) {
          console.error('❌ TaskContent: プロフィール取得エラー:', profileErr);
          return;
        }
        if (!profile?.term_id) {
          console.error('❌ TaskContent: ユーザーの期が見つかりません:', profile);
          return;
        }

        setCurrentTermId(profile.term_id);

        // preloadedData が無いときだけ、個別タスクを取得
        if (!preloadedData) {
          const { data: preAssignment, error } = await supabase
            .from('pre_assignments')
            .select('assignment_id, title, edit_title, description, allow_file_upload')
            .eq('term_id', profile.term_id)
            .eq('assignment_id', activeTab)
            .single();

          if (error) {
            console.error('❌ TaskContent: タスクデータ取得エラー:', { activeTab, error });
            return;
          }
          if (!preAssignment) {
            console.error('❌ TaskContent: タスクデータが見つかりません:', { activeTab, termId: profile.term_id });
            return;
          }

          setTaskData(preAssignment);
        }
      } catch (error) {
        console.error('❌ TaskContent: データ取得例外:', { activeTab, error });
      } finally {
        setIsLoading(false);
      }
    };

    fetchTaskData();
  }, [activeTab, preloadedData]);

  // 既存のハードコード（必要タスク判定）—そのまま維持
  const isVideoUploadTask = (taskId: string) => ['2-4', '3-3', '5-4', '6-3', '7-3'].includes(taskId);
  const isFileUploadTask  = (taskId: string) => ['6-2', '7-2', '8-1'].includes(taskId);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="animate-pulse">
          <div className="h-6 bg-gray-200 rounded w-3/4 mb-3"></div>
          <div className="h-20 bg-gray-200 rounded mb-4"></div>
        </div>
      </div>
    );
  }

  if (!taskData) {
    return (
      <div className="space-y-4">
        <h3 className="text-lg font-medium mb-3 tracking-tight text-gray-800">
          課題データが見つかりません
        </h3>
        <div className="bg-red-50/50 p-4 rounded-lg border border-red-100 text-sm text-red-700">
          <p>指定された課題のデータが見つかりません。管理者にお問い合わせください。</p>
        </div>
      </div>
    );
  }

  const displayTitle = taskData.edit_title || taskData.title || `課題 ${taskData.assignment_id}`;

  // ファイルアップロード表示条件
  const shouldShowFileUpload = Boolean(currentTermId) && taskData.allow_file_upload;
  
  // 講義番号を抽出
  const lectureNumber = activeTab ? parseInt(activeTab.split('-')[0]) : undefined;

  return (
    <div className="space-y-4">
      {/* タイトル */}
      <h3 className="text-lg font-medium mb-3 mt-4 tracking-tight text-gray-800 ml-4">
        {displayTitle}
      </h3>

      {/* 説明 */}
      {taskData.description ? (
        <div className="bg-blue-50/50 p-4 rounded-lg border border-blue-100 text-sm text-gray-700">
          <p className="whitespace-pre-wrap">{taskData.description}</p>
        </div>
      ) : (
        <div className="bg-gray-50/50 p-4 rounded-lg border border-gray-100 text-sm text-gray-500">
          <p>課題の説明が設定されていません。</p>
        </div>
      )}

      {/* ▼ ファイルアップロード（管理者が許可した場合のみ） */}
      {shouldShowFileUpload && (
        <div className="mt-4 space-y-3">
          {/* アップロード状況表示 */}
          <UploadedFileStatus 
            taskId={activeTab}
            showUploadButton={false}
          />
          
          {/* ファイルアップロード */}
          <FileUpload
            termId={currentTermId}
            taskId={activeTab}
            lectureNumber={lectureNumber}
            allowedMimes={["video/*"]}
            maxSize={500 * 1024 * 1024} // 500MB
            label="動画ファイルをアップロード"
            onUploadComplete={() => {
              // アップロード完了後に状況を再読み込み
              window.location.reload();
            }}
          />
        </div>
      )}

      {/* ▼ 最後に「課題シートを開く／課題完了」 */}
      <TaskCompletion taskId={activeTab} />
    </div>
  );
}
