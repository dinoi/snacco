import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { Coins, ChevronRight } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { Skeleton } from "@/components/ui/skeleton";
import { VersionBadge } from "@/components/VersionBadge";
import { useRef, useEffect, useCallback } from "react";

function FeedCard({ tutorial, onNavigate }: { tutorial: any; onNavigate: (path: string) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    const card = cardRef.current;
    if (!video || !card) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          video.play().catch(() => {});
        } else {
          video.pause();
        }
      },
      { threshold: 0.6 }
    );

    observer.observe(card);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={cardRef}
      className="relative h-dvh w-full snap-start snap-always"
      onClick={() => onNavigate(`/tutorial/${tutorial.id}`)}
    >
      {/* Full-screen video background */}
      <video
        ref={videoRef}
        src={tutorial.demoVideoUrl}
        className="absolute inset-0 w-full h-full object-cover"
        muted
        loop
        playsInline
        preload="auto"
        onError={e => {
          const vid = e.currentTarget as HTMLVideoElement;
          console.error('[Feed] Video load error:', vid.src, vid.error?.message);
        }}
      />

      {/* Bottom gradient for info readability */}
      <div className="absolute bottom-0 left-0 right-0 h-72 bg-gradient-to-t from-black/95 via-black/60 to-transparent z-10" />

      {/* Bottom info overlay — positioned at ~60% from top to be above fold */}
      <div className="absolute left-0 right-0 z-20 p-4" style={{ bottom: '25%' }}>
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-white text-lg leading-tight truncate">{tutorial.title}</h3>
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
          onClick={(e) => { e.stopPropagation(); onNavigate(`/tutorial/${tutorial.id}`); }}
        >
          Unlock Tutorial
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}

export default function Feed() {
  const { data: tutorials, isLoading } = trpc.tutorials.feed.useQuery();
  const [, navigate] = useLocation();
  const { isAuthenticated } = useAuth();

  return (
    <div className="min-h-dvh bg-black snap-y snap-mandatory overflow-y-auto">
      {/* Header — fixed overlay */}
      <div className="fixed top-0 left-0 right-0 z-50 px-4 py-3 safe-top flex items-center justify-between">
        <div className="absolute inset-0 bg-gradient-to-b from-black/60 to-transparent pointer-events-none" />
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
      {!isLoading && tutorials?.length === 0 && (
        <div className="h-dvh flex flex-col items-center justify-center px-6 text-center">
          <div className="text-5xl mb-4">🎬</div>
          <p className="text-white/60 text-sm">No tutorials yet. Be the first creator!</p>
        </div>
      )}

      {/* Feed cards */}
      {tutorials?.map((tutorial) => (
        <FeedCard key={tutorial.id} tutorial={tutorial} onNavigate={navigate} />
      ))}
    </div>
  );
}
