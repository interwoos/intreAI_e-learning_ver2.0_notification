import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Play, RefreshCw, AlertCircle } from 'lucide-react';
import { LectureVideo } from '@/hooks/useLectureVideos';

interface StudentVideoListProps {
  videos: LectureVideo[];
  isLoading: boolean;
  error: string | null;
  onVideoPlay: (video: LectureVideo) => void;
  onRefresh: () => Promise<void>;
}

export function StudentVideoList({
  videos,
  isLoading,
  error,
  onVideoPlay,
  onRefresh
}: StudentVideoListProps) {
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await onRefresh();
    setIsRefreshing(false);
  };

  if (isLoading) {
    return (
      <div className="mb-6">
        <h2 className="text-lg sm:text-xl font-semibold text-custom-dark-gray mb-3">
          課題動画
        </h2>
        <div className="flex items-center justify-center py-8">
          <div className="w-6 h-6 animate-spin rounded-full border-2 border-custom-dark-gray border-t-transparent" />
          <span className="ml-2 text-gray-600">動画を読み込み中...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mb-6">
        <h2 className="text-lg sm:text-xl font-semibold text-custom-dark-gray mb-3">
          課題動画
        </h2>
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <AlertCircle className="w-8 h-8 text-red-500 mb-2" />
          <p className="text-red-600 mb-4">{error}</p>
          <Button
            onClick={handleRefresh}
            disabled={isRefreshing}
            variant="outline"
            size="sm"
            className="flex items-center gap-2"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            再試行
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mb-6">
      <h2 className="text-lg sm:text-xl font-semibold text-custom-dark-gray mb-3">
        課題動画
      </h2>
      
      {videos.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <Play className="w-12 h-12 text-gray-400 mb-2" />
          <p className="text-gray-500">この講義の動画はまだ追加されていません</p>
        </div>
      ) : (
        <div className="space-y-3">
          {videos.map((video, index) => (
            <Card
              key={video.id}
              className="group relative bg-white border border-gray-200 rounded-tl-xl rounded-tr-lg rounded-bl-lg rounded-br-lg hover:shadow-md transition-all duration-200 cursor-pointer"
              onClick={() => onVideoPlay(video)}
            >
              <div className="flex items-center gap-3 p-4">
                <div className="w-10 h-10 bg-gradient-to-br from-gray-700 to-gray-900 rounded-full flex items-center justify-center shadow-sm flex-shrink-0">
                  <Play className="w-5 h-5 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-semibold text-gray-900 mb-1 group-hover:text-custom-dark-gray transition-colors">
                    {video.title}
                  </h3>
                  {video.subtitle && (
                    <p className="text-xs text-gray-600">
                      {video.subtitle}
                    </p>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}