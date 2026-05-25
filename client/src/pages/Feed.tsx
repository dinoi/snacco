import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { Coins, Play, ChevronRight } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { Skeleton } from "@/components/ui/skeleton";

export default function Feed() {
  const { data: tutorials, isLoading } = trpc.tutorials.feed.useQuery();
  const [, navigate] = useLocation();
  const { isAuthenticated } = useAuth();

  return (
    <div className="min-h-dvh bg-background">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-background/90 backdrop-blur-md border-b border-border px-4 py-3 flex items-center justify-between safe-top">
        <div className="flex items-baseline gap-2">
          <h1 className="text-2xl font-black gradient-text tracking-tight">snacco</h1>
          <span className="text-[10px] font-mono text-gray-500 border border-gray-700 rounded px-1 py-0.5 leading-none">v1.14</span>
        </div>
        {!isAuthenticated && (
          <a
            href={getLoginUrl()}
            className="text-xs font-semibold bg-primary text-primary-foreground px-3 py-1.5 rounded-full glow-pink"
          >
            Sign in
          </a>
        )}
      </header>

      {/* Feed */}
      <div className="divide-y divide-border">
        {isLoading && (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="p-4 space-y-3">
              <Skeleton className="w-full aspect-[9/16] rounded-2xl bg-muted" />
              <Skeleton className="h-4 w-3/4 bg-muted" />
              <Skeleton className="h-3 w-1/2 bg-muted" />
            </div>
          ))
        )}

        {!isLoading && tutorials?.length === 0 && (
          <div className="flex flex-col items-center justify-center py-24 px-6 text-center">
            <div className="text-5xl mb-4">🎬</div>
            <p className="text-muted-foreground text-sm">No tutorials yet. Be the first creator!</p>
          </div>
        )}

        {tutorials?.map((tutorial) => (
          <div
            key={tutorial.id}
            className="group cursor-pointer"
            onClick={() => navigate(`/tutorial/${tutorial.id}`)}
          >
            {/* Demo video thumbnail */}
            <div className="relative w-full aspect-[9/16] bg-black overflow-hidden">
              <video
                src={tutorial.demoVideoUrl}
                className="w-full h-full object-cover"
                muted
                loop
                playsInline
                autoPlay
                onMouseEnter={e => (e.currentTarget as HTMLVideoElement).play()}
              />
              {/* Gradient overlay */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />

              {/* Play button */}
              <div className="absolute inset-0 flex items-center justify-center opacity-0 group-active:opacity-100 transition-opacity">
                <div className="w-16 h-16 rounded-full bg-primary/20 backdrop-blur-sm border border-primary/40 flex items-center justify-center glow-pink">
                  <Play size={28} className="text-primary fill-primary ml-1" />
                </div>
              </div>

              {/* Bottom info overlay */}
              <div className="absolute bottom-0 left-0 right-0 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-white text-base leading-tight truncate">{tutorial.title}</h3>
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
                  className="mt-3 w-full flex items-center justify-center gap-1.5 bg-primary/90 hover:bg-primary text-primary-foreground font-semibold text-sm py-2.5 rounded-xl glow-pink transition-all"
                  onClick={(e) => { e.stopPropagation(); navigate(`/tutorial/${tutorial.id}`); }}
                >
                  Unlock Tutorial
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
