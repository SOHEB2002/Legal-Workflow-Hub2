import { Suspense, lazy, useState, useCallback } from "react";
import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { RefreshCw } from "lucide-react";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, SidebarTrigger, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { AuthProvider, useAuth } from "@/lib/auth-context";
import { ThemeProvider } from "@/lib/theme-provider";
import { CasesProvider } from "@/lib/cases-context";
import { ClientsProvider } from "@/lib/clients-context";
import { ConsultationsProvider } from "@/lib/consultations-context";
import { HearingsProvider } from "@/lib/hearings-context";
import { DepartmentsProvider } from "@/lib/departments-context";
import { FieldTasksProvider } from "@/lib/field-tasks-context";
import { DashboardProvider } from "@/lib/dashboard-context";
import { ContactsProvider } from "@/lib/contacts-context";
import { StandardsProvider } from "@/lib/standards-context";
import { NotificationsProvider } from "@/lib/notifications-context";
import { GlobalSearch } from "@/components/global-search";
import { ThemeToggle } from "@/components/theme-toggle";
import { NotificationsBell } from "@/components/notifications/notifications-bell";
import { FavoritesProvider } from "@/lib/favorites-context";
import { FavoritesDropdown, RecentVisitsDropdown } from "@/components/favorites-dropdown";
import { KeyboardShortcutsProvider } from "@/components/keyboard-shortcuts";
import { OnboardingProvider } from "@/components/onboarding-tour";
import { ErrorBoundary } from "@/components/error-boundary";
import { WorkflowProvider } from "@/lib/workflow-context";
import { UsersProvider } from "@/lib/users-context";
import { MemosProvider } from "@/lib/memos-context";

const LoginPage = lazy(() => import("@/pages/login"));
const DashboardPage = lazy(() => import("@/pages/dashboard"));
const CasesPage = lazy(() => import("@/pages/cases"));
const ClientsPage = lazy(() => import("@/pages/clients"));
const ConsultationsPage = lazy(() => import("@/pages/consultations"));
const HearingsPage = lazy(() => import("@/pages/hearings"));
const UsersPage = lazy(() => import("@/pages/users"));
const FieldTasksPage = lazy(() => import("@/pages/field-tasks"));
const DashboardSettingsPage = lazy(() => import("@/pages/dashboard-settings"));
const KPIsPage = lazy(() => import("@/pages/kpis"));
const HelpPage = lazy(() => import("@/pages/help"));
const StandardsPage = lazy(() => import("@/pages/standards"));
const NotificationsPage = lazy(() => import("@/pages/notifications"));
const NotificationPreferencesPage = lazy(() => import("@/pages/notification-preferences"));
const NotificationDashboardPage = lazy(() => import("@/pages/notification-dashboard"));
const WorkflowBoardPage = lazy(() => import("@/pages/workflow-board"));
const WorkloadDashboardPage = lazy(() => import("@/pages/workload-dashboard"));
const PerformanceDashboardPage = lazy(() => import("@/pages/performance-dashboard"));
const ActivityLogPage = lazy(() => import("@/pages/activity-log"));
const UserProfilePage = lazy(() => import("@/pages/user-profile"));
const ReportsPage = lazy(() => import("@/pages/reports"));
const MemosPage = lazy(() => import("@/pages/memos"));
const SupportPage = lazy(() => import("@/pages/support"));
const DelegationsPage = lazy(() => import("@/pages/delegations"));
const TeamsPage = lazy(() => import("@/pages/teams"));
const NotFound = lazy(() => import("@/pages/not-found"));

function PageLoader() {
  return (
    <div className="flex items-center justify-center min-h-[200px]">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
    </div>
  );
}

function Router() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Switch>
        <Route path="/" component={DashboardPage} />
        <Route path="/cases" component={CasesPage} />
        <Route path="/clients" component={ClientsPage} />
        <Route path="/consultations" component={ConsultationsPage} />
        <Route path="/hearings" component={HearingsPage} />
        <Route path="/field-tasks" component={FieldTasksPage} />
        <Route path="/users" component={UsersPage} />
        <Route path="/dashboard-settings" component={DashboardSettingsPage} />
        <Route path="/kpis" component={KPIsPage} />
        <Route path="/help" component={HelpPage} />
        <Route path="/standards" component={StandardsPage} />
        <Route path="/notifications" component={NotificationsPage} />
        <Route path="/notification-preferences" component={NotificationPreferencesPage} />
        <Route path="/notification-dashboard" component={NotificationDashboardPage} />
        <Route path="/workflow-board" component={WorkflowBoardPage} />
        <Route path="/workload-dashboard" component={WorkloadDashboardPage} />
        <Route path="/performance-dashboard" component={PerformanceDashboardPage} />
        <Route path="/activity-log" component={ActivityLogPage} />
        <Route path="/user-profile/:id" component={UserProfilePage} />
        <Route path="/reports" component={ReportsPage} />
        <Route path="/memos" component={MemosPage} />
        <Route path="/support" component={SupportPage} />
        <Route path="/delegations" component={DelegationsPage} />
        <Route path="/teams" component={TeamsPage} />
        <Route component={NotFound} />
      </Switch>
    </Suspense>
  );
}

function RefreshButton() {
  const [spinning, setSpinning] = useState(false);
  const lastClickRef = useState(() => ({ time: 0 }))[0];
  const handleRefresh = useCallback(() => {
    const now = Date.now();
    if (now - lastClickRef.time < 2000) {
      window.location.reload();
      return;
    }
    lastClickRef.time = now;
    setSpinning(true);
    queryClient.clear();
    queryClient.refetchQueries();
    setTimeout(() => setSpinning(false), 800);
  }, [lastClickRef]);
  return (
    <button
      onClick={handleRefresh}
      className="inline-flex items-center justify-center rounded-md w-9 h-9 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
      title="تحديث البيانات"
      data-testid="button-refresh"
    >
      <RefreshCw className={`w-4 h-4 ${spinning ? "animate-spin" : ""}`} />
    </button>
  );
}

function AuthenticatedLayout() {
  const style = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "4rem",
  };

  return (
    <SidebarProvider style={style as React.CSSProperties}>
      <div className="flex min-h-screen w-full">
        <AppSidebar />
        <SidebarInset className="flex-1 flex flex-col">
          <header className="sticky top-0 z-50 flex items-center gap-4 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 p-3">
            <SidebarTrigger data-testid="button-sidebar-toggle" />
            <GlobalSearch />
            <div className="flex-1" />
            <RefreshButton />
            <NotificationsBell />
            <RecentVisitsDropdown />
            <FavoritesDropdown />
            <ThemeToggle />
          </header>
          <main className="flex-1 overflow-auto">
            <Router />
          </main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}

function AppContent() {
  const { user } = useAuth();

  if (!user) {
    return (
      <Suspense fallback={<PageLoader />}>
        <LoginPage />
      </Suspense>
    );
  }

  

  return <AuthenticatedLayout />;
}

function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
        <AuthProvider>
          <DepartmentsProvider>
            <ClientsProvider>
              <CasesProvider>
                <ConsultationsProvider>
                  <HearingsProvider>
                    <FieldTasksProvider>
                      <MemosProvider>
                      <ContactsProvider>
                        <DashboardProvider>
                          <StandardsProvider>
                            <NotificationsProvider>
                            <UsersProvider>
                            <WorkflowProvider>
                            <FavoritesProvider>
                            <TooltipProvider>
                              <KeyboardShortcutsProvider>
                                <OnboardingProvider>
                                  <AppContent />
                                </OnboardingProvider>
                              </KeyboardShortcutsProvider>
                              <Toaster />
                            </TooltipProvider>
                            </FavoritesProvider>
                            </WorkflowProvider>
                            </UsersProvider>
                            </NotificationsProvider>
                          </StandardsProvider>
                        </DashboardProvider>
                      </ContactsProvider>
                      </MemosProvider>
                    </FieldTasksProvider>
                  </HearingsProvider>
                </ConsultationsProvider>
              </CasesProvider>
            </ClientsProvider>
          </DepartmentsProvider>
        </AuthProvider>
      </ThemeProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
