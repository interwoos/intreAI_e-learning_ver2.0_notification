"use client";

import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
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
  Video, 
  Plus, 
  Trash2, 
  Upload, 
  X,
  Play,
  AlertTriangle
} from 'lucide-react';
import { VideoData, NewVideoData } from '@/hooks/useVideos';

interface VideoManagerProps {
  videos: VideoData[];
  isVideoUploading: boolean;
  uploadProgress: number;
  isSaving: boolean;
  isDeleting: boolean;
  deleteConfirmVideo: string | null;
  isReloading: boolean;
  onAddVideo: (newVideo: NewVideoData) => Promise<boolean>;
  onEditVideo: (videoId: string, updatedData: Partial<VideoData>) => void;
  onDeleteVideo: (videoId: string) => Promise<boolean>;
  onDeleteClick: (videoId: string) => void;
  onCancelDelete: () => void;
  onReload: () => Promise<void>;
}

export function VideoManager({
  videos,
  isVideoUploading,
  uploadProgress,
  isSaving,
  isDeleting,
  deleteConfirmVideo,
  isReloading,
  onAddVideo,
  onEditVideo,
  onDeleteVideo,
  onDeleteClick,
  onCancelDelete,
  onReload,
}: VideoManagerProps) {
  const [isVideoDialogOpen, setIsVideoDialogOpen] = useState(false);
  const [newVideo, setNewVideo] = useState<NewVideoData>({
    title: "",
    subtitle: "",
    type: "youtube",
    url: "",
    file: null
  });

  const handleAddVideo = async () => {
    if (!newVideo.title) return;

    await onAddVideo(newVideo);
    
    // 常にダイアログを閉じてフォームをリセット
    setNewVideo({
      title: "",
      subtitle: "",
      type: "youtube",
      url: "",
      file: null
    });
    setIsVideoDialogOpen(false);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setNewVideo({ 
        ...newVideo, 
        file, 
        url: file.name,
        type: 'upload'
      });
    }
  };

  const handleConfirmDelete = async () => {
    if (deleteConfirmVideo) {
      await onDeleteVideo(deleteConfirmVideo);
    }
  };

  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-custom-dark-gray flex items-center gap-2">
          <Video className="w-5 h-5" />
          動画管理
        </h2>
        <div className="flex items-center gap-2">
          <Button 
            variant="outline" 
            size="sm"
            onClick={onReload}
            disabled={isReloading || isSaving || isDeleting}
            className="flex items-center gap-2"
          >
            {isReloading ? (
              <>
                <div className="w-4 h-4 animate-spin rounded-full border-2 border-gray-600 border-t-transparent" />
                更新中...
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                更新
              </>
            )}
          </Button>
          <Dialog open={isVideoDialogOpen} onOpenChange={setIsVideoDialogOpen}>
            <DialogTrigger asChild>
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => {
                  // 新規追加時は必ずフォームをリセット
                  setNewVideo({
                    title: "",
                    subtitle: "",
                    type: "youtube",
                    url: "",
                    file: null
                  });
                }}
              >
                <Plus className="w-4 h-4 mr-1" />
                動画追加
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
              <DialogHeader>
                <DialogTitle>動画を追加</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">タイトル *</label>
                  <Input
                    value={newVideo.title}
                    onChange={(e) => setNewVideo({ ...newVideo, title: e.target.value })}
                    placeholder="動画のタイトルを入力"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">サブタイトル</label>
                  <Input
                    value={newVideo.subtitle}
                    onChange={(e) => setNewVideo({ ...newVideo, subtitle: e.target.value })}
                    placeholder="サブタイトル（任意）"
                  />
                </div>
                <div className="space-y-3">
                  <label className="text-sm font-medium">動画の種類</label>
                  <div className="flex gap-4">
                    <label className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="videoType"
                        value="youtube"
                        checked={newVideo.type === 'youtube'}
                        onChange={(e) => setNewVideo({ ...newVideo, type: e.target.value as 'youtube' | 'upload' })}
                      />
                      YouTube
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="videoType"
                        value="upload"
                        checked={newVideo.type === 'upload'}
                        onChange={(e) => setNewVideo({ ...newVideo, type: e.target.value as 'youtube' | 'upload' })}
                      />
                      アップロード
                    </label>
                  </div>
                </div>
                {newVideo.type === 'youtube' ? (
                  <div className="space-y-2">
                    <label className="text-sm font-medium">YouTube URL</label>
                    <Input
                      value={newVideo.url}
                      onChange={(e) => setNewVideo({ ...newVideo, url: e.target.value })}
                      placeholder="https://www.youtube.com/watch?v=..."
                    />
                  </div>
                ) : (
                  <div className="space-y-2">
                    <label className="text-sm font-medium">動画ファイル</label>
                    <div className="flex items-center gap-2">
                      {!newVideo.title.trim() && (
                        <div className="text-xs text-red-500 mb-2">
                          ※ タイトルを入力してからファイルを選択してください
                        </div>
                      )}
                      {/* アップロード進捗表示 */}
                      {isVideoUploading && (
                        <div className="w-full space-y-2">
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-blue-600">アップロード中...</span>
                            <span className="text-blue-600 font-medium">{uploadProgress}%</span>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-2">
                            <div 
                              className="bg-blue-600 h-2 rounded-full transition-all duration-300 ease-out"
                              style={{ width: `${uploadProgress}%` }}
                            />
                          </div>
                          <div className="text-xs text-gray-500">
                            最大ファイルサイズ: 500MB
                          </div>
                        </div>
                      )}
                      {isVideoUploading && (
                        <div className="flex items-center gap-2 text-blue-600">
                          <div className="w-4 h-4 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
                          <span className="text-sm">処理中...</span>
                        </div>
                      )}
                      <input
                        type="file"
                        accept="video/*"
                        onChange={handleFileSelect}
                        className="hidden"
                        id="video-upload"
                        disabled={isSaving}
                      />
                      <label
                        htmlFor="video-upload"
                        className={`flex items-center gap-2 px-3 py-2 border border-gray-300 rounded-md cursor-pointer hover:bg-gray-50 ${
                          isSaving ? 'opacity-50 cursor-not-allowed' : ''
                        }`}
                      >
                        <Upload className="w-4 h-4" />
                        ファイルを選択
                      </label>
                      {newVideo.file && (
                        <span className="text-sm text-gray-600">{newVideo.file.name}</span>
                      )}
                    </div>
                  </div>
                )}
                <div className="flex justify-end gap-2 pt-4">
                  <Button 
                    variant="outline" 
                    onClick={() => {
                      setIsVideoDialogOpen(false);
                      // キャンセル時もフォームをリセット
                      setNewVideo({
                        title: "",
                        subtitle: "",
                        type: "youtube",
                        url: "",
                        file: null
                      });
                    }}
                  >
                    キャンセル
                  </Button>
                  <Button 
                    onClick={handleAddVideo}
                    disabled={isSaving}
                    className="bg-custom-dark-gray hover:bg-[#2a292a] text-white"
                  >
                    {isSaving ? (
                      <>
                        <div className="w-4 h-4 mr-2 animate-spin rounded-full border-2 border-white border-t-transparent" />
                        {newVideo.type === 'upload' ? 'アップロード中...' : '保存中...'}
                      </>
                    ) : (
                      '追加'
                    )}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>
      
      <div className="space-y-3">
        {videos.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <Video className="w-12 h-12 mx-auto mb-2 opacity-50" />
            <p className="text-sm">「動画追加」ボタンから動画を追加してください</p>
          </div>
        ) : (
          videos.map((video) => (
            <div key={video.id} className="group relative bg-white border border-gray-200 rounded-lg hover:shadow-md transition-all duration-200">
              <div className="flex items-center gap-3 p-2">
                <div className="w-10 h-10 bg-gradient-to-br from-gray-700 to-gray-900 rounded-full flex items-center justify-center shadow-sm flex-shrink-0">
                  <Play className="w-5 h-5 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-semibold text-gray-900 mb-0.5">
                    {video.title}
                  </h3>
                  <p className="text-xs text-gray-600">
                    {video.subtitle || (video.type === 'youtube' ? 'YouTube動画' : 'アップロード動画')}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="h-6 w-6 p-0 text-red-500 hover:text-red-700"
                    onClick={() => onDeleteClick(video.id)}
                    disabled={isDeleting && deleteConfirmVideo === video.id}
                  >
                    {isDeleting && deleteConfirmVideo === video.id ? (
                      <div className="w-3 h-3 animate-spin rounded-full border border-red-500 border-t-transparent" />
                    ) : (
                      <Trash2 className="w-3 h-3" />
                    )}
                  </Button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* 動画削除確認ダイアログ */}
      <AlertDialog open={!!deleteConfirmVideo} onOpenChange={() => !isDeleting && onCancelDelete()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-red-500" />
              動画を削除しますか？
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>この操作は取り消せません。</p>
              {(() => {
                const video = videos.find(v => v.id === deleteConfirmVideo);
                if (video?.type === 'upload') {
                  return <p className="text-red-600 font-medium">※ ストレージからも完全に削除されます</p>;
                }
                return null;
              })()}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={onCancelDelete} disabled={isDeleting}>
              キャンセル
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
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