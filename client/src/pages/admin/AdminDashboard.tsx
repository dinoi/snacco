import AdminLayout from "./AdminLayout";
import { trpc } from "@/lib/trpc";
import { Users, Unlock, Coins, TrendingUp } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

function StatCard({ label, value, icon: Icon, color }: { label: string; value: number | string; icon: React.ElementType; color: string }) {
  return (
    <div className="bg-card border border-border rounded-2xl p-5 flex items-center gap-4">
      <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0" style={{ background: `${color}20` }}>
        <Icon size={22} style={{ color }} />
      </div>
      <div>
        <p className="text-muted-foreground text-xs font-medium">{label}</p>
        <p className="text-2xl font-black text-foreground">{value}</p>
      </div>
    </div>
  );
}

export default function AdminDashboard() {
  const { data: stats, isLoading } = trpc.admin.stats.useQuery();
  const { data: txns } = trpc.tokens.adminGetAll.useQuery();
  const { data: tutorials } = trpc.tutorials.adminList.useQuery();

  // Build a simple chart: unlocks per day (last 7 days)
  const chartData = (() => {
    if (!txns) return [];
    const days: Record<string, number> = {};
    const now = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const key = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      days[key] = 0;
    }
    txns.filter(t => t.amount < 0).forEach(t => {
      const d = new Date(t.createdAt);
      const key = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      if (key in days) days[key] += Math.abs(t.amount);
    });
    return Object.entries(days).map(([date, tokens]) => ({ date, tokens }));
  })();

  return (
    <AdminLayout>
      <div className="p-8 space-y-8">
        <div>
          <h2 className="text-2xl font-black text-foreground">Dashboard</h2>
          <p className="text-muted-foreground text-sm mt-1">Platform overview</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {isLoading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-24 rounded-2xl bg-muted" />
            ))
          ) : (
            <>
              <StatCard label="Total Users" value={stats?.totalUsers ?? 0} icon={Users} color="oklch(0.65 0.30 340)" />
              <StatCard label="Total Unlocks" value={stats?.totalUnlocks ?? 0} icon={Unlock} color="oklch(0.55 0.28 15)" />
              <StatCard label="Tokens Consumed" value={stats?.tokensConsumed ?? 0} icon={Coins} color="oklch(0.60 0.20 145)" />
            </>
          )}
        </div>

        {/* Published tutorials count */}
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-card border border-border rounded-2xl p-5">
            <p className="text-muted-foreground text-xs font-medium">Published Tutorials</p>
            <p className="text-3xl font-black text-foreground mt-1">
              {tutorials?.filter(t => t.isPublished).length ?? 0}
            </p>
          </div>
          <div className="bg-card border border-border rounded-2xl p-5">
            <p className="text-muted-foreground text-xs font-medium">Total Tutorials</p>
            <p className="text-3xl font-black text-foreground mt-1">
              {tutorials?.length ?? 0}
            </p>
          </div>
        </div>

        {/* Tokens consumed chart */}
        <div className="bg-card border border-border rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-5">
            <TrendingUp size={18} className="text-primary" />
            <h3 className="font-bold text-foreground text-sm">Tokens Consumed (Last 7 Days)</h3>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={chartData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.22 0.005 270)" />
              <XAxis dataKey="date" tick={{ fill: "oklch(0.55 0.005 270)", fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "oklch(0.55 0.005 270)", fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{ background: "oklch(0.12 0.005 270)", border: "1px solid oklch(0.22 0.005 270)", borderRadius: 12 }}
                labelStyle={{ color: "oklch(0.95 0.005 270)", fontWeight: 700 }}
                itemStyle={{ color: "oklch(0.65 0.30 340)" }}
              />
              <Bar dataKey="tokens" fill="oklch(0.65 0.30 340)" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </AdminLayout>
  );
}
