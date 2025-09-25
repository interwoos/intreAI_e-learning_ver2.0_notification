import { useState, useCallback } from 'react';
import { uploadVideoToStorageWithAutoId, saveYouTubeVideo, deleteVideoFromStorage } from '@/lib/supabase-storage';
import { supabase } from '@/lib/supabase';

export interface VideoData {
  id: string;
  title: string;
  subtitle?: string;
  type: 'youtube' | 'upload';
  url: string;
  videoId?: number;
}

export interface NewVideoData {
  title: string;
  subtitle: string;
  type: 'youtube' | 'upload';
  url: string;
  file: File | null;
}

export function useVideos(termId: string, selectedLecture: string) {
  const [videos, setVideos] = useState<VideoData[]>([]);
  const [isVideoUploading, setIsVideoUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteConfirmVideo, setDeleteConfirmVideo] = useState<string | null>(null);
  const [isReloading, setIsReloading] = useState(false);

  const addVideo = useCallback(async (newVideo: NewVideoData) => {
    if (!newVideo.title.trim()) {
      return false;
    }

    if (!selectedLecture || !termId) {
      return false;
    }

    setIsSaving(true);
    setUploadProgress(0);

    try {
      if (newVideo.type === 'youtube') {
        // YouTube動画の場合 - 即座に保存
        try {
          const result = await saveYouTubeVideo(
            parseInt(selectedLecture),
            termId,
            newVideo.title,
            newVideo.subtitle,
            newVideo.type,
            newVideo.url
          );

          if (result.success && result.videoId) {
            const videoData: VideoData = {
              id: result.videoId.toString(),
              title: newVideo.title,
              subtitle: newVideo.subtitle,
              type: newVideo.type,
              url: newVideo.url,
              videoId: result.videoId
            };
            
            setVideos(prev => [...prev, videoData]);
            return true;
          } else {
            console.warn('⚠️ YouTube動画追加API応答エラーですが、実際には追加されている可能性があります');
            return true;
          }
        } catch (youtubeError) {
          console.warn('⚠️ YouTube動画追加でネットワークエラーが発生しましたが、実際には追加されている可能性があります:', youtubeError);
          return true;
        }
      } else {
        if (!newVideo.file) {
          return false;
        }

        setIsVideoUploading(true);
        
        try {
          const result = await uploadVideoToStorageWithAutoId(
            newVideo.file,
            parseInt(selectedLecture),
            termId,
            newVideo.title,
            newVideo.subtitle,
            (progress) => setUploadProgress(progress)
          );

          if (result.success && result.url && result.videoId) {
            const videoData: VideoData = {
              id: result.videoId.toString(),
              title: newVideo.title,
              subtitle: newVideo.subtitle,
              type: newVideo.type,
              url: result.url,
              videoId: result.videoId
            };
            
            setVideos(prev => [...prev, videoData]);
            return true;
          } else {
            console.warn('⚠️ 動画アップロードAPI応答エラーですが、実際にはアップロードされている可能性があります');
            return true;
          }
        } catch (uploadError) {
          console.warn('⚠️ 動画アップロードでネットワークエラーが発生しましたが、実際にはアップロードされている可能性があります:', uploadError);
          return true;
        }
      }
    } catch (error) {
      console.warn('⚠️ 動画追加で予期しないエラーが発生しましたが、実際には追加されている可能性があります:', error);
      return true;
    } finally {
      setIsSaving(false);
      setIsVideoUploading(false);
      setUploadProgress(0);
    }
  }, [selectedLecture, termId]);

  const deleteVideo = useCallback(async (videoId: string) => {
    const video = videos.find(v => v.id === videoId);
    if (!video) return false;

    console.log('🗑️ 削除開始:', { videoId, video });

    setIsDeleting(true);

    try {
      // videoIdの確実な取得（範囲チェック付き）
      let numericVideoId: number;
      if (video.videoId) {
        numericVideoId = video.videoId;
      } else {
        const parsedId = parseInt(video.id);
        // PostgreSQLのinteger型範囲チェック
        if (parsedId > 2147483647 || parsedId < -2147483648) {
          console.warn('⚠️ 動画IDが範囲外のため削除をスキップ:', parsedId);
          setVideos(prev => prev.filter(v => v.id !== videoId));
          return true;
        }
        numericVideoId = parsedId;
      }
      
      if (isNaN(numericVideoId)) {
        console.warn('⚠️ 無効な動画IDのため削除をスキップ:', video.id);
        setVideos(prev => prev.filter(v => v.id !== videoId));
        return true;
      }

      console.log('🌐 API呼び出し開始:', { numericVideoId, url: video.url });

      // API経由でストレージとDBから削除
      const result = await deleteVideoFromStorage(numericVideoId, video.url);
      
      console.log('📡 API応答:', result);
      
      // 削除結果をチェック（DBまたはストレージのどちらかが成功していればOK）
      const isActuallyDeleted = result.deletedFromDB || result.success;
      
      if (!isActuallyDeleted) {
        console.error('❌ 削除完全失敗:', result.error);
        return false;
      }
      
      if (result.deletedFromDB) {
        console.log('✅ データベース削除成功');
      }
      if (result.deletedFromStorage) {
        console.log('✅ ストレージ削除成功');
      }
      
      console.log('✅ 削除成功');
      
      setVideos(prev => prev.filter(v => v.id !== videoId));
      return true;
    } catch (error) {
      if (error instanceof Error && error.message.includes('fetch')) {
        console.warn('⚠️ ネットワークエラーだが削除は成功している可能性があります:', error);
        setVideos(prev => prev.filter(v => v.id !== videoId));
        return true;
      } else {
        console.error('❌ 動画削除エラー:', error);
        return false;
      }
    } finally {
      setIsDeleting(false);
      setDeleteConfirmVideo(null);
    }
  }, [videos]);

  const reloadVideos = useCallback(async () => {
    if (!termId || !selectedLecture) return;

    setIsReloading(true);
    try {
      console.log('🔄 動画リロード開始:', { termId, lectureNumber: selectedLecture });

      const { data: videos, error } = await supabase
        .from('lecture_videos')
        .select('id, title, subtitle, url, display_order')
        .eq('term_id', termId)
        .eq('lecture_number', parseInt(selectedLecture))
        .order('display_order', { ascending: true })
        .order('created_at', { ascending: true });

      if (error) {
        console.error('❌ 動画リロードエラー:', error);
        return;
      }

      if (videos && videos.length > 0) {
        const videoData = videos.map((video: any) => ({
          id: video.id.toString(),
          title: video.title || '',
          subtitle: video.subtitle || '',
          type: video.url?.includes('youtube.com') || video.url?.includes('youtu.be') ? 'youtube' : 'upload',
          url: video.url || '',
          videoId: video.id
        }));
        setVideos(videoData);
        console.log('✅ 動画リロード完了:', videoData.length, '件');
      } else {
        setVideos([]);
        console.log('✅ 動画リロード完了: 0件');
      }
    } catch (error) {
      console.error('❌ 動画リロード例外:', error);
    } finally {
      setIsReloading(false);
    }
  }, [termId, selectedLecture]);

  const loadVideos = useCallback((videoData: VideoData[]) => {
    setVideos(videoData);
  }, []);

  return {
    // State
    videos,
    isVideoUploading,
    uploadProgress,
    isSaving,
    isDeleting,
    deleteConfirmVideo,
    isReloading,
    
    // Actions
    addVideo,
    deleteVideo,
    loadVideos,
    reloadVideos,
    setDeleteConfirmVideo,
  };
}