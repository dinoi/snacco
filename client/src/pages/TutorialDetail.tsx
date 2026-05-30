import { trpc } from "@/lib/trpc";
import { useParams, useLocation } from "wouter";
import { ArrowLeft, Coins, Play, Lock, CheckCircle, Loader2, ListOrdered } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatTime } from "@/lib/utils";
import { VersionBadge } from "@/components/VersionBadge";

export default function TutorialDetail() {
  const { id } = useParams<{ id: string }>();
  const tutorialId = parseInt(id ?? "0");
  const [, navigate] = useLocation();
  const { isAuthenticated } = useAuth();
  const utils = trpc.useUtils();

  const { data: tutorial, isLoading } = trpc.tutorials.get.useQuery({ id: tutorialId });
  const { data: chapters } = trpc.tutorials.getChapters.useQuery({ tutorialId });
  const { data: unlockStatus } = trpc.tutorials.isUnlocked.useQuery(
    { tutorialId },
    { enabled: isAuthenticated }
  );
  const { data: tokenData } = trpc.tokens.getBalance.useQuery(undefined, { enabled: isAuthenticated });

  const unlockMutation = trpc.tutorials.unlock.useMutation({
    onSuccess: (data) => {
      if (data.alreadyOwned) {
        navigate(`/play/${tutorialId}`);
        return;
      }
      toast.success("Tutorial unlocked! Let's practice.");
      utils.tutorials.isUnlocked.invalidate({ tutorialId });
      utils.tokens.getBalance.invalidate();
      navigate(`/play/${tutorialId}`);
    },
    onError: (err) => {
      if (err.message === "Insufficient tokens") {
        toast.error("Not enough tokens to unlock this tutorial.");
      } else {
        toast.error("Something went wrong. Please try again.");
      }
    },
  });

  if (isLoading) {
    return (
      <div className="min-h-dvh bg-black flex items-center justify-center">
        <Skeleton className="w-full h-dvh bg-muted/20" />
      </div>
    );
  }

  if (!tutorial) {
    return (
      <div className="min-h-dvh bg-black flex items-center justify-center">
        <p className="text-white/60">Tutorial not found.</p>
      </div>
    );
  }

  const isOwned = unlockStatus?.unlocked ?? false;
  const canAfford = (tokenData?.balance ?? 0) >= tutorial.tokenPrice;

  return (
    <div className="min-h-dvh bg-black">
      {/* Video section — fills viewport */}
      <div className="relative h-dvh w-full">
        {/* Full-screen video background */}
        <video
          src={tutorial.demoVideoUrl}
          className="absolute inset-0 w-full h-full object-cover"
          muted
          loop
          playsInline
          autoPlay
          preload="auto"
          onError={(e) => console.error('[Video] Error loading demo:', e)}
        />

        {/* Top gradient */}
        <div className="absolute top-0 left-0 right-0 h-24 bg-gradient-to-b from-black/70 to-transparent z-10" />

        {/* Back button + version badge */}
        <div className="absolute top-0 left-0 right-0 z-20 px-4 py-3 safe-top flex items-center justify-between">
          <button
            onClick={() => navigate("/")}
            className="flex items-center gap-2 text-white/80 hover:text-white transition-colors"
          >
            <ArrowLeft size={20} />
            <span className="text-sm font-medium">Back</span>
          </button>
          <VersionBadge />
        </div>

        {/* Bottom gradient for overlay readability */}
        <div className="absolute bottom-0 left-0 right-0 h-[55%] bg-gradient-to-t from-black/95 via-black/60 to-transparent z-10" />

        {/* Overlay content — lower half of viewport */}
        <div className="absolute bottom-0 left-0 right-0 z-20 p-4 pb-6 safe-bottom">
          {/* Title and genre */}
          <h1 className="text-xl font-black text-white leading-tight">{tutorial.title}</h1>
          <p className="text-white/50 text-xs mt-1">
            {tutorial.category}
          </p>

          {/* Creator */}
          <p className="text-white/70 text-sm mt-2">
            by <span className="text-white font-medium">{tutorial.creatorName ?? "Creator"}</span>
          </p>

          {/* Description */}
          {tutorial.description && (
            <p className="text-white/60 text-sm leading-relaxed mt-3 line-clamp-3">{tutorial.description}</p>
          )}

          {/* Action button */}
          <div className="mt-4">
            {isOwned ? (
              <Button
                className="w-full bg-primary hover:bg-primary/90 glow-pink font-bold py-3 text-base active:scale-[0.97] transition-transform"
                onClick={() => navigate(`/play/${tutorialId}`)}
              >
                <Play size={18} className="mr-2" />
                Practice Now
              </Button>
            ) : isAuthenticated ? (
              <Button
                className="w-full font-bold py-3 text-base glow-pink active:scale-[0.97] transition-transform"
                style={{ background: "linear-gradient(135deg, oklch(0.65 0.30 340), oklch(0.55 0.28 15))" }}
                disabled={!canAfford || unlockMutation.isPending}
                onClick={() => unlockMutation.mutate({ tutorialId })}
              >
                {unlockMutation.isPending ? (
                  <Loader2 size={18} className="animate-spin mr-2" />
                ) : (
                  <Coins size={18} className="mr-2" />
                )}
                {canAfford
                  ? `Unlock for ${tutorial.tokenPrice} token${tutorial.tokenPrice !== 1 ? "s" : ""}`
                  : "Not enough tokens"}
              </Button>
            ) : (
              <a href={getLoginUrl(`/tutorial/${tutorialId}`)}>
                <Button
                  className="w-full font-bold py-3 text-base glow-pink active:scale-[0.97] transition-transform"
                  style={{ background: "linear-gradient(135deg, oklch(0.65 0.30 340), oklch(0.55 0.28 15))" }}
                >
                  Sign in to unlock
                </Button>
              </a>
            )}

            {/* Token balance hint */}
            {isAuthenticated && !isOwned && (
              <p className="text-xs text-white/40 text-center mt-2">
                Your balance: <span className={canAfford ? "text-white/70 font-semibold" : "text-red-400 font-semibold"}>{tokenData?.balance ?? 0} tokens</span>
              </p>
            )}
          </div>
        </div>

        {/* Play button overlay for owned tutorials */}
        {isOwned && (
          <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 z-15">
            <button
              onClick={() => navigate(`/play/${tutorialId}`)}
              className="w-20 h-20 rounded-full bg-primary/20 backdrop-blur-sm border-2 border-primary flex items-center justify-center glow-pink"
            >
              <Play size={36} className="text-primary fill-primary ml-1" />
            </button>
          </div>
        )}
      </div>

      {/* Chapters section — below the fold, on black background */}
      {chapters && chapters.length > 0 && (
        <div className="bg-black px-4 py-6 border-t border-white/10">
          <div className="flex items-center gap-2 mb-4">
            <ListOrdered size={16} className="text-primary" />
            <span className="text-sm font-semibold text-white">Steps in this tutorial</span>
          </div>
          <div className="space-y-3">
            {chapters.map((ch, i) => (
              <div key={ch.id} className="flex items-center gap-3">
                <span className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center text-xs font-bold text-white/60 shrink-0">
                  {i + 1}
                </span>
                <span className="text-sm text-white/80 flex-1">{ch.label}</span>
                <span className="text-xs text-white/40 font-mono">{formatTime(ch.timestampSeconds)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
