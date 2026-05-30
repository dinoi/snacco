import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { Coins, ChevronRight, Volume2, VolumeX } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { Skeleton } from "@/components/ui/skeleton";
import { VersionBadge } from "@/components/VersionBadge";
import { useRef, useEffect, useState, useCallback } from "react";

// ── Global mute state shared across all feed cards ──────────────────
let globalMuted = true;
const muteListeners = new Set<(muted: boolean) => void>();
function setGlobalMuted(muted: boolean) {
  globalMuted = muted;
  muteListeners.forEach((fn) => fn(muted));
}

// ── Individual video card ───────────────────────────────────────────
function FeedCard({
  tutorial,
  onNavigate,
  isActive,
  preload,
}: {
  tutorial: any;
  onNavigate: (path: string) => void;
  isActive: boolean;
  preload: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isMuted, setIsMuted] = useState(globalMuted);

  // Subscribe to global mute state
  useEffect(() => {
    const handler = (muted: boolean) => {
      setIsMuted(muted);
      if (videoRef.current) videoRef.current.muted = muted;
    };
    muteListeners.add(handler);
    return () => { muteListeners.delete(handler); };
  }, []);

  // Play/pause based on active state
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (isActive) {
      video.muted = globalMuted;
      // Reset to start for instant playback
      if (video.currentTime > 0.5) video.currentTime = 0;
      video.play().catch(() => {});
    } else {
      video.pause();
    }
  }, [isActive]);

  // Stall recovery
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    let stallTimer: ReturnType<typeof setTimeout> | null = null;
    const handleStall = () => {
      if (stallTimer) clearTimeout(stallTimer);
      stallTimer = setTimeout(() => {
        if (video.paused && isActive) video.play().catch(() => {});
      }, 500);
    };
    video.addEventListener("stalled", handleStall);
    video.addEventListener("waiting", handleStall);
    return () => {
      video.removeEventListener("stalled", handleStall);
      video.removeEventListener("waiting", handleStall);
      if (stallTimer) clearTimeout(stallTimer);
    };
  }, [isActive]);

  const toggleMute = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setGlobalMuted(!globalMuted);
  }, []);

  return (
    <div
      className="absolute inset-0 w-full h-full"
      onClick={() => onNavigate(`/tutorial/${tutorial.id}`)}
    >
      {/* Video — preload adjacent slides, autoplay active one */}
      <video
        ref={videoRef}
        src={tutorial.demoVideoUrl}
        className="absolute inset-0 w-full h-full object-cover"
        muted={isMuted}
        loop
        playsInline
        preload={isActive || preload ? "auto" : "none"}
        onError={(e) => {
          const vid = e.currentTarget;
          console.error("[Feed] Video error:", vid.src, vid.error?.message);
        }}
      />

      {/* Mute toggle */}
      <button
        onClick={toggleMute}
        onTouchEnd={(e) => { e.stopPropagation(); toggleMute(e); }}
        className="absolute top-16 right-4 z-30 w-10 h-10 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center border border-white/20 active:scale-[0.92] transition-transform"
        aria-label={isMuted ? "Unmute" : "Mute"}
      >
        {isMuted ? (
          <VolumeX size={18} className="text-white/80" />
        ) : (
          <Volume2 size={18} className="text-white" />
        )}
      </button>

      {/* Bottom gradient */}
      <div className="absolute bottom-0 left-0 right-0 h-72 bg-gradient-to-t from-black/95 via-black/60 to-transparent z-10" />

      {/* Bottom info overlay */}
      <div className="absolute left-0 right-0 z-20 px-4 pb-2" style={{ bottom: "5rem" }}>
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-white text-lg leading-tight truncate">
              {tutorial.title}
            </h3>
            <p className="text-white/60 text-xs mt-0.5 truncate">
              by {tutorial.creatorName ?? "Creator"} · {tutorial.category}
            </p>
          </div>
          <div className="flex items-center gap-1 bg-black/60 backdrop-blur-sm border border-primary/30 rounded-full px-2.5 py-1 shrink-0">
            <Coins size={12} className="text-primary" />
            <span className="text-primary font-bold text-xs">{tutorial.tokenPrice}</span>
          </div>
        </div>
        <button
          className="w-full flex items-center justify-center gap-1.5 bg-primary/90 hover:bg-primary text-primary-foreground font-semibold text-sm py-3 rounded-xl glow-pink transition-all active:scale-[0.97]"
          onClick={(e) => {
            e.stopPropagation();
            onNavigate(`/tutorial/${tutorial.id}`);
          }}
        >
          Unlock Tutorial
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}

// ── TikTok-style swipe container ────────────────────────────────────
export default function Feed() {
  const { data: tutorials, isLoading } = trpc.tutorials.feed.useQuery();
  const [, navigate] = useLocation();
  const { isAuthenticated } = useAuth();

  const [currentIndex, setCurrentIndex] = useState(0);
  const [translateY, setTranslateY] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);

  // Touch tracking refs (not state — no re-renders during drag)
  const touchStartY = useRef(0);
  const touchDeltaY = useRef(0);
  const isDragging = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const totalSlides = tutorials?.length ?? 0;

  const goToSlide = useCallback(
    (index: number) => {
      if (index < 0 || index >= totalSlides || isAnimating) return;
      setIsAnimating(true);
      setCurrentIndex(index);
      setTranslateY(0);
      // Allow animation to finish
      setTimeout(() => setIsAnimating(false), 320);
    },
    [totalSlides, isAnimating]
  );

  // ── Touch handlers ─────────────────────────────────────────────────
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (isAnimating) return;
    touchStartY.current = e.touches[0].clientY;
    touchDeltaY.current = 0;
    isDragging.current = true;
  }, [isAnimating]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isDragging.current) return;
    const delta = e.touches[0].clientY - touchStartY.current;
    touchDeltaY.current = delta;

    // Rubber-band at edges: reduce movement by 70%
    const atTop = currentIndex === 0 && delta > 0;
    const atBottom = currentIndex === totalSlides - 1 && delta < 0;
    const dampened = atTop || atBottom ? delta * 0.3 : delta;

    setTranslateY(dampened);
  }, [currentIndex, totalSlides]);

  const handleTouchEnd = useCallback(() => {
    if (!isDragging.current) return;
    isDragging.current = false;

    const viewportH = window.innerHeight;
    const threshold = viewportH * 0.5; // 50% of screen = snap (as requested)
    const delta = touchDeltaY.current;

    if (delta < -threshold && currentIndex < totalSlides - 1) {
      // Swiped up → next
      goToSlide(currentIndex + 1);
    } else if (delta > threshold && currentIndex > 0) {
      // Swiped down → previous
      goToSlide(currentIndex - 1);
    } else {
      // Snap back
      setTranslateY(0);
    }
  }, [currentIndex, totalSlides, goToSlide]);

  // ── Mouse drag for desktop testing ─────────────────────────────────
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (isAnimating) return;
    touchStartY.current = e.clientY;
    touchDeltaY.current = 0;
    isDragging.current = true;
  }, [isAnimating]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging.current) return;
    const delta = e.clientY - touchStartY.current;
    touchDeltaY.current = delta;
    const atTop = currentIndex === 0 && delta > 0;
    const atBottom = currentIndex === totalSlides - 1 && delta < 0;
    const dampened = atTop || atBottom ? delta * 0.3 : delta;
    setTranslateY(dampened);
  }, [currentIndex, totalSlides]);

  const handleMouseUp = useCallback(() => {
    if (!isDragging.current) return;
    isDragging.current = false;
    const viewportH = window.innerHeight;
    const threshold = viewportH * 0.5;
    const delta = touchDeltaY.current;

    if (delta < -threshold && currentIndex < totalSlides - 1) {
      goToSlide(currentIndex + 1);
    } else if (delta > threshold && currentIndex > 0) {
      goToSlide(currentIndex - 1);
    } else {
      setTranslateY(0);
    }
  }, [currentIndex, totalSlides, goToSlide]);

  // Clean up if mouse leaves window while dragging
  useEffect(() => {
    const handleGlobalUp = () => {
      if (isDragging.current) {
        isDragging.current = false;
        setTranslateY(0);
      }
    };
    window.addEventListener("mouseup", handleGlobalUp);
    return () => window.removeEventListener("mouseup", handleGlobalUp);
  }, []);

  return (
    <div className="h-dvh w-full bg-black overflow-hidden relative">
      {/* Header — fixed overlay */}
      <div className="fixed top-0 left-0 right-0 z-50 px-4 py-3 safe-top flex items-center justify-between">
        <div className="absolute inset-0 bg-gradient-to-b from-black/80 to-transparent pointer-events-none" />
        <h1 className="text-xl font-black text-white tracking-tight relative z-10">snacco</h1>
        <div className="flex items-center gap-3 relative z-10">
          <VersionBadge />
          {!isAuthenticated && (
            <a
              href={getLoginUrl()}
              className="text-xs font-semibold bg-primary text-primary-foreground px-3 py-1.5 rounded-full glow-pink"
            >
              Sign in
            </a>
          )}
        </div>
      </div>

      {/* Loading state */}
      {isLoading && (
        <div className="h-dvh flex items-center justify-center">
          <Skeleton className="w-full h-full bg-muted/20" />
        </div>
      )}

      {/* Empty state */}
      {!isLoading && totalSlides === 0 && (
        <div className="h-dvh flex flex-col items-center justify-center px-6 text-center">
          <div className="text-5xl mb-4">🎬</div>
          <p className="text-white/60 text-sm">No tutorials yet. Be the first creator!</p>
        </div>
      )}

      {/* Swipe container */}
      {totalSlides > 0 && (
        <div
          ref={containerRef}
          className="h-dvh w-full relative touch-none select-none"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
        >
          {/* Render current + adjacent slides for preloading */}
          {tutorials!.map((tutorial, index) => {
            const offset = index - currentIndex;
            // Only render current, prev, and next slides
            if (Math.abs(offset) > 1) return null;

            const baseY = offset * 100; // percentage
            const dragPx = translateY;
            const isActive = offset === 0;

            return (
              <div
                key={tutorial.id}
                className="absolute inset-0 w-full h-full"
                style={{
                  transform: `translateY(calc(${baseY}% + ${dragPx}px))`,
                  transition: isDragging.current ? "none" : "transform 300ms cubic-bezier(0.23, 1, 0.32, 1)",
                  zIndex: isActive ? 2 : 1,
                  willChange: "transform",
                }}
              >
                <FeedCard
                  tutorial={tutorial}
                  onNavigate={navigate}
                  isActive={isActive}
                  preload={Math.abs(offset) <= 1}
                />
              </div>
            );
          })}

          {/* Slide indicators — right side */}
          {totalSlides > 1 && (
            <div className="absolute right-2 top-1/2 -translate-y-1/2 z-40 flex flex-col gap-1.5">
              {tutorials!.map((_, i) => (
                <div
                  key={i}
                  className={`w-1.5 rounded-full transition-all duration-300 ${
                    i === currentIndex
                      ? "h-5 bg-white"
                      : "h-1.5 bg-white/30"
                  }`}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
