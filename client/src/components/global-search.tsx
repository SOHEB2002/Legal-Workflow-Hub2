import { useEffect, useState, useCallback } from "react";
import { useLocation } from "wouter";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { useCases } from "@/lib/cases-context";
import { useClients } from "@/lib/clients-context";
import { useConsultations } from "@/lib/consultations-context";
import { useHearings } from "@/lib/hearings-context";
import { 
  Briefcase, 
  Users, 
  MessageSquare, 
  Calendar,
  Search,
  LayoutDashboard,
  ClipboardList,
  Settings,
  HelpCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";

export function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [, setLocation] = useLocation();
  const { cases } = useCases();
  const { clients, getClientName } = useClients();
  const { consultations } = useConsultations();
  const { hearings } = useHearings();

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((open) => !open);
      }
    };

    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  const runCommand = useCallback((command: () => void) => {
    setOpen(false);
    command();
  }, []);

  const quickLinks = [
    { icon: LayoutDashboard, label: "لوحة التحكم", path: "/" },
    { icon: Briefcase, label: "القضايا", path: "/cases" },
    { icon: Users, label: "العملاء", path: "/clients" },
    { icon: MessageSquare, label: "الاستشارات", path: "/consultations" },
    { icon: Calendar, label: "الجلسات", path: "/hearings" },
    { icon: ClipboardList, label: "المهام الميدانية", path: "/field-tasks" },
    { icon: Settings, label: "إعدادات لوحة التحكم", path: "/dashboard-settings" },
    { icon: HelpCircle, label: "المساعدة", path: "/help" },
  ];

  return (
    <>
      <Button
        variant="outline"
        className="relative h-9 w-full justify-start text-sm text-muted-foreground sm:w-64 sm:pr-12"
        onClick={() => setOpen(true)}
        data-testid="button-global-search"
      >
        <Search className="ml-2 h-4 w-4" />
        <span className="hidden lg:inline-flex">البحث...</span>
        <span className="inline-flex lg:hidden">بحث</span>
        <kbd className="pointer-events-none absolute left-1.5 top-2 hidden h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium opacity-100 sm:flex">
          <span className="text-xs">⌘</span>K
        </kbd>
      </Button>
      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput placeholder="ابحث عن قضية، عميل، استشارة..." data-testid="input-global-search" />
        <CommandList>
          <CommandEmpty>لا توجد نتائج</CommandEmpty>
          
          <CommandGroup heading="روابط سريعة">
            {quickLinks.map((link) => (
              <CommandItem
                key={link.path}
                onSelect={() => runCommand(() => setLocation(link.path))}
                data-testid={`search-link-${link.path.slice(1) || "dashboard"}`}
              >
                <link.icon className="ml-2 h-4 w-4" />
                <span>{link.label}</span>
              </CommandItem>
            ))}
          </CommandGroup>

          {cases.length > 0 && (
            <>
              <CommandSeparator />
              <CommandGroup heading="القضايا">
                {cases.slice(0, 5).map((c) => (
                  <CommandItem
                    key={c.id}
                    onSelect={() => runCommand(() => setLocation("/cases"))}
                    data-testid={`search-case-${c.id}`}
                  >
                    <Briefcase className="ml-2 h-4 w-4" />
                    <span>{c.caseNumber}</span>
                    <span className="mr-2 text-muted-foreground text-sm">
                      - {getClientName(c.clientId)}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          )}

          {clients.length > 0 && (
            <>
              <CommandSeparator />
              <CommandGroup heading="العملاء">
                {clients.slice(0, 5).map((client) => (
                  <CommandItem
                    key={client.id}
                    onSelect={() => runCommand(() => setLocation("/clients"))}
                    data-testid={`search-client-${client.id}`}
                  >
                    <Users className="ml-2 h-4 w-4" />
                    <span>
                      {client.clientType === "فرد" ? client.individualName : client.companyName}
                    </span>
                    <span className="mr-2 text-muted-foreground text-sm">
                      - {client.phone}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          )}

          {consultations.length > 0 && (
            <>
              <CommandSeparator />
              <CommandGroup heading="الاستشارات">
                {consultations.slice(0, 5).map((c) => (
                  <CommandItem
                    key={c.id}
                    onSelect={() => runCommand(() => setLocation("/consultations"))}
                    data-testid={`search-consultation-${c.id}`}
                  >
                    <MessageSquare className="ml-2 h-4 w-4" />
                    <span>{c.consultationNumber}</span>
                    <span className="mr-2 text-muted-foreground text-sm">
                      - {getClientName(c.clientId)}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          )}

          {hearings.length > 0 && (
            <>
              <CommandSeparator />
              <CommandGroup heading="الجلسات">
                {hearings.slice(0, 5).map((h) => (
                  <CommandItem
                    key={h.id}
                    onSelect={() => runCommand(() => setLocation("/hearings"))}
                    data-testid={`search-hearing-${h.id}`}
                  >
                    <Calendar className="ml-2 h-4 w-4" />
                    <span>{h.courtName}</span>
                    <span className="mr-2 text-muted-foreground text-sm">
                      - {h.hearingDate}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          )}
        </CommandList>
      </CommandDialog>
    </>
  );
}
