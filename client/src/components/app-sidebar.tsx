import { Link, useLocation } from "wouter";
import { LayoutDashboard, Briefcase, Users, MessageSquare, Calendar, UserCog, LogOut, Moon, Sun, ClipboardList, BarChart3, HelpCircle, Settings, ClipboardCheck, Bell, Workflow, Activity, TrendingUp, UsersRound, FileText, FileBarChart, ScrollText } from "lucide-react";
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
import { UserRoleLabels } from "@shared/schema";
import logoImage from "@assets/WhatsApp_Image_2026-01-30_at_8.35.33_PM_1769794981480.jpeg";

const menuItems = [
  {
    title: "الرئيسية",
    url: "/",
    icon: LayoutDashboard,
  },
  {
    title: "القضايا",
    url: "/cases",
    icon: Briefcase,
  },
  {
    title: "الاستشارات",
    url: "/consultations",
    icon: MessageSquare,
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
  },
  {
    title: "المذكرات القانونية",
    url: "/memos",
    icon: ScrollText,
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
    title: "الفرق",
    url: "/teams",
    icon: UsersRound,
  },
  {
    title: "سجل النشاط",
    url: "/activity-log",
    icon: FileText,
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
    title: "المساعدة",
    url: "/help",
    icon: HelpCircle,
  },
];

export function AppSidebar() {
  const [location] = useLocation();
  const { user, logout, permissions } = useAuth();
  const { theme, toggleTheme } = useTheme();

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
              {menuItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    isActive={location === item.url}
                    tooltip={item.title}
                  >
                    <Link href={item.url} data-testid={`link-${item.url.slice(1) || "dashboard"}`}>
                      <item.icon className="w-4 h-4" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
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
          <div className="flex items-center gap-3 min-w-0 group-data-[collapsible=icon]:hidden">
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
          </div>
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
