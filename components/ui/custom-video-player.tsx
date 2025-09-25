"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import Hls from "hls.js";
import {
  Loader2,
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize2,
  Minimize2,
  PictureInPicture2,
} from "lucide-react";

const SPEEDS = [0.5, 1, 1.5, 2];

interface CustomVideoPlayerProps {
  videoPath: string;
  title: string;
}

export function CustomVideoPlayer({ videoPath }: CustomVideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [volume, setVolume] = useState(1); // 0.0～1.0
  const [error, setError] = useState<string | null>(null);
  const [showControls, setShowControls] = useState(true);
  const [isPipSupported, setIsPipSupported] = useState(false);
  const [isPipActive, setIsPipActive] = useState(false);

  // タイマー
  const hideControlsTimer = useRef<NodeJS.Timeout | null>(null);

  // タイマー管理（すべてのUI操作で呼ぶ）
  const resetControlsTimer = () => {
    setShowControls(true);
    if (hideControlsTimer.current) clearTimeout(hideControlsTimer.current);
    // 再生中だけ自動非表示
    if (isPlaying) {
      hideControlsTimer.current = setTimeout(() => {
        setShowControls(false);
      }, 2000); // 2秒
    }
  };

  // 動画ロード
  useEffect(() => {
    const loadVideo = async () => {
      if (!videoRef.current) return;
      try {
        setIsLoading(true);
        setError(null);

        const { data } = supabase
          .storage
          .from("interwoos-lecture-videos")
          .getPublicUrl(videoPath);

        if (!data?.publicUrl) throw new Error("動画 URL の取得に失敗しました");
        const publicUrl = data.publicUrl;

        if (publicUrl.endsWith(".m3u8") && Hls.isSupported()) {
          const hls = new Hls();
          hls.loadSource(publicUrl);
          hls.attachMedia(videoRef.current);
          hls.on(Hls.Events.MANIFEST_PARSED, () => setIsLoading(false));
        } else {
          videoRef.current.src = publicUrl;
          setIsLoading(false);
        }
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : "動画の読み込みに失敗しました";
        setError(msg);
        setIsLoading(false);
      }
    };

    loadVideo();
  }, [videoPath]);

  // コントロールバー再表示/自動非表示管理
  useEffect(() => {
    if (!isPlaying) {
      setShowControls(true);
      if (hideControlsTimer.current) clearTimeout(hideControlsTimer.current);
      return;
    }
    resetControlsTimer();
    // eslint-disable-next-line
  }, [isPlaying]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    // ピクチャインピクチャサポートチェック
    setIsPipSupported('pictureInPictureEnabled' in document);

    // ピクチャインピクチャ状態の監視
    const handleEnterPip = () => setIsPipActive(true);
    const handleLeavePip = () => setIsPipActive(false);

    video.addEventListener('enterpictureinpicture', handleEnterPip);
    video.addEventListener('leavepictureinpicture', handleLeavePip);

    return () => {
      video.removeEventListener('enterpictureinpicture', handleEnterPip);
      video.removeEventListener('leavepictureinpicture', handleLeavePip);
    };
  }, []);

  // マウス操作
  const handleMouseMove = () => {
    resetControlsTimer();
  };

  // コントロールバーUI内のすべての要素にこれを付与
  const handleFocus = () => {
    resetControlsTimer();
  };
  const handleBlur = () => {
    // すぐにバーを消すわけではない。もし再生中なら2秒で自動非表示
    if (isPlaying) resetControlsTimer();
  };
  const handleKeyDown = () => {
    resetControlsTimer();
  };

  // 十字キーやfキーなど「全体」へのキーイベント
  useEffect(() => {
    const onKeydown = (e: KeyboardEvent) => {
      if (!videoRef.current) return;

      // バー表示リセット
      resetControlsTimer();

      if (e.key === "ArrowLeft") {
        videoRef.current.currentTime = Math.max(
          0,
          videoRef.current.currentTime - 10
        );
        setCurrentTime(videoRef.current.currentTime);
      }
      if (e.key === "ArrowRight") {
        videoRef.current.currentTime = Math.min(
          duration,
          videoRef.current.currentTime + 10
        );
        setCurrentTime(videoRef.current.currentTime);
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        let nextVol = Math.min(1, (videoRef.current.volume ?? 1) + 0.1);
        videoRef.current.volume = nextVol;
        setVolume(nextVol);
        setIsMuted(nextVol === 0 || videoRef.current.muted);
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        let nextVol = Math.max(0, (videoRef.current.volume ?? 1) - 0.1);
        videoRef.current.volume = nextVol;
        setVolume(nextVol);
        setIsMuted(nextVol === 0 || videoRef.current.muted);
      }
      if (e.code === "Space") {
        e.preventDefault();
        handlePlayPause();
      }
      if (e.key.toLowerCase() === "f") {
        e.preventDefault();
        handleFullscreen();
      }
    };
    window.addEventListener("keydown", onKeydown);
    return () => window.removeEventListener("keydown", onKeydown);
    // eslint-disable-next-line
  }, [duration, isPlaying]);

  // 動画状態系
  const handlePlayPause = () => {
    if (!videoRef.current) return;
    isPlaying ? videoRef.current.pause() : videoRef.current.play();
    resetControlsTimer();
  };

  const handleMute = () => {
    if (!videoRef.current) return;
    videoRef.current.muted = !isMuted;
    setIsMuted(videoRef.current.muted);
    resetControlsTimer();
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!videoRef.current) return;
    const value = Number(e.target.value);
    videoRef.current.currentTime = value;
    setCurrentTime(value);
    resetControlsTimer();
  };

  const handleChangeSpeed = (speed: number) => {
    if (!videoRef.current) return;
    videoRef.current.playbackRate = speed;
    setPlaybackRate(speed);
    resetControlsTimer();
  };

  const handleFullscreen = () => {
    if (!videoRef.current) return;
    const videoBox = videoRef.current.parentElement;
    if (!document.fullscreenElement && videoBox) {
      videoBox.requestFullscreen();
      setIsFullscreen(true);
    } else if (document.fullscreenElement) {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
    resetControlsTimer();
  };

  const togglePictureInPicture = async () => {
    if (!videoRef.current || !isPipSupported) return;

    try {
      if (isPipActive) {
        await document.exitPictureInPicture();
      } else {
        await videoRef.current.requestPictureInPicture();
      }
    } catch (error) {
      console.error('ピクチャインピクチャエラー:', error);
    }
  };

  const handleTimeUpdate = () => {
    if (!videoRef.current) return;
    setCurrentTime(videoRef.current.currentTime);
    setDuration(videoRef.current.duration || 0);
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = Number(e.target.value);
    setVolume(value);
    if (videoRef.current) {
      videoRef.current.volume = value;
      setIsMuted(videoRef.current.muted || value === 0);
    }
    resetControlsTimer();
  };

  const handleLoadedData = () => {
    setIsLoading(false);
    setDuration(videoRef.current?.duration || 0);
    setCurrentTime(0);
    setPlaybackRate(videoRef.current?.playbackRate || 1);
    setVolume(videoRef.current?.volume ?? 1);
  };

  useEffect(() => {
    const fullscreenChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", fullscreenChange);
    return () =>
      document.removeEventListener("fullscreenchange", fullscreenChange);
  }, []);

  const formatTime = (t: number) => {
    if (isNaN(t)) return "00:00";
    const m = Math.floor(t / 60);
    const s = Math.floor(t % 60);
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  if (error) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-black text-white p-4">
        {error}
      </div>
    );
  }

  const focusClass =
    "focus:outline focus:outline-2 focus:outline-blue-600 focus:ring-0";

  return (
    <div
      className={`relative w-full aspect-video bg-black rounded-xl overflow-hidden group
        ${showControls ? "cursor-auto" : "cursor-none"}`}
      onMouseMove={handleMouseMove}
      tabIndex={0}
    >
      {/* ローディング */}
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center z-20 bg-black/60">
          <Loader2 className="w-8 h-8 text-white animate-spin" />
        </div>
      )}

      {/* 動画本体（title属性なし！） */}
      <video
        ref={videoRef}
        className="w-full h-full"
        muted={isMuted}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onTimeUpdate={handleTimeUpdate}
        onLoadedData={handleLoadedData}
      />

      {/* カスタムコントロール */}
      <div
        className={`absolute bottom-0 left-0 w-full z-30 transition-opacity duration-300 pointer-events-none ${
          showControls ? "opacity-100" : "opacity-0"
        }`}
        style={{
          background:
            "linear-gradient(to top, rgba(0,0,0,0.8), rgba(0,0,0,0.0) 70%)",
        }}
      >
        <div className="px-4 pt-7 pb-2 flex flex-col gap-2 pointer-events-auto">
          {/* シークバー */}
          <input
            type="range"
            min={0}
            max={duration}
            step={0.1}
            value={currentTime}
            onChange={handleSeek}
            onFocus={handleFocus}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
            className="w-full accent-red-600"
            style={{ accentColor: "#e53935" }}
          />

          <div className="flex items-center gap-3 justify-between">
            {/* 左：再生/一時停止・音量 */}
            <div className="flex items-center gap-2">
              {/* 再生/一時停止 */}
              <button
                type="button"
                className={`rounded-full p-2 flex items-center justify-center hover:bg-white/10 ${focusClass}`}
                onClick={handlePlayPause}
                tabIndex={0}
                aria-label={isPlaying ? "Pause" : "Play"}
                onFocus={handleFocus}
                onBlur={handleBlur}
                onKeyDown={handleKeyDown}
              >
                {isPlaying ? (
                  <Pause className="w-6 h-6 text-white" />
                ) : (
                  <Play className="w-6 h-6 text-white" />
                )}
              </button>
              {/* 音量 */}
              <button
                type="button"
                className={`rounded-full p-2 flex items-center justify-center hover:bg-white/10 ${focusClass}`}
                onClick={handleMute}
                tabIndex={0}
                aria-label={isMuted ? "Unmute" : "Mute"}
                onFocus={handleFocus}
                onBlur={handleBlur}
                onKeyDown={handleKeyDown}
              >
                {isMuted ? (
                  <VolumeX className="w-6 h-6 text-white" />
                ) : (
                  <Volume2 className="w-6 h-6 text-white" />
                )}
              </button>
              {/* 音量スライダー */}
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={volume}
                onChange={handleVolumeChange}
                onFocus={handleFocus}
                onBlur={handleBlur}
                onKeyDown={handleKeyDown}
                className="w-20 accent-red-600 mx-2"
                style={{ accentColor: "#e53935" }}
              />
              {/* 現在時刻 */}
              <span className="text-xs text-white ml-2 min-w-[48px]">
                {formatTime(currentTime)} / {formatTime(duration)}
              </span>
            </div>
            {/* 右：再生速度・フルスクリーン */}
            <div className="flex items-center gap-2">
              {/* 再生速度 */}
              <select
                value={playbackRate}
                onChange={e => handleChangeSpeed(Number(e.target.value))}
                className={`rounded px-2 py-1 text-xs bg-white/90 font-bold outline-none focus:ring-0 focus:outline focus:outline-2 focus:outline-blue-600`}
                onFocus={handleFocus}
                onBlur={handleBlur}
                onKeyDown={handleKeyDown}
              >
                {SPEEDS.map(speed => (
                  <option key={speed} value={speed}>
                    {speed}x
                  </option>
                ))}
              </select>
              {/* ピクチャインピクチャボタン */}
              {isPipSupported && (
                <button
                  type="button"
                  className={`rounded-full p-2 flex items-center justify-center hover:bg-white/10 ${focusClass} ${
                    isPipActive ? 'bg-white/20' : ''
                  }`}
                  onClick={togglePictureInPicture}
                  tabIndex={0}
                  aria-label="Picture in Picture"
                  title="ピクチャインピクチャ"
                  onFocus={handleFocus}
                  onBlur={handleBlur}
                  onKeyDown={handleKeyDown}
                >
                  <PictureInPicture2 className="w-6 h-6 text-white" />
                </button>
              )}
              {/* フルスクリーン */}
              <button
                type="button"
                className={`rounded-full p-2 flex items-center justify-center hover:bg-white/10 ${focusClass}`}
                onClick={handleFullscreen}
                tabIndex={0}
                aria-label="Fullscreen"
                onFocus={handleFocus}
                onBlur={handleBlur}
                onKeyDown={handleKeyDown}
              >
                {isFullscreen ? (
                  <Minimize2 className="w-6 h-6 text-white" />
                ) : (
                  <Maximize2 className="w-6 h-6 text-white" />
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}