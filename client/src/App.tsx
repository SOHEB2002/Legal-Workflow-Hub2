import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
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
import NotFound from "@/pages/not-found";
import LoginPage from "@/pages/login";
import DashboardPage from "@/pages/dashboard";
import CasesPage from "@/pages/cases";
import ClientsPage from "@/pages/clients";
import ConsultationsPage from "@/pages/consultations";
import HearingsPage from "@/pages/hearings";
import UsersPage from "@/pages/users";
import FieldTasksPage from "@/pages/field-tasks";
import DashboardSettingsPage from "@/pages/dashboard-settings";
import KPIsPage from "@/pages/kpis";
import HelpPage from "@/pages/help";
import StandardsPage from "@/pages/standards";
import NotificationsPage from "@/pages/notifications";
import NotificationPreferencesPage from "@/pages/notification-preferences";
import NotificationDashboardPage from "@/pages/notification-dashboard";
import WorkflowBoardPage from "@/pages/workflow-board";
import WorkloadDashboardPage from "@/pages/workload-dashboard";
import PerformanceDashboardPage from "@/pages/performance-dashboard";

import ActivityLogPage from "@/pages/activity-log";
import UserProfilePage from "@/pages/user-profile";
import ReportsPage from "@/pages/reports";
import { WorkflowProvider } from "@/lib/workflow-context";
import { UsersProvider } from "@/lib/users-context";
import { MemosProvider } from "@/lib/memos-context";
import MemosPage from "@/pages/memos";
import SupportPage from "@/pages/support";

function Router() {
  return (
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
      <Route component={NotFound} />
    </Switch>
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
    return <LoginPage />;
  }

  return <AuthenticatedLayout />;
}

function App() {
  return (
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
  );
}

export default App;
