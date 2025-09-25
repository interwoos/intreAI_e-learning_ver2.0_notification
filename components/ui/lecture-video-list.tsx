"use client";

import { Play } from 'lucide-react';

interface Video {
  title: string;
  url: string;
  description?: string;
  type: 'youtube' | 'supabase';
}

interface LectureVideoListProps {
  videos: Video[];
  onVideoPlay: (video: Video) => void;
}

export function LectureVideoList({ videos, onVideoPlay }: LectureVideoListProps) {
  return (
    <div className="space-y-3 mb-6">
      {videos.map((video, index) => (
        <div 
          key={index}
          className="bg-white rounded-tl-xl rounded-tr-lg rounded-bl-lg rounded-br-lg shadow-sm border border-gray-100 overflow-hidden hover:shadow-md transition-shadow duration-200"
        >
          <button
            onClick={() => onVideoPlay(video)}
            className="w-full p-4 text-left hover:bg-gray-50 transition-colors duration-200 flex items-center gap-3"
          >
            <div className="flex-shrink-0 w-10 h-10 bg-custom-dark-gray rounded-full flex items-center justify-center">
              <Play className="w-5 h-5 text-white ml-0.5" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-medium text-custom-black text-sm sm:text-base line-clamp-2 leading-tight">
                {video.title}
              </h3>
              {video.description && (
                <p className="text-xs text-gray-600 mt-1 line-clamp-1">
                  {video.description}
                </p>
              )}
            </div>
          </button>
        </div>
      ))}
    </div>
  );
}