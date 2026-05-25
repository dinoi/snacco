import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { Coins, Play, ChevronRight } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { Skeleton } from "@/components/ui/skeleton";
import { useState, useRef, useEffect } from "react";

export default function Feed() {
  const { data: tutorials, isLoading } = trpc.tutorials.feed.useQuery();
  const [, navigate] = useLocation();
  const { isAuthenticated } = useAuth();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [dragOffset, setDragOffset] = useState(0);
  const touchStartY = useRef(0);
  const isDragging = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartY.current = e.targetTouches[0].clientY;
    isDragging.current = true;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging.current) return;
    const currentY = e.targetTouches[0].clientY;
    const diff = currentY - touchStartY.current;
    setDragOffset(diff);
  };

  const handleTouchEnd = () => {
    isDragging.current = false;
    if (!tutorials || tutorials.length === 0) {
      setDragOffset(0);
      return;
    }

    // Snap to next if dragged past halfway point (50% of screen height)
    const screenHeight = window.innerHeight;
    const threshold = screenHeight * 0.5;

    if (Math.abs(dragOffset) > threshold) {
      if (dragOffset < 0) {
        // Dragged up — go to next video
        setCurrentIndex((prev) => (prev + 1) % tutorials.length);
      } else {
        // Dragged down — go to previous video
        setCurrentIndex((prev) => (prev - 1 + tutorials.length) % tutorials.length);
      }
    }
    setDragOffset(0);
  };

  // Handle keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!tutorials || tutorials.length === 0) return;

      if (e.key === "ArrowUp") {
        setCurrentIndex((prev) => (prev + 1) % tutorials.length);
      } else if (e.key === "ArrowDown") {
        setCurrentIndex((prev) => (prev - 1 + tutorials.length) % tutorials.length);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [tutorials]);

  if (isLoading) {
    return (
      <div className="min-h-dvh bg-background">
        <header className="sticky top-0 z-40 bg-background/90 backdrop-blur-md border-b border-border px-4 py-3 flex items-center justify-between safe-top">
          <div className="flex items-baseline gap-2">
            <h1 className="text-2xl font-black gradient-text tracking-tight">snacco</h1>
            <span className="text-[10px] font-mono text-gray-500 border border-gray-700 rounded px-1 py-0.5 leading-none">v1.20</span>
          </div>
        </header>
        <div className="flex flex-col items-center justify-center py-24 px-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="w-full aspect-[9/16] rounded-2xl bg-muted mb-4" />
          ))}
        </div>
      </div>
    );
  }

  if (!tutorials || tutorials.length === 0) {
    return (
      <div className="min-h-dvh bg-background">
        <header className="sticky top-0 z-40 bg-background/90 backdrop-blur-md border-b border-border px-4 py-3 flex items-center justify-between safe-top">
          <div className="flex items-baseline gap-2">
            <h1 className="text-2xl font-black gradient-text tracking-tight">snacco</h1>
            <span className="text-[10px] font-mono text-gray-500 border border-gray-700 rounded px-1 py-0.5 leading-none">v1.20</span>
          </div>
        </header>
        <div className="flex flex-col items-center justify-center py-24 px-6 text-center">
          <div className="text-5xl mb-4">🎬</div>
          <p className="text-muted-foreground text-sm">No tutorials yet. Be the first creator!</p>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="min-h-dvh bg-background overflow-hidden"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-40 bg-gradient-to-b from-black/60 to-transparent px-4 py-3 flex items-center justify-between safe-top pointer-events-none">
        <div className="flex items-baseline gap-2">
          <h1 className="text-2xl font-black gradient-text tracking-tight">snacco</h1>
          <span className="text-[10px] font-mono text-gray-500 border border-gray-700 rounded px-1 py-0.5 leading-none">v1.20</span>
        </div>
        {!isAuthenticated && (
          <a
            href={getLoginUrl()}
            className="text-xs font-semibold bg-primary text-primary-foreground px-3 py-1.5 rounded-full glow-pink pointer-events-auto"
          >
            Sign in
          </a>
        )}
      </header>

      {/* Carousel container */}
      <div className="relative w-full h-dvh overflow-hidden">
        {/* Carousel track with smooth transition */}
        <div
          className="flex transition-transform"
          style={{
            transform: `translateY(calc(-${currentIndex * 100}% + ${dragOffset}px))`,
            transitionDuration: isDragging.current ? "0ms" : "500ms",
            transitionTimingFunction: "cubic-bezier(0.4, 0, 0.2, 1)",
          }}
        >
          {tutorials.map((tutorial, idx) => (
            <div key={tutorial.id} className="w-full h-dvh flex-shrink-0 relative bg-black">
              {/* Video */}
              <video
                src={tutorial.demoVideoUrl}
                className="w-full h-full object-cover"
                muted
                loop
                playsInline
                autoPlay={idx === currentIndex}
              />

              {/* Gradient overlay */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />

              {/* Play button overlay */}
              <div className="absolute inset-0 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                <div className="w-16 h-16 rounded-full bg-primary/20 backdrop-blur-sm border border-primary/40 flex items-center justify-center glow-pink">
                  <Play size={28} className="text-primary fill-primary ml-1" />
                </div>
              </div>

              {/* Bottom info overlay */}
              <div className="absolute bottom-0 left-0 right-0 p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-white text-lg leading-tight truncate">{tutorial.title}</h3>
                    <p className="text-white/60 text-sm mt-0.5 truncate">
                      by {tutorial.creatorName ?? "Creator"} · {tutorial.category}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 bg-black/60 backdrop-blur-sm border border-primary/30 rounded-full px-2.5 py-1 shrink-0">
                    <Coins size={14} className="text-primary" />
                    <span className="text-primary font-bold text-sm">{tutorial.tokenPrice}</span>
                  </div>
                </div>
                <button
                  className="w-full flex items-center justify-center gap-1.5 bg-primary/90 hover:bg-primary text-primary-foreground font-semibold text-sm py-2.5 rounded-xl glow-pink transition-all"
                  onClick={() => navigate(`/tutorial/${tutorial.id}`)}
                >
                  Unlock Tutorial
                  <ChevronRight size={16} />
                </button>
              </div>

              {/* Video counter */}
              <div className="absolute top-20 right-4 bg-black/60 backdrop-blur-sm border border-white/20 rounded-full px-3 py-1 text-white/80 text-xs font-mono">
                {idx + 1} / {tutorials.length}
              </div>
            </div>
          ))}
        </div>

        {/* Swipe hint */}
        {tutorials.length > 1 && (
          <div className="absolute bottom-32 right-4 flex flex-col items-center gap-1 text-white/40 text-xs animate-pulse pointer-events-none">
            <div>↑</div>
            <div>Swipe</div>
            <div>↓</div>
          </div>
        )}
      </div>
    </div>
  );
}
