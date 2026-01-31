import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Briefcase,
  FileText,
  Search,
  ChevronLeft,
  ChevronRight,
  User,
  CalendarDays,
  RotateCcw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useWorkflow } from "@/lib/workflow-context";
import { useCases } from "@/lib/cases-context";
import { useConsultations } from "@/lib/consultations-context";
import { useClients } from "@/lib/clients-context";
import {
  CaseStageLabels,
  CaseStagesOrder,
  ConsultationStatus,
  ClientType,
  Priority,
  CaseStageValue,
  ConsultationStatusValue,
} from "@shared/schema";
import { PriorityBadge } from "@/components/workflow/priority-badge";
import { SLAIndicator } from "@/components/workflow/sla-indicator";

export default function WorkflowBoard() {
  const [entityType, setEntityType] = useState<"case" | "consultation">("case");
  const [searchQuery, setSearchQuery] = useState("");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");
  const [departmentFilter, setDepartmentFilter] = useState<string>("all");
  
  const { cases, updateCase } = useCases();
  const { consultations, updateConsultation } = useConsultations();
  const { clients } = useClients();
  const {
    getTimeRemaining,
    reviewNotes,
  } = useWorkflow();

  const caseStages = CaseStagesOrder;
  const consultationStatuses = Object.values(ConsultationStatus);

  const departments = [
    { id: "1", name: "الترافع" },
    { id: "2", name: "التنفيذ" },
    { id: "3", name: "الشركات" },
    { id: "4", name: "العقارات" },
  ];

  const getClientName = (clientId: string) => {
    const client = clients.find(c => c.id === clientId);
    if (!client) return "غير محدد";
    return client.clientType === ClientType.INDIVIDUAL 
      ? client.individualName 
      : client.companyName || "غير محدد";
  };

  const getReturnCount = (entityId: string) => {
    return reviewNotes.filter(n => n.entityId === entityId && n.action === "returned").length;
  };

  const filteredCases = useMemo(() => {
    return cases.filter((c) => {
      const matchesSearch =
        c.caseNumber.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesPriority = priorityFilter === "all" || c.priority === priorityFilter;
      const matchesDept = departmentFilter === "all" || c.departmentId === departmentFilter;
      return matchesSearch && matchesPriority && matchesDept;
    });
  }, [cases, searchQuery, priorityFilter, departmentFilter]);

  const filteredConsultations = useMemo(() => {
    return consultations.filter((c) => {
      const matchesSearch =
        c.consultationNumber.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesSearch;
    });
  }, [consultations, searchQuery]);

  const getItemsForStage = (stage: string) => {
    if (entityType === "case") {
      return filteredCases.filter((c) => c.currentStage === stage);
    }
    return filteredConsultations.filter((c) => c.status === stage);
  };

  const getStageColor = (index: number, total: number) => {
    const progress = index / (total - 1);
    if (progress < 0.3) return "border-blue-500";
    if (progress < 0.6) return "border-yellow-500";
    if (progress < 0.9) return "border-green-500";
    return "border-emerald-500";
  };

  const handleMoveCase = (itemId: string, direction: "forward" | "backward") => {
    const item = cases.find(c => c.id === itemId);
    if (!item) return;
    
    const currentIndex = caseStages.indexOf(item.currentStage as CaseStageValue);
    
    if (direction === "forward" && currentIndex < caseStages.length - 1) {
      const newStage = caseStages[currentIndex + 1];
      updateCase(itemId, { currentStage: newStage });
    } else if (direction === "backward" && currentIndex > 0) {
      const newStage = caseStages[currentIndex - 1];
      updateCase(itemId, { currentStage: newStage });
    }
  };

  const handleMoveConsultation = (itemId: string, direction: "forward" | "backward") => {
    const item = consultations.find(c => c.id === itemId);
    if (!item) return;
    
    const currentIndex = consultationStatuses.indexOf(item.status as ConsultationStatusValue);
    
    if (direction === "forward" && currentIndex < consultationStatuses.length - 1) {
      updateConsultation(itemId, { status: consultationStatuses[currentIndex + 1] });
    } else if (direction === "backward" && currentIndex > 0) {
      updateConsultation(itemId, { status: consultationStatuses[currentIndex - 1] });
    }
  };

  const handleMoveItem = (itemId: string, direction: "forward" | "backward") => {
    if (entityType === "case") {
      handleMoveCase(itemId, direction);
    } else {
      handleMoveConsultation(itemId, direction);
    }
  };

  const getPriorityValue = (priority: string | undefined) => {
    if (priority === Priority.URGENT || priority === Priority.HIGH) return "urgent";
    if (priority === Priority.LOW) return "low";
    return "normal";
  };

  const stages = entityType === "case" ? caseStages : consultationStatuses;
  const labels = entityType === "case" 
    ? CaseStageLabels 
    : {
        [ConsultationStatus.RECEIVED]: "استلام",
        [ConsultationStatus.STUDY]: "دراسة",
        [ConsultationStatus.PREPARING_RESPONSE]: "إعداد الرد",
        [ConsultationStatus.REVIEW_COMMITTEE]: "لجنة المراجعة",
        [ConsultationStatus.AMENDMENTS]: "التعديلات",
        [ConsultationStatus.READY]: "جاهزة",
        [ConsultationStatus.DELIVERED]: "مسلّمة",
        [ConsultationStatus.CLOSED]: "مغلقة",
      };

  return (
    <div className="h-full flex flex-col p-6 space-y-4" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">لوحة سير العمل</h1>
          <p className="text-muted-foreground">إدارة ومتابعة مراحل القضايا والاستشارات</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <Tabs value={entityType} onValueChange={(v) => setEntityType(v as "case" | "consultation")} className="w-auto">
          <TabsList>
            <TabsTrigger value="case" className="gap-2" data-testid="tab-cases">
              <Briefcase className="h-4 w-4" />
              القضايا
            </TabsTrigger>
            <TabsTrigger value="consultation" className="gap-2" data-testid="tab-consultations">
              <FileText className="h-4 w-4" />
              الاستشارات
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="relative flex-1 max-w-xs">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="بحث..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pr-9"
            data-testid="input-search"
          />
        </div>

        {entityType === "case" && (
          <>
            <Select value={priorityFilter} onValueChange={setPriorityFilter}>
              <SelectTrigger className="w-32" data-testid="select-priority-filter">
                <SelectValue placeholder="الأولوية" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">الكل</SelectItem>
                <SelectItem value={Priority.URGENT}>عاجل</SelectItem>
                <SelectItem value={Priority.HIGH}>عالي</SelectItem>
                <SelectItem value={Priority.MEDIUM}>عادي</SelectItem>
                <SelectItem value={Priority.LOW}>منخفض</SelectItem>
              </SelectContent>
            </Select>

            <Select value={departmentFilter} onValueChange={setDepartmentFilter}>
              <SelectTrigger className="w-32" data-testid="select-department-filter">
                <SelectValue placeholder="القسم" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">الكل</SelectItem>
                {departments.map((dept) => (
                  <SelectItem key={dept.id} value={dept.id}>{dept.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </>
        )}
      </div>

      <div className="flex-1 overflow-hidden">
        <ScrollArea className="h-full">
          <div className="flex gap-4 pb-4 min-w-max">
            {stages.map((stage, index) => {
              const items = getItemsForStage(stage);
              const stageLabel = labels[stage as keyof typeof labels] || stage;
              
              return (
                <Card
                  key={stage}
                  className={cn(
                    "w-[280px] flex-shrink-0 flex flex-col",
                    "border-t-4",
                    getStageColor(index, stages.length)
                  )}
                  data-testid={`column-${stage}`}
                >
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm font-medium">{stageLabel}</CardTitle>
                      <Badge variant="secondary" className="text-xs">
                        {items.length}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="flex-1 p-2">
                    <ScrollArea className="h-[calc(100vh-320px)]">
                      <div className="space-y-2 p-1">
                        {items.length === 0 ? (
                          <p className="text-center text-sm text-muted-foreground py-4">
                            لا توجد عناصر
                          </p>
                        ) : (
                          items.map((item) => {
                            const timeRemaining = getTimeRemaining(item.id, entityType);
                            const returnCount = getReturnCount(item.id);
                            
                            return (
                              <Card
                                key={item.id}
                                className="p-3 cursor-pointer hover-elevate"
                                data-testid={`card-item-${item.id}`}
                              >
                                <div className="space-y-2">
                                  <div className="flex items-start justify-between gap-2">
                                    <div className="flex-1 min-w-0">
                                      <p className="text-sm font-medium truncate">
                                        {entityType === "case"
                                          ? (item as any).caseNumber
                                          : (item as any).consultationNumber}
                                      </p>
                                      <p className="text-xs text-muted-foreground">
                                        {entityType === "case"
                                          ? (item as any).caseType
                                          : (item as any).consultationType}
                                      </p>
                                    </div>
                                    {entityType === "case" && (item as any).priority && (
                                      <PriorityBadge priority={getPriorityValue((item as any).priority)} size="sm" />
                                    )}
                                  </div>

                                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                    <User className="h-3 w-3" />
                                    <span className="truncate">
                                      {getClientName(item.clientId)}
                                    </span>
                                  </div>

                                  {timeRemaining && (
                                    <SLAIndicator
                                      timeRemaining={timeRemaining}
                                      compact
                                    />
                                  )}

                                  {returnCount > 0 && (
                                    <div className="flex items-center gap-1 text-orange-500 text-xs">
                                      <RotateCcw className="h-3 w-3" />
                                      <span>{returnCount} إرجاع</span>
                                    </div>
                                  )}

                                  <div className="flex items-center justify-between pt-2 border-t">
                                    <Button
                                      size="icon"
                                      variant="ghost"
                                      className="h-6 w-6"
                                      disabled={index === 0}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleMoveItem(item.id, "backward");
                                      }}
                                      data-testid={`button-move-back-${item.id}`}
                                    >
                                      <ChevronRight className="h-4 w-4" />
                                    </Button>
                                    <CalendarDays className="h-3 w-3 text-muted-foreground" />
                                    <Button
                                      size="icon"
                                      variant="ghost"
                                      className="h-6 w-6"
                                      disabled={index === stages.length - 1}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleMoveItem(item.id, "forward");
                                      }}
                                      data-testid={`button-move-forward-${item.id}`}
                                    >
                                      <ChevronLeft className="h-4 w-4" />
                                    </Button>
                                  </div>
                                </div>
                              </Card>
                            );
                          })
                        )}
                      </div>
                    </ScrollArea>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}
