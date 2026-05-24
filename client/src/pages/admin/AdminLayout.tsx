import { useAuth } from "@/_core/hooks/useAuth";
import { useLocation } from "wouter";
import { LayoutDashboard, Users, Film, ArrowLeft, Shield } from "lucide-react";
import { cn } from "@/lib/utils";
import { getLoginUrl } from "@/const";

const navItems = [
  { path: "/admin", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { path: "/admin/users", label: "Users", icon: Users },
  { path: "/admin/content", label: "Content", icon: Film },
];

export default function AdminLayout({ children }: { children?: React.ReactNode }) {
  const { isAuthenticated, user } = useAuth();
  const [location, navigate] = useLocation();

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <a href={getLoginUrl("/admin")} className="bg-primary text-primary-foreground font-bold px-6 py-3 rounded-xl">
          Sign in to access admin
        </a>
      </div>
    );
  }

  if (user?.role !== "admin") {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4">
        <Shield size={48} className="text-muted-foreground" />
        <p className="text-muted-foreground">You don't have admin access.</p>
        <button onClick={() => navigate("/")} className="text-primary text-sm font-semibold">
          Back to app
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex">
      {/* Sidebar */}
      <aside className="w-60 bg-card border-r border-border flex flex-col shrink-0">
        <div className="p-6 border-b border-border">
          <h1 className="text-xl font-black gradient-text">snacco</h1>
          <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
            <Shield size={10} className="text-primary" />
            Admin Portal
          </p>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {navItems.map(({ path, label, icon: Icon, exact }) => {
            const active = exact ? location === path : location.startsWith(path);
            return (
              <button
                key={path}
                onClick={() => navigate(path)}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all",
                  active
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground"
                )}
              >
                <Icon size={18} className={active ? "text-primary" : ""} />
                {label}
              </button>
            );
          })}
        </nav>
        <div className="p-3 border-t border-border">
          <button
            onClick={() => navigate("/")}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-muted-foreground hover:bg-accent hover:text-foreground transition-all"
          >
            <ArrowLeft size={18} />
            Back to App
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  );
}
