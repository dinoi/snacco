import { trpc } from "@/lib/trpc";
import { useParams, useLocation } from "wouter";
import { useRef, useState, useEffect, useCallback } from "react";
import {
  ArrowLeft,
  RotateCcw,
  Play,
  Pause,
  ChevronLeft,
  ChevronRight,
  Gauge,
} from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { cn, formatTime } from "@/lib/utils";
import { toast } from "sonner";
import { VersionBadge } from "@/components/VersionBadge";

const SPEED_OPTIONS = [0.5, 0.75, 1, 1.25, 1.5] as const;
type Speed = (typeof SPEED_OPTIONS)[number];

export default function Player() {
  const { id } = useParams<{ id: string }>();
  const tutorialId = parseInt(id ?? "0");
  const [, navigate] = useLocation();
  const { isAuthenticated } = useAuth();

  const videoRef = useRef<HTMLVideoElement>(null);
  const progressBarRef = useRef<HTMLDivElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isBuffering, setIsBuffering] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [speed, setSpeed] = useState<Speed>(1);
  const [activeChapter, setActiveChapter] = useState(0);
  const [showControls, setShowControls] = useState(true);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const hideControlsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data: tutorial } = trpc.tutorials.get.useQuery({ id: tutorialId });
  const { data: chapters } = trpc.tutorials.getChapters.useQuery({ tutorialId });
  const { data: unlockStatus } = trpc.tutorials.isUnlocked.useQuery(
    { tutorialId },
    { enabled: isAuthenticated }
  );

  // Guard: redirect unauthenticated users and those who haven't unlocked
  useEffect(() => {
    if (!isAuthenticated) {
      navigate(`/tutorial/${tutorialId}`);
      return;
    }
    if (unlockStatus && !unlockStatus.unlocked) {
      toast.error("Please unlock this tutorial first.");
      navigate(`/tutorial/${tutorialId}`);
    }
  }, [isAuthenticated, unlockStatus, tutorialId, navigate]);

  // Update active chapter based on current time
  useEffect(() => {
    if (!chapters || chapters.length === 0) return;
    let active = 0;
    for (let i = 0; i < chapters.length; i++) {
      if (currentTime >= chapters[i].timestampSeconds) active = i;
    }
    setActiveChapter(active);
  }, [currentTime, chapters]);

  const resetHideTimer = useCallback(() => {
    if (hideControlsTimer.current) clearTimeout(hideControlsTimer.current);
    setShowControls(true);
    hideControlsTimer.current = setTimeout(() => setShowControls(false), 3000);
  }, []);

  useEffect(() => {
    resetHideTimer();
    return () => { if (hideControlsTimer.current) clearTimeout(hideControlsTimer.current); };
  }, [resetHideTimer]);

  // Handle scrubbing (both click and drag)
  const handleScrub = useCallback((clientX: number) => {
    if (!progressBarRef.current || !videoRef.current) return;
    const rect = progressBarRef.current.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    videoRef.current.currentTime = pct * duration;
  }, [duration]);

  // Mouse/touch drag handlers
  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      handleScrub(e.clientX);
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length > 0) {
        handleScrub(e.touches[0].clientX);
      }
    };

    const handleEnd = () => {
      setIsDragging(false);
      resetHideTimer();
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("touchmove", handleTouchMove);
    document.addEventListener("mouseup", handleEnd);
    document.addEventListener("touchend", handleEnd);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("touchmove", handleTouchMove);
      document.removeEventListener("mouseup", handleEnd);
      document.removeEventListener("touchend", handleEnd);
    };
  }, [isDragging, handleScrub, resetHideTimer]);

  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) { v.play(); setIsPlaying(true); }
    else { v.pause(); setIsPlaying(false); }
    resetHideTimer();
  };

  const rewind10 = () => {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = Math.max(0, v.currentTime - 10);
    resetHideTimer();
  };

  const setPlaybackSpeed = (s: Speed) => {
    const v = videoRef.current;
    if (v) v.playbackRate = s;
    setSpeed(s);
    setShowSpeedMenu(false);
    resetHideTimer();
  };

  const goToChapter = (index: number) => {
    const v = videoRef.current;
    if (!v || !chapters) return;
    const ch = chapters[index];
    if (!ch) return;
    v.currentTime = ch.timestampSeconds;
    setActiveChapter(index);
    resetHideTimer();
  };

  const prevChapter = () => goToChapter(Math.max(0, activeChapter - 1));
  const nextChapter = () => goToChapter(Math.min((chapters?.length ?? 1) - 1, activeChapter + 1));

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="h-dvh w-full bg-black flex flex-col overflow-hidden">
      {/* ── Top bar ── always visible, outside video */}
      <div className="shrink-0 flex items-center justify-between px-4 py-3 safe-top bg-black">
        <button
          onClick={() => navigate(`/tutorial/${tutorialId}`)}
          className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center"
        >
          <ArrowLeft size={18} className="text-white" />
        </button>
        <div className="text-center flex-1 min-w-0 px-3">
          <p className="text-white font-bold text-sm leading-tight truncate">{tutorial?.title}</p>
          {chapters && chapters[activeChapter] && (
            <p className="text-white/60 text-xs truncate">{chapters[activeChapter].label}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <VersionBadge />
          {/* Speed button */}
          <div className="relative">
            <button
              onClick={(e) => { e.stopPropagation(); setShowSpeedMenu(!showSpeedMenu); resetHideTimer(); }}
              className="flex items-center gap-1 bg-white/10 rounded-full px-3 py-1.5 border border-white/20"
            >
              <Gauge size={14} className="text-primary" />
              <span className="text-white text-xs font-bold">{speed}x</span>
            </button>
            {showSpeedMenu && (
              <div className="absolute right-0 top-10 bg-card border border-border rounded-xl overflow-hidden shadow-xl z-50 min-w-[80px]">
                {SPEED_OPTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={(e) => { e.stopPropagation(); setPlaybackSpeed(s); }}
                    className={cn(
                      "w-full px-4 py-2.5 text-sm font-semibold text-left transition-colors",
                      s === speed
                        ? "bg-primary text-primary-foreground"
                        : "text-foreground hover:bg-accent"
                    )}
                  >
                    {s}x
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Video area ── fills remaining space between top bar and bottom controls */}
      <div
        className="relative flex-1 min-h-0"
        onClick={resetHideTimer}
      >
        <video
          ref={videoRef}
          src={tutorial?.tutorialVideoUrl}
          className="absolute inset-0 w-full h-full object-contain"
          playsInline
          preload="auto"
          onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
          onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
          onCanPlay={() => setIsBuffering(false)}
          onWaiting={() => setIsBuffering(true)}
          onPlaying={() => { setIsBuffering(false); setIsPlaying(true); }}
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          onEnded={() => setIsPlaying(false)}
          onClick={togglePlay}
          onError={(e) => console.error('[Player] Video error:', e)}
        />

        {/* Loading spinner overlay */}
        {isBuffering && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60 z-10">
            <div className="flex flex-col items-center gap-3">
              <div className="w-12 h-12 border-3 border-white/30 border-t-primary rounded-full animate-spin" />
              <p className="text-white/70 text-sm font-medium">Loading tutorial...</p>
            </div>
          </div>
        )}

        {/* Play/Rewind controls — overlaid at bottom of video area */}
        <div
          className={cn(
            "absolute left-0 right-0 bottom-0 z-20 transition-opacity duration-300",
            showControls ? "opacity-100" : "opacity-0 pointer-events-none"
          )}
        >
          {/* Gradient backdrop for controls */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent pointer-events-none" />

          <div className="relative px-4 pb-3 pt-16">
            {/* Play + Rewind buttons */}
            <div className="flex items-center justify-center gap-6 mb-3">
              <button
                onClick={(e) => { e.stopPropagation(); rewind10(); }}
                className="w-12 h-12 rounded-full bg-black/50 backdrop-blur-sm border border-white/20 flex flex-col items-center justify-center gap-0.5"
              >
                <RotateCcw size={18} className="text-white" />
                <span className="text-white text-[8px] font-bold">10s</span>
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); togglePlay(); }}
                className="w-16 h-16 rounded-full bg-primary/20 backdrop-blur-sm border-2 border-primary flex items-center justify-center glow-pink"
              >
                {isPlaying
                  ? <Pause size={28} className="text-white" />
                  : <Play size={28} className="text-white fill-white ml-1" />
                }
              </button>
              <div className="w-12 h-12" /> {/* spacer for symmetry */}
            </div>

            {/* Progress bar */}
            <div className="space-y-1">
              <div
                ref={progressBarRef}
                className="relative w-full h-2 bg-white/20 rounded-full overflow-hidden cursor-pointer group"
                onMouseDown={(e) => {
                  e.stopPropagation();
                  setIsDragging(true);
                  handleScrub(e.clientX);
                }}
                onTouchStart={(e) => {
                  e.stopPropagation();
                  setIsDragging(true);
                  if (e.touches.length > 0) {
                    handleScrub(e.touches[0].clientX);
                  }
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  handleScrub(e.clientX);
                  resetHideTimer();
                }}
              >
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${progressPercent}%`,
                    background: "linear-gradient(90deg, oklch(0.65 0.30 340), oklch(0.55 0.28 15))",
                  }}
                />
                <div
                  className="absolute top-1/2 w-1 h-4 bg-white rounded-full shadow-lg transition-all"
                  style={{
                    left: `${progressPercent}%`,
                    transform: "translate(-50%, -50%)",
                    opacity: isDragging ? 1 : 0.8,
                    width: isDragging ? "12px" : "4px",
                  }}
                />
              </div>
              <div className="flex justify-between text-[10px] text-white/50 font-mono">
                <span>{formatTime(currentTime)}</span>
                <span>{formatTime(duration)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Chapter selectors ── always visible, fixed above tab bar */}
      {chapters && chapters.length > 0 && (
        <div className="shrink-0 px-3 py-2.5 bg-black border-t border-white/10 pb-[calc(env(safe-area-inset-bottom)+4.5rem)]">
          <div className="flex items-center gap-2">
            <button
              onClick={(e) => { e.stopPropagation(); prevChapter(); }}
              disabled={activeChapter === 0}
              className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center disabled:opacity-30 hover:bg-white/20 transition-colors shrink-0"
            >
              <ChevronLeft size={16} className="text-white" />
            </button>
            <div className="flex-1 overflow-x-auto hide-scrollbar">
              <div className="flex gap-2 min-w-max">
                {chapters.map((ch, i) => (
                  <button
                    key={ch.id}
                    onClick={(e) => { e.stopPropagation(); goToChapter(i); }}
                    className={cn(
                      "px-4 py-2 rounded-full text-xs font-semibold whitespace-nowrap transition-all",
                      i === activeChapter
                        ? "bg-primary text-primary-foreground glow-pink"
                        : "bg-white/10 text-white/70 hover:bg-white/20"
                    )}
                  >
                    {ch.label}
                  </button>
                ))}
              </div>
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); nextChapter(); }}
              disabled={activeChapter === (chapters.length - 1)}
              className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center disabled:opacity-30 hover:bg-white/20 transition-colors shrink-0"
            >
              <ChevronRight size={16} className="text-white" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
