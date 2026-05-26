import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
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
  return (
    <div className="min-h-dvh bg-background flex flex-col max-w-md mx-auto relative">
      <div className="flex-1 pb-20">
        <Switch>
          <Route path="/" component={Feed} />
          <Route path="/tutorial/:id" component={TutorialDetail} />
          <Route path="/play/:id" component={Player} />
          <Route path="/library" component={Library} />
          <Route path="/profile" component={Profile} />
          <Route path="/creator/upload" component={CreatorUpload} />
          <Route path="/creator/edit/:id" component={CreatorEdit} />
          <Route component={NotFound} />
        </Switch>
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
