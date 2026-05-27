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

const SPEED_OPTIONS = [0.5, 0.75, 1, 1.25] as const;
type Speed = (typeof SPEED_OPTIONS)[number];

export default function Player() {
  const { id } = useParams<{ id: string }>();
  const tutorialId = parseInt(id ?? "0");
  const [, navigate] = useLocation();
  const { isAuthenticated } = useAuth();

  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [speed, setSpeed] = useState<Speed>(1);
  const [activeChapter, setActiveChapter] = useState(0);
  const [showControls, setShowControls] = useState(true);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
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
    <div
      className="min-h-dvh bg-black flex flex-col"
      onClick={resetHideTimer}
    >
      {/* Video */}
      <div className="relative flex-1 flex flex-col">
        <video
          ref={videoRef}
          src={tutorial?.tutorialVideoUrl}
          className="w-full h-full object-contain"
          playsInline
          preload="metadata"
          onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
          onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          onEnded={() => setIsPlaying(false)}
          onClick={togglePlay}
        />

        {/* Controls overlay */}
        <div
          className={cn(
            "absolute inset-0 flex flex-col justify-between transition-opacity duration-300",
            showControls ? "opacity-100" : "opacity-0 pointer-events-none"
          )}
        >
          {/* Top bar */}
          <div className="flex items-center justify-between px-4 pt-4 safe-top bg-gradient-to-b from-black/70 to-transparent pb-8">
            <button
              onClick={() => navigate(`/tutorial/${tutorialId}`)}
              className="w-9 h-9 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center"
            >
              <ArrowLeft size={18} className="text-white" />
            </button>
            <div className="text-center">
              <p className="text-white font-bold text-sm leading-tight truncate max-w-[180px]">{tutorial?.title}</p>
              {chapters && chapters[activeChapter] && (
                <p className="text-white/60 text-xs">{chapters[activeChapter].label}</p>
              )}
            </div>
            <div className="flex items-center gap-2">
              <VersionBadge />
              {/* Speed button */}
              <div className="relative">
              <button
                onClick={(e) => { e.stopPropagation(); setShowSpeedMenu(!showSpeedMenu); resetHideTimer(); }}
                className="flex items-center gap-1 bg-black/50 backdrop-blur-sm rounded-full px-3 py-1.5 border border-white/20"
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

          {/* Centre play/pause */}
          <div className="flex items-center justify-center gap-8">
            <button
              onClick={(e) => { e.stopPropagation(); rewind10(); }}
              className="w-14 h-14 rounded-full bg-black/50 backdrop-blur-sm border border-white/20 flex flex-col items-center justify-center gap-0.5"
            >
              <RotateCcw size={20} className="text-white" />
              <span className="text-white text-[9px] font-bold">10s</span>
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); togglePlay(); }}
              className="w-18 h-18 rounded-full bg-primary/20 backdrop-blur-sm border-2 border-primary flex items-center justify-center glow-pink"
              style={{ width: 72, height: 72 }}
            >
              {isPlaying
                ? <Pause size={32} className="text-white" />
                : <Play size={32} className="text-white fill-white ml-1" />
              }
            </button>
            <div className="w-14 h-14" /> {/* spacer */}
          </div>

          {/* Bottom: progress + chapter nav */}
          <div className="px-4 pb-6 safe-bottom bg-gradient-to-t from-black/80 to-transparent pt-10 space-y-3">
            {/* Progress bar */}
            <div className="space-y-1">
              <div
                className="w-full h-1 bg-white/20 rounded-full overflow-hidden cursor-pointer"
                onClick={(e) => {
                  e.stopPropagation();
                  const rect = e.currentTarget.getBoundingClientRect();
                  const pct = (e.clientX - rect.left) / rect.width;
                  if (videoRef.current) videoRef.current.currentTime = pct * duration;
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
              </div>
              <div className="flex justify-between text-[10px] text-white/50 font-mono">
                <span>{formatTime(currentTime)}</span>
                <span>{formatTime(duration)}</span>
              </div>
            </div>

            {/* Chapter navigation */}
            {chapters && chapters.length > 0 && (
              <div className="flex items-center gap-2">
                <button
                  onClick={(e) => { e.stopPropagation(); prevChapter(); }}
                  disabled={activeChapter === 0}
                  className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center disabled:opacity-30"
                >
                  <ChevronLeft size={18} className="text-white" />
                </button>
                <div className="flex-1 overflow-x-auto hide-scrollbar">
                  <div className="flex gap-2 min-w-max">
                    {chapters.map((ch, i) => (
                      <button
                        key={ch.id}
                        onClick={(e) => { e.stopPropagation(); goToChapter(i); }}
                        className={cn(
                          "px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all",
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
                  className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center disabled:opacity-30"
                >
                  <ChevronRight size={18} className="text-white" />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
