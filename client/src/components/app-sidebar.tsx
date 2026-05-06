import { useEffect } from "react";
import { Link, useLocation } from "wouter";
import { LayoutDashboard, Briefcase, Users, MessageSquare, Calendar, UserCog, LogOut, Moon, Sun, ClipboardList, BarChart3, HelpCircle, Settings, ClipboardCheck, Bell, Workflow, Activity, TrendingUp, FileText, FileBarChart, ScrollText, Headphones, ArrowLeftRight } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useAuth } from "@/lib/auth-context";
import { useTheme } from "@/lib/theme-provider";
import { UserRoleLabels, type SidebarSectionValue } from "@shared/schema";
import { useSidebarCounts } from "@/hooks/use-sidebar-counts";
import logoImage from "@assets/WhatsApp_Image_2026-02-13_at_2.24.30_PM_1770981889395.jpeg";

type MenuItem = {
  title: string;
  url: string;
  icon: typeof LayoutDashboard;
  // The four sections that participate in the "new since last visit"
  // sidebar badges. Other items leave this undefined.
  countSection?: SidebarSectionValue;
};

const menuItems: MenuItem[] = [
  {
    title: "الرئيسية",
    url: "/",
    icon: LayoutDashboard,
  },
  {
    title: "القضايا",
    url: "/cases",
    icon: Briefcase,
    countSection: "cases",
  },
  {
    title: "الاستشارات",
    url: "/consultations",
    icon: MessageSquare,
    countSection: "consultations",
  },
  {
    title: "العملاء",
    url: "/clients",
    icon: Users,
  },
  {
    title: "الجلسات",
    url: "/hearings",
    icon: Calendar,
    countSection: "hearings",
  },
  {
    title: "المذكرات القانونية",
    url: "/memos",
    icon: ScrollText,
    countSection: "memos",
  },
  {
    title: "المهام الميدانية",
    url: "/field-tasks",
    icon: ClipboardList,
  },
  {
    title: "الإشعارات",
    url: "/notifications",
    icon: Bell,
  },
];

const adminMenuItems = [
  {
    title: "المستخدمين",
    url: "/users",
    icon: UserCog,
  },
  {
    title: "سجل النشاط",
    url: "/activity-log",
    icon: FileText,
  },
  {
    title: "التفويضات",
    url: "/delegations",
    icon: ArrowLeftRight,
  },
];

const workflowMenuItems = [
  {
    title: "سير العمل",
    url: "/workflow-board",
    icon: Workflow,
  },
  {
    title: "أعباء العمل",
    url: "/workload-dashboard",
    icon: Activity,
  },
  {
    title: "الأداء",
    url: "/performance-dashboard",
    icon: TrendingUp,
  },
];

const toolsMenuItems = [
  {
    title: "التقارير",
    url: "/reports",
    icon: FileBarChart,
  },
  {
    title: "الأداء",
    url: "/kpis",
    icon: BarChart3,
  },
  {
    title: "المراجعة",
    url: "/standards",
    icon: ClipboardCheck,
  },
  {
    title: "الإعدادات",
    url: "/dashboard-settings",
    icon: Settings,
  },
  {
    title: "الدعم الفني",
    url: "/support",
    icon: Headphones,
  },
  {
    title: "المساعدة",
    url: "/help",
    icon: HelpCircle,
  },
];

function formatBadgeCount(n: number): string {
  return n > 99 ? "99+" : String(n);
}

export function AppSidebar() {
  const [location] = useLocation();
  const { user, logout, permissions } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { counts, markViewed } = useSidebarCounts();

  // Catch direct/deep navigation (typed URL, dashboard widget, etc.) —
  // not just clicks on the sidebar link. Whenever the route lands on a
  // page that has a badge section, mark it viewed. The route prefix
  // match handles `/cases/:id` style detail pages too.
  useEffect(() => {
    const map: Record<string, SidebarSectionValue> = {
      "/cases": "cases",
      "/consultations": "consultations",
      "/hearings": "hearings",
      "/memos": "memos",
    };
    for (const [prefix, section] of Object.entries(map)) {
      if (location === prefix || location.startsWith(`${prefix}/`)) {
        markViewed(section);
        break;
      }
    }
  }, [location, markViewed]);

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .slice(0, 2);
  };

  return (
    <Sidebar side="right" collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border p-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-white flex items-center justify-center flex-shrink-0 overflow-hidden p-1">
            <img 
              src={logoImage} 
              alt="شركة العون" 
              className="w-full h-full object-contain"
            />
          </div>
          <div className="overflow-hidden group-data-[collapsible=icon]:hidden">
            <h1 className="font-bold text-sidebar-foreground truncate">شركة العون</h1>
            <p className="text-xs text-sidebar-foreground/70 truncate">للمحاماة والاستشارات القانونية</p>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="text-sidebar-foreground/60">القائمة الرئيسية</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {menuItems.map((item) => {
                const count = item.countSection ? counts[item.countSection] : 0;
                const showBadge = !!item.countSection && count > 0;
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      asChild
                      isActive={location === item.url}
                      tooltip={item.title}
                    >
                      <Link
                        href={item.url}
                        data-testid={`link-${item.url.slice(1) || "dashboard"}`}
                      >
                        <item.icon className="w-4 h-4" />
                        <span>{item.title}</span>
                        {showBadge && (
                          <span
                            data-testid={`badge-${item.countSection}`}
                            className="ms-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1.5 text-[10px] font-semibold leading-none text-accent-foreground group-data-[collapsible=icon]:hidden"
                          >
                            {formatBadgeCount(count)}
                          </span>
                        )}
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {permissions.canManageUsers && (
          <SidebarGroup>
            <SidebarGroupLabel className="text-sidebar-foreground/60">الإدارة</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {adminMenuItems.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      asChild
                      isActive={location === item.url}
                      tooltip={item.title}
                    >
                      <Link href={item.url} data-testid={`link-${item.url.slice(1)}`}>
                        <item.icon className="w-4 h-4" />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        <SidebarGroup>
          <SidebarGroupLabel className="text-sidebar-foreground/60">سير العمل</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {workflowMenuItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    isActive={location === item.url}
                    tooltip={item.title}
                  >
                    <Link href={item.url} data-testid={`link-${item.url.slice(1)}`}>
                      <item.icon className="w-4 h-4" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel className="text-sidebar-foreground/60">الأدوات</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {toolsMenuItems
                .filter((item) => {
                  if (item.url === "/reports") {
                    return ["branch_manager", "cases_review_head", "consultations_review_head"].includes(user?.role || "");
                  }
                  return true;
                })
                .map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    isActive={location === item.url}
                    tooltip={item.title}
                  >
                    <Link href={item.url} data-testid={`link-${item.url.slice(1)}`}>
                      <item.icon className="w-4 h-4" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border p-4">
        <div className="flex items-center justify-between gap-2 mb-4 group-data-[collapsible=icon]:justify-center">
          <Link href={`/user-profile/${user?.id}`} className="flex items-center gap-3 min-w-0 group-data-[collapsible=icon]:hidden hover-elevate rounded-md p-1 -m-1" data-testid="link-my-profile">
            <Avatar className="w-9 h-9 flex-shrink-0 bg-accent">
              <AvatarFallback className="bg-accent text-accent-foreground text-sm font-semibold">
                {getInitials(user?.name || "م")}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="font-medium text-sidebar-foreground text-sm truncate">{user?.name}</p>
              <p className="text-xs text-sidebar-foreground/60 truncate">
                {user?.role ? UserRoleLabels[user.role] : ""}
              </p>
            </div>
          </Link>
          <Button
            size="icon"
            variant="ghost"
            data-testid="button-toggle-theme"
            onClick={toggleTheme}
            className="text-sidebar-foreground hover:bg-sidebar-accent flex-shrink-0"
          >
            {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </Button>
        </div>
        <Button
          variant="ghost"
          data-testid="button-logout"
          onClick={logout}
          className="w-full justify-start text-sidebar-foreground hover:bg-sidebar-accent group-data-[collapsible=icon]:justify-center"
        >
          <LogOut className="w-4 h-4 ml-2 group-data-[collapsible=icon]:ml-0" />
          <span className="group-data-[collapsible=icon]:hidden">تسجيل الخروج</span>
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}
