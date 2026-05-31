import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { Coins, ChevronRight } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { Skeleton } from "@/components/ui/skeleton";
import { VersionBadge } from "@/components/VersionBadge";
import { useRef, useEffect, useState, useCallback } from "react";



// ── Video loading skeleton ──────────────────────────────────────────
function VideoLoadingSkeleton({ thumbnailUrl }: { thumbnailUrl?: string }) {
  return (
    <div className="absolute inset-0 w-full h-full bg-black z-5">
      {thumbnailUrl ? (
        <img
          src={thumbnailUrl}
          alt=""
          className="absolute inset-0 w-full h-full object-cover blur-md scale-105 opacity-60"
        />
      ) : null}
      {/* Shimmer overlay */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-black/60" />
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="w-12 h-12 rounded-full border-2 border-white/30 border-t-white animate-spin" />
      </div>
    </div>
  );
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
  const [isVideoLoading, setIsVideoLoading] = useState(true);



  // Play/pause based on active state
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (isActive) {
      // Wait for video to be ready before calling play
      if (video.readyState >= 2) {
        video.play().catch(() => {});
      } else {
        const onReady = () => {
          video.play().catch(() => {});
          video.removeEventListener("canplay", onReady);
        };
        video.addEventListener("canplay", onReady);
        return () => video.removeEventListener("canplay", onReady);
      }
    } else {
      video.pause();
    }
  }, [isActive]);

  // Track video loading state
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleCanPlay = () => setIsVideoLoading(false);
    const handleWaiting = () => setIsVideoLoading(true);
    const handlePlaying = () => setIsVideoLoading(false);

    video.addEventListener("canplay", handleCanPlay);
    video.addEventListener("waiting", handleWaiting);
    video.addEventListener("playing", handlePlaying);

    // If video is already ready
    if (video.readyState >= 3) setIsVideoLoading(false);

    return () => {
      video.removeEventListener("canplay", handleCanPlay);
      video.removeEventListener("waiting", handleWaiting);
      video.removeEventListener("playing", handlePlaying);
    };
  }, []);

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



  return (
    <div
      className="absolute inset-0 w-full h-full"
    >
      {/* Loading skeleton — shows while video is buffering */}
      {isVideoLoading && isActive && (
        <VideoLoadingSkeleton thumbnailUrl={tutorial.thumbnailUrl} />
      )}

      {/* Video — preload adjacent slides, autoplay active one */}
      {/* eslint-disable-next-line react/no-unknown-property */}
      <video
        ref={videoRef}
        src={tutorial.demoVideoUrl}
        className="absolute inset-0 w-full h-full object-cover"
        muted
        loop
        playsInline
        preload={isActive || preload ? "auto" : "metadata"}
        onError={(e) => {
          const vid = e.currentTarget;
          console.error("[Feed] Video error:", vid.src, vid.error?.message);
        }}
      />



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

// ── Velocity threshold constants ────────────────────────────────────
const DISTANCE_THRESHOLD = 0.5; // 50% of viewport for slow drags
const VELOCITY_THRESHOLD = 0.4; // px/ms — a quick flick above this snaps regardless of distance
const MIN_DISTANCE_FOR_VELOCITY = 30; // px — minimum drag distance before velocity kicks in

// ── TikTok-style swipe container ────────────────────────────────────
export default function Feed() {
  const { data: tutorials, isLoading } = trpc.tutorials.feed.useQuery();
  const [location, navigate] = useLocation();
  const { isAuthenticated } = useAuth();

  // Feed stays mounted when on /tutorial/:id — detect visibility for pause/resume
  const isFeedVisible = location === "/";

  const [currentIndex, setCurrentIndex] = useState(0);
  const [translateY, setTranslateY] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);

  // Touch tracking refs (not state — no re-renders during drag)
  const touchStartY = useRef(0);
  const touchStartTime = useRef(0);
  const touchDeltaY = useRef(0);
  const isDragging = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const totalSlides = tutorials?.length ?? 0;

  // Refs for wheel handler to avoid stale closures
  const currentIndexRef = useRef(currentIndex);
  const isAnimatingRef = useRef(isAnimating);
  currentIndexRef.current = currentIndex;
  isAnimatingRef.current = isAnimating;
  const totalSlidesRef = useRef(totalSlides);
  totalSlidesRef.current = totalSlides;

  const goToSlide = useCallback(
    (index: number) => {
      if (index < 0 || index >= totalSlidesRef.current || isAnimatingRef.current) return;
      setIsAnimating(true);
      setCurrentIndex(index);
      setTranslateY(0);
      setTimeout(() => setIsAnimating(false), 320);
    },
    [] // empty deps — reads from refs
  );

  const goToSlideRef = useRef(goToSlide);
  goToSlideRef.current = goToSlide;

  // Determine whether to snap based on distance OR velocity
  const shouldSnap = useCallback((delta: number, elapsed: number): "next" | "prev" | null => {
    const absDelta = Math.abs(delta);
    const viewportH = window.innerHeight;

    // Velocity-based: quick flick with minimum distance
    if (absDelta > MIN_DISTANCE_FOR_VELOCITY && elapsed > 0) {
      const velocity = absDelta / elapsed; // px/ms
      if (velocity > VELOCITY_THRESHOLD) {
        return delta < 0 ? "next" : "prev";
      }
    }

    // Distance-based: slow drag past 50% threshold
    if (absDelta > viewportH * DISTANCE_THRESHOLD) {
      return delta < 0 ? "next" : "prev";
    }

    return null;
  }, []);

  // ── Touch handlers ─────────────────────────────────────────────────
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (isAnimating) return;
    touchStartY.current = e.touches[0].clientY;
    touchStartTime.current = Date.now();
    touchDeltaY.current = 0;
    isDragging.current = true;
  }, [isAnimating]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isDragging.current) return;
    const delta = e.touches[0].clientY - touchStartY.current;
    touchDeltaY.current = delta;

    // Rubber-band at edges
    const atTop = currentIndex === 0 && delta > 0;
    const atBottom = currentIndex === totalSlides - 1 && delta < 0;
    const dampened = atTop || atBottom ? delta * 0.3 : delta;

    setTranslateY(dampened);
  }, [currentIndex, totalSlides]);

  const handleTouchEnd = useCallback(() => {
    if (!isDragging.current) return;
    isDragging.current = false;

    const delta = touchDeltaY.current;
    const elapsed = Date.now() - touchStartTime.current;
    const direction = shouldSnap(delta, elapsed);

    if (direction === "next" && currentIndex < totalSlides - 1) {
      goToSlide(currentIndex + 1);
    } else if (direction === "prev" && currentIndex > 0) {
      goToSlide(currentIndex - 1);
    } else {
      setTranslateY(0);
    }
  }, [currentIndex, totalSlides, goToSlide, shouldSnap]);

  // ── Mouse drag for desktop testing ─────────────────────────────────
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (isAnimating) return;
    touchStartY.current = e.clientY;
    touchStartTime.current = Date.now();
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

    const delta = touchDeltaY.current;
    const elapsed = Date.now() - touchStartTime.current;
    const direction = shouldSnap(delta, elapsed);

    if (direction === "next" && currentIndex < totalSlides - 1) {
      goToSlide(currentIndex + 1);
    } else if (direction === "prev" && currentIndex > 0) {
      goToSlide(currentIndex - 1);
    } else {
      setTranslateY(0);
    }
  }, [currentIndex, totalSlides, goToSlide, shouldSnap]);

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

  // ── Desktop wheel/trackpad scroll ──────────────────────────────────
  useEffect(() => {
    let wheelCooldown = false;
    const handleWheel = (e: WheelEvent) => {
      if (wheelCooldown || isAnimatingRef.current) return;
      if (Math.abs(e.deltaY) < 50) return;

      const idx = currentIndexRef.current;
      const total = totalSlidesRef.current;

      if (e.deltaY > 0 && idx < total - 1) goToSlideRef.current(idx + 1);
      else if (e.deltaY < 0 && idx > 0) goToSlideRef.current(idx - 1);

      wheelCooldown = true;
      setTimeout(() => { wheelCooldown = false; }, 300);
    };

    window.addEventListener("wheel", handleWheel, { passive: true });
    return () => window.removeEventListener("wheel", handleWheel);
  }, []); // empty deps — reads everything through refs

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
            const isActive = offset === 0 && isFeedVisible;

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
