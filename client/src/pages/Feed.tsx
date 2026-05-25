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
  const touchStartY = useRef(0);
  const touchEndY = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartY.current = e.targetTouches[0].clientY;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    touchEndY.current = e.changedTouches[0].clientY;
    handleSwipe();
  };

  const handleSwipe = () => {
    const diff = touchStartY.current - touchEndY.current;
    const threshold = 50; // minimum swipe distance

    if (!tutorials || tutorials.length === 0) return;

    if (Math.abs(diff) > threshold) {
      if (diff > 0) {
        // Swiped up — go to next video
        setCurrentIndex((prev) => (prev + 1) % tutorials.length);
      } else {
        // Swiped down — go to previous video
        setCurrentIndex((prev) => (prev - 1 + tutorials.length) % tutorials.length);
      }
    }
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

  const tutorial = tutorials[currentIndex];

  return (
    <div
      ref={containerRef}
      className="min-h-dvh bg-background overflow-hidden"
      onTouchStart={handleTouchStart}
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

      {/* Full-screen video */}
      <div className="relative w-full h-dvh bg-black">
        <video
          key={tutorial.id}
          src={tutorial.demoVideoUrl}
          className="w-full h-full object-cover"
          muted
          loop
          playsInline
          autoPlay
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
          {currentIndex + 1} / {tutorials.length}
        </div>

        {/* Swipe hint */}
        {tutorials.length > 1 && (
          <div className="absolute bottom-32 right-4 flex flex-col items-center gap-1 text-white/40 text-xs animate-pulse">
            <div>↑</div>
            <div>Swipe</div>
            <div>↓</div>
          </div>
        )}
      </div>
    </div>
  );
}
