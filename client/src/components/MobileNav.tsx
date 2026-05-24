import { useLocation } from "wouter";
import { Home, BookOpen, User } from "lucide-react";
import { cn } from "@/lib/utils";

const tabs = [
  { path: "/", label: "Discover", icon: Home },
  { path: "/library", label: "Library", icon: BookOpen },
  { path: "/profile", label: "Profile", icon: User },
];

export default function MobileNav() {
  const [location, navigate] = useLocation();

  return (
    <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md z-50 safe-bottom">
      <div className="bg-card/95 backdrop-blur-md border-t border-border flex items-center justify-around px-2 py-2">
        {tabs.map(({ path, label, icon: Icon }) => {
          const active = location === path;
          return (
            <button
              key={path}
              onClick={() => navigate(path)}
              className={cn(
                "flex flex-col items-center gap-1 px-4 py-2 rounded-xl transition-all duration-200",
                active
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon
                size={22}
                className={cn(
                  "transition-all duration-200",
                  active && "drop-shadow-[0_0_8px_oklch(0.65_0.30_340)]"
                )}
              />
              <span className={cn("text-[10px] font-semibold tracking-wide", active && "text-glow-pink")}>
                {label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
