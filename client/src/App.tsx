import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch, useLocation } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Feed from "./pages/Feed";
import TutorialDetail from "./pages/TutorialDetail";
import Player from "./pages/Player";
import Library from "./pages/Library";
import Profile from "./pages/Profile";
import CreatorUpload from "./pages/CreatorUpload";
import CreatorEdit from "./pages/CreatorEdit";
import AdminLayout from "./pages/admin/AdminLayout";
import AdminUsers from "./pages/admin/AdminUsers";
import AdminContent from "./pages/admin/AdminContent";
import AdminDashboard from "./pages/admin/AdminDashboard";
import MobileNav from "./components/MobileNav";
import { useAuth } from "./_core/hooks/useAuth";

function MobileApp() {
  const { isAuthenticated } = useAuth();
  const [location] = useLocation();

  // Keep Feed mounted but hidden when on tutorial detail page
  // This preserves video elements and their buffered data
  const isFeedRoute = location === "/";
  const isTutorialDetail = location.startsWith("/tutorial/");
  const showFeedKeepAlive = isFeedRoute || isTutorialDetail;

  return (
    <div className="min-h-dvh bg-background flex flex-col max-w-md mx-auto relative">
      <div className="flex-1 pb-20">
        {/* Feed is always mounted when on feed or tutorial detail.
            Use visibility:hidden + position:fixed instead of display:none
            so the browser keeps video elements buffered and doesn't pause them. */}
        {showFeedKeepAlive && (
          <div
            style={{
              visibility: isFeedRoute ? "visible" : "hidden",
              position: isFeedRoute ? "relative" : "fixed",
              top: 0,
              left: 0,
              width: "100%",
              height: "100dvh",
              zIndex: isFeedRoute ? "auto" : -1,
              pointerEvents: isFeedRoute ? "auto" : "none",
            }}
          >
            <Feed />
          </div>
        )}

        {/* Other routes render normally via Switch */}
        {!isFeedRoute && (
          <Switch>
            <Route path="/tutorial/:id" component={TutorialDetail} />
            <Route path="/play/:id" component={Player} />
            <Route path="/library" component={Library} />
            <Route path="/profile" component={Profile} />
            <Route path="/creator/upload" component={CreatorUpload} />
            <Route path="/creator/edit/:id" component={CreatorEdit} />
            <Route component={NotFound} />
          </Switch>
        )}
      </div>
      {isAuthenticated && <MobileNav />}
    </div>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/admin" component={AdminDashboard} />
      <Route path="/admin/users" component={AdminUsers} />
      <Route path="/admin/content" component={AdminContent} />
      <Route path="/admin/:rest*">{() => <AdminLayout />}</Route>
      <Route component={MobileApp} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark">
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
