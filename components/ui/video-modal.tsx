"use client";

import { useState, useRef, useEffect } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { 
  X, 
  MoreVertical,
  PictureInPicture2
} from 'lucide-react';

interface VideoModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  videoUrl: string;
}

export function VideoModal({ isOpen, onClose, title, videoUrl }: VideoModalProps) {
  const [playbackRate, setPlaybackRate] = useState(1);
  const [isPipSupported, setIsPipSupported] = useState(false);
  const [isPipActive, setIsPipActive] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // ピクチャインピクチャサポート検出
  useEffect(() => {
    if (typeof document !== 'undefined') {
      setIsPipSupported('pictureInPictureEnabled' in document);
    }
  }, []);

  // YouTube URLからembed URLに変換
  const getEmbedUrl = (url: string) => {
    const videoId = extractVideoId(url);
    if (!videoId) return url;
    
    return `https://www.youtube.com/embed/${videoId}?enablejsapi=1&playsinline=1`;
  };

  const extractVideoId = (url: string) => {
    const match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\n?#]+)/);
    return match ? match[1] : null;
  };

  const handlePlaybackRateChange = (rate: number) => {
    setPlaybackRate(rate);
    // YouTube iframeの再生速度変更はYouTube Player APIが必要
    // 簡易実装として、URLパラメータで制御
    if (iframeRef.current) {
      const currentSrc = iframeRef.current.src;
      const newSrc = currentSrc.includes('playbackRate') 
        ? currentSrc.replace(/playbackRate=[\d.]+/, `playbackRate=${rate}`)
        : `${currentSrc}&playbackRate=${rate}`;
      iframeRef.current.src = newSrc;
    }
  };

  const togglePictureInPicture = async () => {
    if (!isPipSupported) return;

    try {
      // YouTube iframeの場合、直接的なPiPは制限があるため
      // ブラウザのPiP機能を使用
      if (isPipActive) {
        await document.exitPictureInPicture();
      } else {
        // iframeからvideoエレメントを取得してPiPを試行
        const iframe = iframeRef.current;
        if (iframe) {
          // YouTube Player APIを使用した実装が理想的だが、
          // 簡易実装として新しいウィンドウでPiP風の表示
          const pipWindow = window.open(
            getEmbedUrl(videoUrl),
            'pip-window',
            'width=480,height=270,resizable=yes,scrollbars=no,status=no,menubar=no,toolbar=no'
          );
          if (pipWindow) {
            setIsPipActive(true);
            pipWindow.addEventListener('beforeunload', () => {
              setIsPipActive(false);
            });
          }
        }
      }
    } catch (error) {
      console.error('ピクチャインピクチャエラー:', error);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl w-full p-0 bg-black">
        <div className="relative">
          {/* ヘッダー */}
          <div className="absolute top-0 left-0 right-0 z-20 bg-gradient-to-b from-black/80 to-transparent p-4">
            <div className="flex items-center justify-between">
              <h3 className="text-white font-medium truncate">{title}</h3>
              <div className="flex items-center gap-2">
                {/* ピクチャインピクチャボタン */}
                {isPipSupported && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={togglePictureInPicture}
                    className={`text-white hover:bg-white/20 ${
                      isPipActive ? 'bg-white/20' : ''
                    }`}
                    title="ピクチャインピクチャ"
                  >
                    <PictureInPicture2 className="w-5 h-5" />
                  </Button>
                )}

                {/* 設定メニュー */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-white hover:bg-white/20"
                    >
                      <MoreVertical className="w-5 h-5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="bg-black/90 text-white border-white/20">
                    {/* 再生速度 */}
                    <div className="px-2 py-1 text-xs text-white/70 font-medium">再生速度</div>
                    {[0.5, 0.75, 1, 1.25, 1.5, 2].map((rate) => (
                      <DropdownMenuItem
                        key={rate}
                        onClick={() => handlePlaybackRateChange(rate)}
                        className={`text-white hover:bg-white/20 ${
                          playbackRate === rate ? 'bg-white/20' : ''
                        }`}
                      >
                        {rate}x {playbackRate === rate && '✓'}
                      </DropdownMenuItem>
                    ))}
                    
                    {/* ピクチャインピクチャ */}
                    {isPipSupported && (
                      <>
                        <DropdownMenuSeparator className="bg-white/20" />
                        <div className="px-2 py-1 text-xs text-white/70 font-medium">表示オプション</div>
                        <DropdownMenuItem
                          onClick={togglePictureInPicture}
                          className="text-white hover:bg-white/20"
                        >
                          <PictureInPicture2 className="w-4 h-4 mr-2" />
                          {isPipActive ? 'PiP終了' : 'ピクチャインピクチャ'}
                        </DropdownMenuItem>
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onClose}
                  className="text-white hover:bg-white/20"
                >
                  <X className="w-5 h-5" />
                </Button>
              </div>
            </div>
          </div>

          {/* YouTube iframe */}
          <iframe
            ref={iframeRef}
            src={getEmbedUrl(videoUrl)}
            className="w-full aspect-video"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}