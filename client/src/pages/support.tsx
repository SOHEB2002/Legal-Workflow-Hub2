import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
import {
  Plus,
  TicketCheck,
  Clock,
  CheckCircle2,
  AlertCircle,
  Search,
  Filter,
  MessageCircle,
  Star,
  ArrowRight,
  Eye,
  X,
  Send,
  ChevronDown,
  Headphones,
  Bug,
  Lightbulb,
  HelpCircle,
  Monitor,
  Gauge,
  MoreHorizontal,
  Loader2,
} from "lucide-react";
import {
  type SupportTicket,
  type TicketComment,
  TicketType,
  TicketTypeLabels,
  TicketStatus,
  TicketStatusLabels,
  UserRoleLabels,
  canManageSupportTickets,
} from "@shared/schema";

const ticketTypeIcons: Record<string, typeof Bug> = {
  "خلل_فني": Bug,
  "اقتراح_تطوير": Lightbulb,
  "استفسار": HelpCircle,
  "مشكلة_واجهة": Monitor,
  "بطء_أداء": Gauge,
  "أخرى": MoreHorizontal,
};

const statusColors: Record<string, string> = {
  "جديدة": "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  "مفتوحة": "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
  "قيد_المعالجة": "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
  "بانتظار_رد_المستخدم": "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
  "تم_الحل": "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  "مغلقة": "bg-muted text-muted-foreground",
};

const priorityColors: Record<string, string> = {
  "عاجل": "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  "عالي": "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
  "متوسط": "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  "منخفض": "bg-muted text-muted-foreground",
};

const relatedPages = [
  { value: "dashboard", label: "الرئيسية" },
  { value: "cases", label: "القضايا" },
  { value: "consultations", label: "الاستشارات" },
  { value: "clients", label: "العملاء" },
  { value: "hearings", label: "الجلسات" },
  { value: "memos", label: "المذكرات" },
  { value: "field-tasks", label: "المهام الميدانية" },
  { value: "notifications", label: "الإشعارات" },
  { value: "users", label: "المستخدمين" },
  { value: "reports", label: "التقارير" },
  { value: "other", label: "أخرى" },
];

export default function SupportPage() {
  const { user, users } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const isAdmin = user ? canManageSupportTickets(user.role) : false;
  const [activeTab, setActiveTab] = useState(isAdmin ? "admin" : "my-tickets");
  const [showNewTicket, setShowNewTicket] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState<SupportTicket | null>(null);
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterType, setFilterType] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");

  const { data: tickets = [], isLoading } = useQuery<SupportTicket[]>({
    queryKey: ["/api/support/tickets"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/support/tickets", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/support/tickets"] });
      setShowNewTicket(false);
      toast({ title: "تم إرسال التذكرة بنجاح" });
    },
    onError: (e: any) => {
      toast({ title: "خطأ", description: e.message, variant: "destructive" });
    },
  });

  const statusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const res = await apiRequest("PATCH", `/api/support/tickets/${id}/status`, { status });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/support/tickets"] });
      setSelectedTicket(data);
      toast({ title: "تم تحديث الحالة" });
    },
  });

  const assignMutation = useMutation({
    mutationFn: async ({ id, assignedTo }: { id: string; assignedTo: string }) => {
      const res = await apiRequest("PATCH", `/api/support/tickets/${id}/assign`, { assignedTo });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/support/tickets"] });
      setSelectedTicket(data);
      toast({ title: "تم تعيين التذكرة" });
    },
  });

  const commentMutation = useMutation({
    mutationFn: async ({ id, ...rest }: { id: string; message: string; isInternal: boolean; userId: string; userName: string; userRole: string }) => {
      const res = await apiRequest("POST", `/api/support/tickets/${id}/comment`, rest);
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/support/tickets"] });
      setSelectedTicket(data);
    },
  });

  const rateMutation = useMutation({
    mutationFn: async ({ id, rating, ratingComment }: { id: string; rating: number; ratingComment: string }) => {
      const res = await apiRequest("POST", `/api/support/tickets/${id}/rate`, { rating, ratingComment });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/support/tickets"] });
      setSelectedTicket(data);
      toast({ title: "شكرا لتقييمك" });
    },
  });

  const myTickets = useMemo(() => tickets.filter(t => t.submittedBy === user?.id), [tickets, user]);

  const filteredTickets = useMemo(() => {
    const source = activeTab === "my-tickets" ? myTickets : tickets;
    return source.filter(t => {
      if (filterStatus !== "all" && t.status !== filterStatus) return false;
      if (filterType !== "all" && t.ticketType !== filterType) return false;
      if (searchQuery && !t.title.includes(searchQuery) && !t.ticketNumber.includes(searchQuery)) return false;
      return true;
    });
  }, [tickets, myTickets, activeTab, filterStatus, filterType, searchQuery]);

  const stats = useMemo(() => {
    const source = activeTab === "my-tickets" ? myTickets : tickets;
    return {
      total: source.length,
      open: source.filter(t => !["مغلقة", "تم_الحل"].includes(t.status)).length,
      resolved: source.filter(t => t.status === "تم_الحل").length,
      closed: source.filter(t => t.status === "مغلقة").length,
    };
  }, [tickets, myTickets, activeTab]);

  const getUserName = (id: string) => users.find(u => u.id === id)?.name || id;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-6" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-support-title">الدعم الفني</h1>
          <p className="text-sm text-muted-foreground">ارسل تذكرة دعم فني وتابع حالتها</p>
        </div>
        <Button onClick={() => setShowNewTicket(true)} data-testid="button-new-ticket">
          <Plus className="w-4 h-4 ml-2" />
          تذكرة جديدة
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-md bg-blue-100 dark:bg-blue-900/30">
              <TicketCheck className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="text-2xl font-bold" data-testid="text-stat-total">{stats.total}</p>
              <p className="text-xs text-muted-foreground">إجمالي التذاكر</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-md bg-yellow-100 dark:bg-yellow-900/30">
              <Clock className="w-5 h-5 text-yellow-600 dark:text-yellow-400" />
            </div>
            <div>
              <p className="text-2xl font-bold" data-testid="text-stat-open">{stats.open}</p>
              <p className="text-xs text-muted-foreground">مفتوحة</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-md bg-green-100 dark:bg-green-900/30">
              <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <p className="text-2xl font-bold" data-testid="text-stat-resolved">{stats.resolved}</p>
              <p className="text-xs text-muted-foreground">تم حلها</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-md bg-muted">
              <AlertCircle className="w-5 h-5 text-muted-foreground" />
            </div>
            <div>
              <p className="text-2xl font-bold" data-testid="text-stat-closed">{stats.closed}</p>
              <p className="text-xs text-muted-foreground">مغلقة</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {isAdmin && (
        <Tabs value={activeTab} onValueChange={setActiveTab} dir="rtl">
          <TabsList>
            <TabsTrigger value="admin" data-testid="tab-admin">لوحة الإدارة</TabsTrigger>
            <TabsTrigger value="my-tickets" data-testid="tab-my-tickets">تذاكري</TabsTrigger>
          </TabsList>
        </Tabs>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="بحث بالعنوان أو رقم التذكرة..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="pr-10"
            data-testid="input-search-tickets"
          />
        </div>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-[160px]" data-testid="select-filter-status">
            <SelectValue placeholder="الحالة" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">جميع الحالات</SelectItem>
            {Object.entries(TicketStatusLabels).map(([val, label]) => (
              <SelectItem key={val} value={val}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="w-[160px]" data-testid="select-filter-type">
            <SelectValue placeholder="النوع" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">جميع الأنواع</SelectItem>
            {Object.entries(TicketTypeLabels).map(([val, label]) => (
              <SelectItem key={val} value={val}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {filteredTickets.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <Headphones className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-lg font-medium">لا توجد تذاكر</p>
            <p className="text-sm text-muted-foreground mt-1">اضغط "تذكرة جديدة" لإنشاء تذكرة دعم فني</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filteredTickets.map(ticket => {
            const TypeIcon = ticketTypeIcons[ticket.ticketType] || MoreHorizontal;
            const commentsArr = Array.isArray(ticket.comments) ? ticket.comments as TicketComment[] : [];
            return (
              <Card
                key={ticket.id}
                className="hover-elevate cursor-pointer"
                onClick={() => setSelectedTicket(ticket)}
                data-testid={`card-ticket-${ticket.ticketNumber}`}
              >
                <CardContent className="p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0 flex-1">
                      <div className="p-2 rounded-md bg-muted flex-shrink-0">
                        <TypeIcon className="w-4 h-4 text-muted-foreground" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                          <span className="text-xs font-mono text-muted-foreground bidi-override" dir="ltr">{ticket.ticketNumber}</span>
                          <Badge className={`text-xs ${statusColors[ticket.status] || ""}`} variant="secondary">
                            {TicketStatusLabels[ticket.status as keyof typeof TicketStatusLabels] || ticket.status}
                          </Badge>
                          <Badge className={`text-xs ${priorityColors[ticket.priority] || ""}`} variant="secondary">
                            {ticket.priority}
                          </Badge>
                        </div>
                        <p className="font-medium truncate">{ticket.title}</p>
                        <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-muted-foreground">
                          <span>{TicketTypeLabels[ticket.ticketType as keyof typeof TicketTypeLabels] || ticket.ticketType}</span>
                          {isAdmin && <span>المرسل: {getUserName(ticket.submittedBy)}</span>}
                          {ticket.assignedTo && <span>المعيّن: {getUserName(ticket.assignedTo)}</span>}
                          {commentsArr.length > 0 && (
                            <span className="flex items-center gap-1">
                              <MessageCircle className="w-3 h-3" />
                              {commentsArr.length}
                            </span>
                          )}
                          <span>{ticket.createdAt ? new Date(ticket.createdAt).toLocaleDateString("ar-SA") : ""}</span>
                        </div>
                      </div>
                    </div>
                    <Button size="icon" variant="ghost" onClick={(e) => { e.stopPropagation(); setSelectedTicket(ticket); }} data-testid={`button-view-ticket-${ticket.ticketNumber}`}>
                      <Eye className="w-4 h-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <NewTicketDialog
        open={showNewTicket}
        onClose={() => setShowNewTicket(false)}
        onSubmit={(data) => createMutation.mutate(data)}
        isPending={createMutation.isPending}
      />

      {selectedTicket && (
        <TicketDetailDialog
          ticket={selectedTicket}
          open={!!selectedTicket}
          onClose={() => setSelectedTicket(null)}
          isAdmin={isAdmin}
          user={user!}
          users={users}
          onStatusChange={(status) => statusMutation.mutate({ id: selectedTicket.id, status })}
          onAssign={(assignedTo) => assignMutation.mutate({ id: selectedTicket.id, assignedTo })}
          onComment={(msg, isInternal) => commentMutation.mutate({
            id: selectedTicket.id,
            message: msg,
            isInternal,
            userId: user!.id,
            userName: user!.name,
            userRole: user!.role,
          })}
          onRate={(rating, ratingComment) => rateMutation.mutate({ id: selectedTicket.id, rating, ratingComment })}
          getUserName={(id) => getUserName(id)}
        />
      )}
    </div>
  );
}

function NewTicketDialog({
  open,
  onClose,
  onSubmit,
  isPending,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: any) => void;
  isPending: boolean;
}) {
  const [ticketType, setTicketType] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("متوسط");
  const [relatedPage, setRelatedPage] = useState("");

  const handleSubmit = () => {
    if (!ticketType || !title || !description) return;
    onSubmit({ ticketType, title, description, priority, relatedPage });
    setTicketType("");
    setTitle("");
    setDescription("");
    setPriority("متوسط");
    setRelatedPage("");
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg" dir="rtl">
        <DialogHeader>
          <DialogTitle>تذكرة دعم فني جديدة</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>نوع المشكلة *</Label>
            <Select value={ticketType} onValueChange={setTicketType}>
              <SelectTrigger data-testid="select-ticket-type">
                <SelectValue placeholder="اختر نوع المشكلة" />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(TicketTypeLabels).map(([val, label]) => (
                  <SelectItem key={val} value={val}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>العنوان *</Label>
            <Input
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="عنوان مختصر للمشكلة"
              data-testid="input-ticket-title"
            />
          </div>
          <div>
            <Label>الوصف التفصيلي *</Label>
            <Textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="اشرح المشكلة بالتفصيل وخطوات إعادة إنتاجها..."
              rows={4}
              data-testid="input-ticket-description"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>الأولوية</Label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger data-testid="select-ticket-priority">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="عاجل">عاجل</SelectItem>
                  <SelectItem value="عالي">عالي</SelectItem>
                  <SelectItem value="متوسط">متوسط</SelectItem>
                  <SelectItem value="منخفض">منخفض</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>الصفحة المتعلقة</Label>
              <Select value={relatedPage} onValueChange={setRelatedPage}>
                <SelectTrigger data-testid="select-related-page">
                  <SelectValue placeholder="اختياري" />
                </SelectTrigger>
                <SelectContent>
                  {relatedPages.map(p => (
                    <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onClose} data-testid="button-cancel-ticket">إلغاء</Button>
            <Button
              onClick={handleSubmit}
              disabled={!ticketType || !title || !description || isPending}
              data-testid="button-submit-ticket"
            >
              {isPending ? <Loader2 className="w-4 h-4 animate-spin ml-2" /> : <Send className="w-4 h-4 ml-2" />}
              إرسال التذكرة
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function TicketDetailDialog({
  ticket,
  open,
  onClose,
  isAdmin,
  user,
  users,
  onStatusChange,
  onAssign,
  onComment,
  onRate,
  getUserName,
}: {
  ticket: SupportTicket;
  open: boolean;
  onClose: () => void;
  isAdmin: boolean;
  user: any;
  users: any[];
  onStatusChange: (status: string) => void;
  onAssign: (userId: string) => void;
  onComment: (msg: string, isInternal: boolean) => void;
  onRate: (rating: number, comment: string) => void;
  getUserName: (id: string) => string;
}) {
  const [commentText, setCommentText] = useState("");
  const [isInternal, setIsInternal] = useState(false);
  const [rating, setRating] = useState(0);
  const [ratingComment, setRatingComment] = useState("");

  const comments = Array.isArray(ticket.comments) ? ticket.comments as TicketComment[] : [];
  const TypeIcon = ticketTypeIcons[ticket.ticketType] || MoreHorizontal;
  const isOwner = ticket.submittedBy === user?.id;
  const canRate = isOwner && ticket.status === "تم_الحل" && !ticket.rating;

  const handleSendComment = () => {
    if (!commentText.trim()) return;
    onComment(commentText, isInternal);
    setCommentText("");
    setIsInternal(false);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <div className="flex flex-wrap items-center gap-2">
            <DialogTitle className="text-lg">تذكرة {ticket.ticketNumber}</DialogTitle>
            <Badge className={statusColors[ticket.status] || ""} variant="secondary">
              {TicketStatusLabels[ticket.status as keyof typeof TicketStatusLabels] || ticket.status}
            </Badge>
          </div>
        </DialogHeader>

        <div className="space-y-5">
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <TypeIcon className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">
                {TicketTypeLabels[ticket.ticketType as keyof typeof TicketTypeLabels]}
              </span>
              <Badge className={`text-xs ${priorityColors[ticket.priority] || ""}`} variant="secondary">
                {ticket.priority}
              </Badge>
            </div>
            <h3 className="font-semibold text-lg">{ticket.title}</h3>
            <p className="text-sm whitespace-pre-wrap">{ticket.description}</p>

            <div className="grid grid-cols-2 gap-3 text-sm pt-2">
              <div>
                <span className="text-muted-foreground">المرسل: </span>
                <span className="font-medium">{getUserName(ticket.submittedBy)}</span>
              </div>
              {ticket.assignedTo && (
                <div>
                  <span className="text-muted-foreground">المعيّن إليه: </span>
                  <span className="font-medium">{getUserName(ticket.assignedTo)}</span>
                </div>
              )}
              <div>
                <span className="text-muted-foreground">تاريخ الإنشاء: </span>
                <span>{ticket.createdAt ? new Date(ticket.createdAt).toLocaleDateString("ar-SA") : ""}</span>
              </div>
              {ticket.relatedPage && (
                <div>
                  <span className="text-muted-foreground">الصفحة: </span>
                  <span>{relatedPages.find(p => p.value === ticket.relatedPage)?.label || ticket.relatedPage}</span>
                </div>
              )}
            </div>
          </div>

          {isAdmin && (
            <Card>
              <CardContent className="p-4 space-y-3">
                <p className="text-sm font-medium">إجراءات الإدارة</p>
                <div className="flex flex-wrap gap-3">
                  <Select onValueChange={onStatusChange}>
                    <SelectTrigger className="w-[180px]" data-testid="select-change-status">
                      <SelectValue placeholder="تغيير الحالة" />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(TicketStatusLabels).map(([val, label]) => (
                        <SelectItem key={val} value={val}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select onValueChange={onAssign}>
                    <SelectTrigger className="w-[180px]" data-testid="select-assign-ticket">
                      <SelectValue placeholder="تعيين إلى" />
                    </SelectTrigger>
                    <SelectContent>
                      {users
                        .filter(u => canManageSupportTickets(u.role) && u.isActive)
                        .map(u => (
                          <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>
          )}

          <div>
            <p className="text-sm font-medium mb-3">
              المحادثة ({comments.length})
            </p>
            {comments.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">لا توجد تعليقات بعد</p>
            ) : (
              <div className="space-y-3 max-h-[250px] overflow-y-auto">
                {comments.map((c) => {
                  const isAdminComment = canManageSupportTickets(c.userRole);
                  return (
                    <div
                      key={c.id}
                      className={`flex gap-3 ${c.isInternal ? "opacity-70" : ""}`}
                    >
                      <Avatar className="w-8 h-8 flex-shrink-0">
                        <AvatarFallback className={`text-xs ${isAdminComment ? "bg-accent text-accent-foreground" : "bg-muted"}`}>
                          {c.userName?.slice(0, 2) || "؟"}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          <span className="font-medium">{c.userName}</span>
                          {isAdminComment && <Badge variant="secondary" className="text-[10px]">دعم فني</Badge>}
                          {c.isInternal && <Badge variant="outline" className="text-[10px]">ملاحظة داخلية</Badge>}
                          <span className="text-muted-foreground">
                            {new Date(c.createdAt).toLocaleDateString("ar-SA")}
                          </span>
                        </div>
                        <p className="text-sm mt-1 whitespace-pre-wrap">{c.message}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {!["مغلقة"].includes(ticket.status) && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Textarea
                  value={commentText}
                  onChange={e => setCommentText(e.target.value)}
                  placeholder="اكتب رسالتك هنا..."
                  rows={2}
                  className="flex-1"
                  data-testid="input-comment"
                />
              </div>
              <div className="flex items-center justify-between gap-2">
                {isAdmin && (
                  <label className="flex items-center gap-2 text-xs cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isInternal}
                      onChange={e => setIsInternal(e.target.checked)}
                      className="rounded"
                      data-testid="checkbox-internal"
                    />
                    ملاحظة داخلية (لا يراها المستخدم)
                  </label>
                )}
                <div className="flex-1" />
                <Button
                  size="sm"
                  onClick={handleSendComment}
                  disabled={!commentText.trim()}
                  data-testid="button-send-comment"
                >
                  <Send className="w-4 h-4 ml-1" />
                  إرسال
                </Button>
              </div>
            </div>
          )}

          {canRate && (
            <Card>
              <CardContent className="p-4 space-y-3">
                <p className="text-sm font-medium">قيّم تجربتك</p>
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map(s => (
                    <button
                      key={s}
                      onClick={() => setRating(s)}
                      className="p-1"
                      data-testid={`button-star-${s}`}
                    >
                      <Star
                        className={`w-6 h-6 ${s <= rating ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground"}`}
                      />
                    </button>
                  ))}
                </div>
                <Textarea
                  value={ratingComment}
                  onChange={e => setRatingComment(e.target.value)}
                  placeholder="ملاحظات إضافية (اختياري)"
                  rows={2}
                  data-testid="input-rating-comment"
                />
                <Button
                  size="sm"
                  onClick={() => { if (rating > 0) onRate(rating, ratingComment); }}
                  disabled={rating === 0}
                  data-testid="button-submit-rating"
                >
                  إرسال التقييم
                </Button>
              </CardContent>
            </Card>
          )}

          {ticket.rating && (
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">التقييم:</span>
              <div className="flex gap-0.5">
                {[1, 2, 3, 4, 5].map(s => (
                  <Star
                    key={s}
                    className={`w-4 h-4 ${s <= ticket.rating! ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground"}`}
                  />
                ))}
              </div>
              {ticket.ratingComment && <span className="text-muted-foreground">- {ticket.ratingComment}</span>}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
