import { trpc } from "@/lib/trpc";
import { useParams, useLocation } from "wouter";
import { ArrowLeft, Coins, Play, Lock, CheckCircle, Loader2, ListOrdered } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { formatTime } from "@/lib/utils";
import { VersionBadge } from "@/components/VersionBadge";

export default function TutorialDetail() {
  const { id } = useParams<{ id: string }>();
  const tutorialId = parseInt(id ?? "0");
  const [, navigate] = useLocation();
  const { isAuthenticated, user } = useAuth();
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
      <div className="min-h-dvh bg-background p-4 space-y-4">
        <Skeleton className="h-8 w-8 rounded-full bg-muted" />
        <Skeleton className="w-full aspect-[9/16] rounded-2xl bg-muted" />
        <Skeleton className="h-6 w-3/4 bg-muted" />
        <Skeleton className="h-4 w-1/2 bg-muted" />
      </div>
    );
  }

  if (!tutorial) {
    return (
      <div className="min-h-dvh bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Tutorial not found.</p>
      </div>
    );
  }

  const isOwned = unlockStatus?.unlocked ?? false;
  const canAfford = (tokenData?.balance ?? 0) >= tutorial.tokenPrice;

  return (
    <div className="min-h-dvh bg-background pb-8">
      {/* Back button */}
      <div className="sticky top-0 z-40 bg-background/90 backdrop-blur-md px-4 py-3 safe-top flex items-center justify-between">
        <button
          onClick={() => navigate("/")}
          className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft size={20} />
          <span className="text-sm font-medium">Back</span>
        </button>
        <VersionBadge />
      </div>

      {/* Demo video */}
      <div className="relative w-full aspect-[9/16] bg-black">
        <video
          src={tutorial.demoVideoUrl}
          className="w-full h-full object-cover"
          muted
          loop
          playsInline
          autoPlay
          preload="metadata"
          crossOrigin="anonymous"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
        {isOwned && (
          <div className="absolute inset-0 flex items-center justify-center">
            <button
              onClick={() => navigate(`/play/${tutorialId}`)}
              className="w-20 h-20 rounded-full bg-primary/20 backdrop-blur-sm border-2 border-primary flex items-center justify-center glow-pink"
            >
              <Play size={36} className="text-primary fill-primary ml-1" />
            </button>
          </div>
        )}
      </div>

      {/* Info */}
      <div className="px-4 pt-5 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-black text-foreground leading-tight">{tutorial.title}</h1>
            <p className="text-muted-foreground text-sm mt-1">
              by <span className="text-foreground font-medium">{tutorial.creatorName ?? "Creator"}</span>
            </p>
          </div>
          <Badge variant="outline" className="border-primary/40 text-primary shrink-0">
            {tutorial.category}
          </Badge>
        </div>

        {tutorial.description && (
          <p className="text-muted-foreground text-sm leading-relaxed">{tutorial.description}</p>
        )}

        {/* Chapters preview */}
        {chapters && chapters.length > 0 && (
          <div className="bg-card rounded-2xl p-4 border border-border space-y-2">
            <div className="flex items-center gap-2 mb-3">
              <ListOrdered size={16} className="text-primary" />
              <span className="text-sm font-semibold text-foreground">Steps in this tutorial</span>
            </div>
            {chapters.map((ch, i) => (
              <div key={ch.id} className="flex items-center gap-3">
                <span className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-xs font-bold text-muted-foreground shrink-0">
                  {i + 1}
                </span>
                <span className="text-sm text-foreground flex-1">{ch.label}</span>
                <span className="text-xs text-muted-foreground font-mono">{formatTime(ch.timestampSeconds)}</span>
              </div>
            ))}
          </div>
        )}

        {/* Unlock section */}
        <div className="bg-card rounded-2xl p-4 border border-border">
          {isOwned ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-green-400">
                <CheckCircle size={18} />
                <span className="font-semibold text-sm">You own this tutorial</span>
              </div>
              <Button
                className="w-full bg-primary hover:bg-primary/90 glow-pink font-bold"
                onClick={() => navigate(`/play/${tutorialId}`)}
              >
                <Play size={18} className="mr-2" />
                Practice Now
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Lock size={16} className="text-muted-foreground" />
                  <span className="text-sm font-semibold text-foreground">Unlock this tutorial</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Coins size={16} className="text-primary" />
                  <span className="text-primary font-black text-lg">{tutorial.tokenPrice}</span>
                  <span className="text-muted-foreground text-xs">token{tutorial.tokenPrice !== 1 ? "s" : ""}</span>
                </div>
              </div>

              {isAuthenticated && (
                <p className="text-xs text-muted-foreground">
                  Your balance: <span className={canAfford ? "text-foreground font-semibold" : "text-destructive font-semibold"}>{tokenData?.balance ?? 0} tokens</span>
                </p>
              )}

              {isAuthenticated ? (
                <Button
                  className="w-full font-bold glow-pink"
                  style={{ background: "linear-gradient(135deg, oklch(0.65 0.30 340), oklch(0.55 0.28 15))" }}
                  disabled={!canAfford || unlockMutation.isPending}
                  onClick={() => unlockMutation.mutate({ tutorialId })}
                >
                  {unlockMutation.isPending ? (
                    <Loader2 size={18} className="animate-spin mr-2" />
                  ) : (
                    <Coins size={18} className="mr-2" />
                  )}
                  {canAfford ? `Unlock for ${tutorial.tokenPrice} token${tutorial.tokenPrice !== 1 ? "s" : ""}` : "Not enough tokens"}
                </Button>
              ) : (
                <a href={getLoginUrl(`/tutorial/${tutorialId}`)}>
                  <Button className="w-full font-bold glow-pink" style={{ background: "linear-gradient(135deg, oklch(0.65 0.30 340), oklch(0.55 0.28 15))" }}>
                    Sign in to unlock
                  </Button>
                </a>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
