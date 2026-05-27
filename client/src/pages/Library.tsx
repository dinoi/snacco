import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { Play, BookOpen } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { VersionBadge } from "@/components/VersionBadge";

export default function Library() {
  const { isAuthenticated } = useAuth();
  const [, navigate] = useLocation();
  const { data: tutorials, isLoading } = trpc.tutorials.library.useQuery(undefined, {
    enabled: isAuthenticated,
  });

  if (!isAuthenticated) {
    return (
      <div className="min-h-dvh bg-background flex flex-col items-center justify-center px-6 text-center gap-4">
        <BookOpen size={48} className="text-primary" />
        <h2 className="text-xl font-black text-foreground">Your Library</h2>
        <p className="text-muted-foreground text-sm">Sign in to see your unlocked tutorials.</p>
        <a href={getLoginUrl("/library")} className="bg-primary text-primary-foreground font-bold px-6 py-3 rounded-xl glow-pink">
          Sign in
        </a>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-background">
      <header className="sticky top-0 z-40 bg-background/90 backdrop-blur-md border-b border-border px-4 py-4 safe-top flex items-center justify-between">
        <h1 className="text-xl font-black gradient-text">My Library</h1>
        <VersionBadge />
      </header>

      <div className="p-4 space-y-3">
        {isLoading && Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex gap-3 p-3 bg-card rounded-2xl border border-border">
            <Skeleton className="w-20 h-28 rounded-xl bg-muted shrink-0" />
            <div className="flex-1 space-y-2 py-1">
              <Skeleton className="h-4 w-3/4 bg-muted" />
              <Skeleton className="h-3 w-1/2 bg-muted" />
              <Skeleton className="h-8 w-full bg-muted rounded-lg" />
            </div>
          </div>
        ))}

        {!isLoading && tutorials?.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-center gap-3">
            <BookOpen size={40} className="text-muted-foreground" />
            <p className="text-muted-foreground text-sm">No tutorials yet. Discover something to learn!</p>
            <button
              onClick={() => navigate("/")}
              className="text-primary text-sm font-semibold underline underline-offset-2"
            >
              Browse tutorials
            </button>
          </div>
        )}

        {tutorials?.map((tutorial) => (
          <div
            key={tutorial.id}
            className="flex gap-3 p-3 bg-card rounded-2xl border border-border cursor-pointer active:scale-[0.98] transition-transform"
            onClick={() => navigate(`/play/${tutorial.id}`)}
          >
            {/* Thumbnail */}
            <div className="w-20 h-28 rounded-xl bg-black overflow-hidden shrink-0 relative">
              <video
                src={tutorial.demoVideoUrl}
                className="w-full h-full object-cover"
                muted
                playsInline
                preload="auto"
                crossOrigin="anonymous"
              />
              <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                <Play size={20} className="text-white fill-white" />
              </div>
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0 flex flex-col justify-between py-1">
              <div>
                <h3 className="font-bold text-foreground text-sm leading-tight line-clamp-2">{tutorial.title}</h3>
                <p className="text-muted-foreground text-xs mt-1 truncate">
                  by {tutorial.creatorName ?? "Creator"}
                </p>
              </div>
              <div className="flex items-center justify-between mt-2">
                <Badge variant="outline" className="text-xs border-border text-muted-foreground">
                  {tutorial.category}
                </Badge>
                <button
                  className="flex items-center gap-1 bg-primary/10 text-primary border border-primary/30 rounded-lg px-2.5 py-1 text-xs font-semibold"
                  onClick={(e) => { e.stopPropagation(); navigate(`/play/${tutorial.id}`); }}
                >
                  <Play size={12} className="fill-primary" />
                  Practice
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
