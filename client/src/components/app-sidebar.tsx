import { Link, useLocation } from "wouter";
import { Scale, LayoutDashboard, Briefcase, Users, MessageSquare, Calendar, UserCog, LogOut, Moon, Sun } from "lucide-react";
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

const menuItems = [
  {
    title: "لوحة التحكم",
    url: "/",
    icon: LayoutDashboard,
  },
  {
    title: "إدارة القضايا",
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
];

const adminMenuItems = [
  {
    title: "المستخدمين",
    url: "/users",
    icon: UserCog,
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
          <div className="w-10 h-10 rounded-lg bg-accent flex items-center justify-center flex-shrink-0">
            <Scale className="w-5 h-5 text-accent-foreground" />
          </div>
          <div className="overflow-hidden group-data-[collapsible=icon]:hidden">
            <h1 className="font-bold text-sidebar-foreground truncate">مكتب المحاماة</h1>
            <p className="text-xs text-sidebar-foreground/70 truncate">نظام إدارة متكامل</p>
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
