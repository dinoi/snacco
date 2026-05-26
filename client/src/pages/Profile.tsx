import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { Coins, Video, LogOut, ChevronRight, Shield, Plus, Edit, Trash2 } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";

export default function Profile() {
  const { isAuthenticated, user, logout } = useAuth();
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();

  const { data: tokenData, isLoading: tokenLoading } = trpc.tokens.getBalance.useQuery(undefined, {
    enabled: isAuthenticated,
  });

  const { data: myTutorials, isLoading: tutorialsLoading } = trpc.tutorials.myTutorials.useQuery(undefined, {
    enabled: isAuthenticated && user?.isCreator,
  });

  const setCreatorMutation = trpc.users.setCreatorMode.useMutation({
    onSuccess: () => {
      utils.auth.me.invalidate();
      toast.success(user?.isCreator ? "Creator mode disabled." : "Creator mode enabled!");
    },
    onError: () => toast.error("Failed to update creator mode."),
  });

  if (!isAuthenticated) {
    return (
      <div className="min-h-dvh bg-background flex flex-col items-center justify-center px-6 text-center gap-4">
        <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center text-3xl font-black text-muted-foreground">
          ?
        </div>
        <h2 className="text-xl font-black text-foreground">Profile</h2>
        <p className="text-muted-foreground text-sm">Sign in to manage your account.</p>
        <a href={getLoginUrl("/profile")} className="bg-primary text-primary-foreground font-bold px-6 py-3 rounded-xl glow-pink">
          Sign in
        </a>
      </div>
    );
  }

  const initials = (user?.name ?? "?").split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);

  return (
    <div className="min-h-dvh bg-background">
      <header className="sticky top-0 z-40 bg-background/90 backdrop-blur-md border-b border-border px-4 py-4 safe-top">
        <h1 className="text-xl font-black gradient-text">Profile</h1>
      </header>

      <div className="p-4 space-y-4">
        {/* Avatar + name */}
        <div className="flex items-center gap-4 p-4 bg-card rounded-2xl border border-border">
          <div className="w-16 h-16 rounded-full flex items-center justify-center text-xl font-black text-primary-foreground shrink-0"
            style={{ background: "linear-gradient(135deg, oklch(0.65 0.30 340), oklch(0.55 0.28 15))" }}
          >
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-foreground text-lg leading-tight truncate">{user?.name ?? "User"}</p>
            <p className="text-muted-foreground text-xs truncate">{user?.email ?? ""}</p>
            {user?.role === "admin" && (
              <div className="flex items-center gap-1 mt-1">
                <Shield size={12} className="text-primary" />
                <span className="text-primary text-xs font-semibold">Admin</span>
              </div>
            )}
          </div>
        </div>

        {/* Token balance */}
        <div className="p-4 bg-card rounded-2xl border border-border">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <Coins size={20} className="text-primary" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground font-medium">Token Balance</p>
                {tokenLoading
                  ? <Skeleton className="h-7 w-16 bg-muted mt-0.5" />
                  : <p className="text-2xl font-black gradient-text">{tokenData?.balance ?? 0}</p>
                }
              </div>
            </div>
            <button
              onClick={() => navigate("/")}
              className="flex items-center gap-1 text-xs text-primary font-semibold"
            >
              <Plus size={14} />
              Get more
            </button>
          </div>
        </div>

        {/* Creator mode */}
        <div className="p-4 bg-card rounded-2xl border border-border">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-secondary/10 flex items-center justify-center">
                <Video size={20} className="text-secondary" />
              </div>
              <div>
                <p className="font-semibold text-foreground text-sm">Creator Mode</p>
                <p className="text-muted-foreground text-xs">Upload and sell tutorials</p>
              </div>
            </div>
            <Switch
              checked={user?.isCreator ?? false}
              onCheckedChange={(checked) => setCreatorMutation.mutate({ isCreator: checked })}
              disabled={setCreatorMutation.isPending}
            />
          </div>
          {user?.isCreator && (
            <button
              onClick={() => navigate("/creator/upload")}
              className="mt-3 w-full flex items-center justify-between bg-secondary/10 border border-secondary/30 rounded-xl px-4 py-3 text-sm font-semibold text-secondary"
            >
              <span>Upload a new tutorial</span>
              <ChevronRight size={16} />
            </button>
          )}
        </div>

        {/* My tutorials */}
        {user?.isCreator && (
          <div className="space-y-3">
            <h3 className="text-sm font-bold text-foreground px-2">My Tutorials</h3>
            {tutorialsLoading ? (
              Array.from({ length: 2 }).map((_, i) => (
                <Skeleton key={i} className="h-20 bg-muted rounded-xl" />
              ))
            ) : myTutorials && myTutorials.length > 0 ? (
              myTutorials.map((tutorial) => (
                <div key={tutorial.id} className="p-3 bg-card rounded-xl border border-border flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-foreground text-sm truncate">{tutorial.title}</p>
                    <p className="text-muted-foreground text-xs">{tutorial.category} · {tutorial.tokenPrice} tokens</p>
                  </div>
                  <div className="flex items-center gap-2 ml-3">
                    <button
                      onClick={() => navigate(`/creator/edit/${tutorial.id}`)}
                      className="p-2 hover:bg-primary/10 rounded-lg text-primary transition-colors"
                      title="Edit tutorial"
                    >
                      <Edit size={16} />
                    </button>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-6 text-muted-foreground text-sm">
                No tutorials yet. Create your first one!
              </div>
            )}
          </div>
        )}

        {/* Admin portal link */}
        {user?.role === "admin" && (
          <button
            onClick={() => navigate("/admin")}
            className="w-full flex items-center justify-between p-4 bg-card rounded-2xl border border-primary/30 text-sm font-semibold text-primary"
          >
            <div className="flex items-center gap-3">
              <Shield size={18} className="text-primary" />
              <span>Admin Portal</span>
            </div>
            <ChevronRight size={16} />
          </button>
        )}

        {/* Logout */}
        <button
          onClick={() => { logout(); }}
          className="w-full flex items-center gap-3 p-4 bg-card rounded-2xl border border-border text-sm font-semibold text-muted-foreground hover:text-destructive transition-colors"
        >
          <LogOut size={18} />
          <span>Sign out</span>
        </button>
      </div>
    </div>
  );
}
