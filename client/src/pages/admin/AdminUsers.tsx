import AdminLayout from "./AdminLayout";
import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { Coins, ChevronDown, ChevronUp, Plus, Minus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export default function AdminUsers() {
  const { data: users, isLoading, refetch } = trpc.users.adminList.useQuery();
  const [expandedUser, setExpandedUser] = useState<number | null>(null);
  const [adjustAmount, setAdjustAmount] = useState<Record<number, string>>({});
  const [adjustReason, setAdjustReason] = useState<Record<number, string>>({});

  const { data: tokenHistory } = trpc.users.adminGetTokenHistory.useQuery(
    { userId: expandedUser! },
    { enabled: expandedUser !== null }
  );

  const adjustMutation = trpc.tokens.adminAdjust.useMutation({
    onSuccess: () => {
      toast.success("Tokens adjusted.");
      refetch();
      setAdjustAmount({});
      setAdjustReason({});
    },
    onError: (err) => toast.error(err.message),
  });

  const handleAdjust = (userId: number, sign: 1 | -1) => {
    const amt = parseInt(adjustAmount[userId] ?? "0");
    const reason = adjustReason[userId]?.trim() || "Admin adjustment";
    if (!amt || isNaN(amt) || amt <= 0) { toast.error("Enter a valid amount."); return; }
    adjustMutation.mutate({ userId, amount: sign * amt, reason });
  };

  return (
    <AdminLayout>
      <div className="p-8 space-y-6">
        <div>
          <h2 className="text-2xl font-black text-foreground">Users</h2>
          <p className="text-muted-foreground text-sm mt-1">{users?.length ?? 0} registered accounts</p>
        </div>

        <div className="space-y-3">
          {isLoading && Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-2xl bg-muted" />
          ))}

          {users?.map((u) => (
            <div key={u.id} className="bg-card border border-border rounded-2xl overflow-hidden">
              {/* User row */}
              <div
                className="flex items-center gap-4 px-5 py-4 cursor-pointer hover:bg-accent/30 transition-colors"
                onClick={() => setExpandedUser(expandedUser === u.id ? null : u.id)}
              >
                <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-black text-primary-foreground shrink-0"
                  style={{ background: "linear-gradient(135deg, oklch(0.65 0.30 340), oklch(0.55 0.28 15))" }}
                >
                  {(u.name ?? "?").slice(0, 2).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-foreground text-sm truncate">{u.name ?? "Unknown"}</p>
                  <p className="text-muted-foreground text-xs truncate">{u.email ?? u.openId}</p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  {u.role === "admin" && <Badge className="bg-primary/10 text-primary border-primary/30 text-xs">Admin</Badge>}
                  {u.isCreator && <Badge variant="outline" className="border-secondary/40 text-secondary text-xs">Creator</Badge>}
                  <div className="flex items-center gap-1.5 bg-primary/10 rounded-full px-3 py-1">
                    <Coins size={12} className="text-primary" />
                    <span className="text-primary font-bold text-sm">{u.tokenBalance}</span>
                  </div>
                  {expandedUser === u.id ? <ChevronUp size={16} className="text-muted-foreground" /> : <ChevronDown size={16} className="text-muted-foreground" />}
                </div>
              </div>

              {/* Expanded: token adjustment + history */}
              {expandedUser === u.id && (
                <div className="border-t border-border px-5 py-4 space-y-4 bg-background/40">
                  {/* Adjust tokens */}
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Adjust Tokens</p>
                    <div className="flex gap-2">
                      <Input
                        type="number"
                        min="1"
                        placeholder="Amount"
                        value={adjustAmount[u.id] ?? ""}
                        onChange={e => setAdjustAmount(prev => ({ ...prev, [u.id]: e.target.value }))}
                        className="bg-card border-border w-24 shrink-0"
                      />
                      <Input
                        placeholder="Reason (optional)"
                        value={adjustReason[u.id] ?? ""}
                        onChange={e => setAdjustReason(prev => ({ ...prev, [u.id]: e.target.value }))}
                        className="bg-card border-border flex-1"
                      />
                      <Button
                        size="sm"
                        className="bg-green-600 hover:bg-green-700 text-white shrink-0"
                        disabled={adjustMutation.isPending}
                        onClick={() => handleAdjust(u.id, 1)}
                      >
                        {adjustMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        className="shrink-0"
                        disabled={adjustMutation.isPending}
                        onClick={() => handleAdjust(u.id, -1)}
                      >
                        {adjustMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Minus size={14} />}
                      </Button>
                    </div>
                  </div>

                  {/* Token history */}
                  {tokenHistory && tokenHistory.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Recent Transactions</p>
                      <div className="space-y-1.5 max-h-48 overflow-y-auto">
                        {tokenHistory.map(tx => (
                          <div key={tx.id} className="flex items-center justify-between text-xs py-1.5 border-b border-border/50 last:border-0">
                            <span className="text-muted-foreground flex-1 truncate">{tx.reason}</span>
                            <span className={cn("font-bold ml-3 shrink-0", tx.amount > 0 ? "text-green-400" : "text-destructive")}>
                              {tx.amount > 0 ? "+" : ""}{tx.amount}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {tokenHistory?.length === 0 && (
                    <p className="text-xs text-muted-foreground">No transactions yet.</p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </AdminLayout>
  );
}
