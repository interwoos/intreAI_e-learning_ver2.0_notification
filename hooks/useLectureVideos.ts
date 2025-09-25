import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';

// 動画データの型定義
export interface LectureVideo {
  id: number;
  title: string;
  subtitle?: string;
  original_file_name: string | null;
  url: string | null;
  display_order: number;
  created_at: string;
}

// フック戻り値の型定義
interface UseLectureVideosReturn {
  videos: LectureVideo[];
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

/**
 * 生徒用講義動画取得フック
 * @param lectureNumber 講義番号（URLパラメータなどから取得）
 * @returns 動画一覧とローディング状態
 */
export function useLectureVideos(lectureNumber: number): UseLectureVideosReturn {
  const [videos, setVideos] = useState<LectureVideo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [termId, setTermId] = useState<string | null>(null);

  // 生徒の期IDを取得
  const fetchStudentTermId = useCallback(async () => {
    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      
      if (authError || !user) {
        throw new Error('認証が必要です');
      }

      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('term_id')
        .eq('id', user.id)
        .single();

      if (profileError) {
        throw new Error('プロフィール情報の取得に失敗しました');
      }

      if (!profile?.term_id) {
        throw new Error('期が設定されていません');
      }

      setTermId(profile.term_id);
      return profile.term_id;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '期IDの取得に失敗しました';
      setError(errorMessage);
      console.error('期ID取得エラー:', err);
      return null;
    }
  }, []);

  // 講義動画を取得
  const fetchLectureVideos = useCallback(async (currentTermId: string) => {
    try {
      setIsLoading(true);
      setError(null);

      console.log('📹 動画取得開始:', { termId: currentTermId, lectureNumber });

      const { data: videos, error: videosError } = await supabase
        .from('lecture_videos')
        .select('id, title, subtitle, original_file_name, url, display_order, created_at')
        .eq('term_id', currentTermId)
        .eq('lecture_number', lectureNumber)
        .order('display_order', { ascending: true })
        .order('created_at', { ascending: true });

      if (videosError) {
        throw videosError;
      }

      console.log('✅ 動画取得成功:', videos?.length || 0, '件');
      setVideos(videos || []);

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '動画の取得に失敗しました';
      setError(errorMessage);
      console.error('動画取得エラー:', err);
      toast.error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  }, [lectureNumber]);

  // 初回データ取得
  useEffect(() => {
    const initializeData = async () => {
      const currentTermId = await fetchStudentTermId();
      if (currentTermId) {
        await fetchLectureVideos(currentTermId);
      } else {
        setIsLoading(false);
      }
    };

    initializeData();
  }, [fetchStudentTermId, fetchLectureVideos]);

  // 手動再取得
  const refetch = useCallback(async () => {
    if (termId) {
      await fetchLectureVideos(termId);
    } else {
      const currentTermId = await fetchStudentTermId();
      if (currentTermId) {
        await fetchLectureVideos(currentTermId);
      }
    }
  }, [termId, fetchLectureVideos, fetchStudentTermId]);

  return {
    videos,
    isLoading,
    error,
    refetch
  };
}