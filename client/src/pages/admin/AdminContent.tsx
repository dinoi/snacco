import AdminLayout from "./AdminLayout";
import { trpc } from "@/lib/trpc";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { useState } from "react";

export default function AdminContent() {
  const { data: tutorials, isLoading, refetch } = trpc.tutorials.adminList.useQuery();
  const [pendingId, setPendingId] = useState<number | null>(null);

  const setPublishedMutation = trpc.tutorials.adminSetPublished.useMutation({
    onSuccess: () => {
      toast.success("Tutorial status updated.");
      refetch();
      setPendingId(null);
    },
    onError: () => { toast.error("Failed to update."); setPendingId(null); },
  });

  const toggle = (id: number, current: boolean) => {
    setPendingId(id);
    setPublishedMutation.mutate({ id, isPublished: !current });
  };

  return (
    <AdminLayout>
      <div className="p-8 space-y-6">
        <div>
          <h2 className="text-2xl font-black text-foreground">Content</h2>
          <p className="text-muted-foreground text-sm mt-1">
            {tutorials?.length ?? 0} tutorials · {tutorials?.filter(t => t.isPublished).length ?? 0} published
          </p>
        </div>

        <div className="bg-card border border-border rounded-2xl overflow-hidden">
          {isLoading && (
            <div className="p-4 space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-16 rounded-xl bg-muted" />
              ))}
            </div>
          )}

          {!isLoading && tutorials?.length === 0 && (
            <div className="p-12 text-center text-muted-foreground text-sm">No tutorials uploaded yet.</div>
          )}

          {tutorials?.map((t, i) => (
            <div
              key={t.id}
              className="flex items-center gap-4 px-5 py-4 border-b border-border last:border-0 hover:bg-accent/20 transition-colors"
            >
              {/* Thumbnail */}
              <div className="w-12 h-16 rounded-lg bg-black overflow-hidden shrink-0">
                <video src={t.demoVideoUrl} className="w-full h-full object-cover" muted playsInline />
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-foreground text-sm truncate">{t.title}</p>
                <p className="text-muted-foreground text-xs truncate mt-0.5">
                  by {t.creatorName ?? "Unknown"} · {t.category}
                </p>
                <div className="flex items-center gap-2 mt-1.5">
                  <Badge
                    variant="outline"
                    className={t.isPublished
                      ? "border-green-500/40 text-green-400 text-xs"
                      : "border-muted text-muted-foreground text-xs"
                    }
                  >
                    {t.isPublished ? "Published" : "Unpublished"}
                  </Badge>
                  <span className="text-muted-foreground text-xs">{t.tokenPrice} token{t.tokenPrice !== 1 ? "s" : ""}</span>
                </div>
              </div>

              {/* Toggle */}
              <Button
                size="sm"
                variant={t.isPublished ? "destructive" : "outline"}
                className={!t.isPublished ? "border-green-500/40 text-green-400 hover:bg-green-500/10" : ""}
                disabled={pendingId === t.id}
                onClick={() => toggle(t.id, t.isPublished)}
              >
                {pendingId === t.id
                  ? <Loader2 size={14} className="animate-spin" />
                  : t.isPublished
                    ? <><EyeOff size={14} className="mr-1.5" />Unpublish</>
                    : <><Eye size={14} className="mr-1.5" />Publish</>
                }
              </Button>
            </div>
          ))}
        </div>
      </div>
    </AdminLayout>
  );
}
