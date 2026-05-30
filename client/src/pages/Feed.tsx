import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { Coins, ChevronRight } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { Skeleton } from "@/components/ui/skeleton";
import { VersionBadge } from "@/components/VersionBadge";

export default function Feed() {
  const { data: tutorials, isLoading } = trpc.tutorials.feed.useQuery();
  const [, navigate] = useLocation();
  const { isAuthenticated } = useAuth();

  return (
    <div className="min-h-dvh bg-black snap-y snap-mandatory overflow-y-auto">
      {/* Loading state */}
      {isLoading && (
        <div className="h-dvh flex items-center justify-center">
          <div className="space-y-4 w-full px-6">
            <Skeleton className="w-full aspect-[9/16] rounded-2xl bg-muted/20" />
          </div>
        </div>
      )}

      {/* Empty state */}
      {!isLoading && tutorials?.length === 0 && (
        <div className="h-dvh flex flex-col items-center justify-center px-6 text-center">
          <div className="text-5xl mb-4">🎬</div>
          <p className="text-white/60 text-sm">No tutorials yet. Be the first creator!</p>
        </div>
      )}

      {/* Feed cards — each fills viewport */}
      {tutorials?.map((tutorial) => (
        <div
          key={tutorial.id}
          className="relative h-dvh w-full snap-start snap-always"
          onClick={() => navigate(`/tutorial/${tutorial.id}`)}
        >
          {/* Full-screen video background */}
          <video
            src={tutorial.demoVideoUrl}
            className="absolute inset-0 w-full h-full object-cover"
            muted
            loop
            playsInline
            autoPlay
            preload="auto"
            onError={e => {
              const vid = e.currentTarget as HTMLVideoElement;
              console.error('[Feed] Video load error:', vid.src, vid.error?.message);
            }}
          />

          {/* Top gradient for header readability */}
          <div className="absolute top-0 left-0 right-0 h-24 bg-gradient-to-b from-black/60 to-transparent z-10" />

          {/* Header overlay */}
          <div className="absolute top-0 left-0 right-0 z-20 px-4 py-3 safe-top flex items-center justify-between">
            <h1 className="text-xl font-black text-white tracking-tight">snacco</h1>
            <div className="flex items-center gap-3">
              <VersionBadge />
              {!isAuthenticated && (
                <a
                  href={getLoginUrl()}
                  onClick={(e) => e.stopPropagation()}
                  className="text-xs font-semibold bg-primary text-primary-foreground px-3 py-1.5 rounded-full glow-pink"
                >
                  Sign in
                </a>
              )}
            </div>
          </div>

          {/* Bottom gradient for info readability */}
          <div className="absolute bottom-0 left-0 right-0 h-64 bg-gradient-to-t from-black/90 via-black/50 to-transparent z-10" />

          {/* Bottom info overlay — always visible */}
          <div className="absolute bottom-0 left-0 right-0 z-20 p-4 pb-8 safe-bottom">
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
              onClick={(e) => { e.stopPropagation(); navigate(`/tutorial/${tutorial.id}`); }}
            >
              Unlock Tutorial
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
