import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth-context";
import { DelegationReasonLabels } from "@shared/schema";
import {
  Plus, UserCheck, Calendar, Clock, CheckCircle, XCircle, ArrowLeftRight, RefreshCw,
} from "lucide-react";
import { BidiText, LtrInline } from "@/components/ui/bidi-text";
import { formatDateShortArabic } from "@/lib/date-utils";

function getAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  const token = localStorage.getItem("lawfirm_token");
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  const csrfToken = localStorage.getItem("lawfirm_csrf_token");
  if (csrfToken) {
    headers["X-CSRF-Token"] = csrfToken;
  }
  return headers;
}

export default function DelegationsPage() {
  const { toast } = useToast();
  const { user, users } = useAuth();
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [form, setForm] = useState({
    toUserId: "",
    reason: "إجازة" as string,
    reasonDetails: "",
    startDate: "",
    endDate: "",
    scope: "all_cases" as string,
  });

  const { data: delegations = [], isLoading } = useQuery<any[]>({
    queryKey: ['/api/delegations'],
    queryFn: async () => {
      const res = await fetch("/api/delegations", { headers: getAuthHeaders() });
      if (!res.ok) return [];
      return res.json();
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/delegations", form);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/delegations'] });
      setShowAddDialog(false);
      resetForm();
      toast({ title: "تم إنشاء طلب التفويض بنجاح" });
    },
    onError: () => {
      toast({ title: "حدث خطأ", variant: "destructive" });
    },
  });

  const approveMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("POST", `/api/delegations/${id}/approve`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/delegations'] });
      toast({ title: "تم اعتماد التفويض" });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("PATCH", `/api/delegations/${id}`, { status: "ملغي" });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/delegations'] });
      toast({ title: "تم إلغاء التفويض" });
    },
  });

  function resetForm() {
    setForm({ toUserId: "", reason: "إجازة", reasonDetails: "", startDate: "", endDate: "", scope: "all_cases" });
  }

  function getUserName(id: string) {
    const u = users.find((u: any) => u.id === id);
    return u?.name || "غير محدد";
  }

  function getStatusBadge(status: string) {
    const map: Record<string, { variant: "default" | "secondary" | "outline" | "destructive"; label: string }> = {
      "قيد_الانتظار": { variant: "outline", label: "قيد الانتظار" },
      "نشط": { variant: "default", label: "نشط" },
      "منتهي": { variant: "secondary", label: "منتهي" },
      "ملغي": { variant: "destructive", label: "ملغي" },
    };
    const item = map[status] || { variant: "outline" as const, label: status };
    return <Badge variant={item.variant}>{item.label}</Badge>;
  }

  const lawyers = users.filter((u: any) => 
    (u.role === "employee" || u.role === "department_head") && u.isActive && u.id !== user?.id
  );

  const canApprove = user?.role === "department_head" || user?.role === "branch_manager" || user?.role === "cases_review_head";

  return (
    <div className="container mx-auto p-6 space-y-6" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ArrowLeftRight className="h-6 w-6" />
            التفويضات
          </h1>
          <p className="text-muted-foreground">إدارة تفويض القضايا بين المحامين</p>
        </div>
        <Button onClick={() => { resetForm(); setShowAddDialog(true); }} data-testid="button-add-delegation">
          <Plus className="h-4 w-4 ml-1" />
          طلب تفويض جديد
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-1 pb-2">
            <CardTitle className="text-sm font-medium">إجمالي التفويضات</CardTitle>
            <ArrowLeftRight className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{delegations.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-1 pb-2">
            <CardTitle className="text-sm font-medium">نشطة</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {delegations.filter((d: any) => d.status === "نشط").length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-1 pb-2">
            <CardTitle className="text-sm font-medium">قيد الانتظار</CardTitle>
            <Clock className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">
              {delegations.filter((d: any) => d.status === "قيد_الانتظار").length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-1 pb-2">
            <CardTitle className="text-sm font-medium">منتهية</CardTitle>
            <RefreshCw className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-muted-foreground">
              {delegations.filter((d: any) => d.status === "منتهي").length}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>قائمة التفويضات</CardTitle>
          <CardDescription>جميع التفويضات الحالية والسابقة</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">جاري التحميل...</div>
          ) : delegations.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">لا توجد تفويضات</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-right">من</TableHead>
                  <TableHead className="text-right">إلى</TableHead>
                  <TableHead className="text-right">السبب</TableHead>
                  <TableHead className="text-center">من تاريخ</TableHead>
                  <TableHead className="text-center">إلى تاريخ</TableHead>
                  <TableHead className="text-center">النطاق</TableHead>
                  <TableHead className="text-center">الحالة</TableHead>
                  <TableHead className="text-center">إجراءات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {delegations.map((d: any) => (
                  <TableRow key={d.id} data-testid={`delegation-row-${d.id}`}>
                    <TableCell className="font-medium"><BidiText>{getUserName(d.fromUserId)}</BidiText></TableCell>
                    <TableCell><BidiText>{getUserName(d.toUserId)}</BidiText></TableCell>
                    <TableCell>
                      <Badge variant="outline">{DelegationReasonLabels[d.reason] || d.reason}</Badge>
                    </TableCell>
                    <TableCell className="text-center"><LtrInline>{formatDateShortArabic(d.startDate)}</LtrInline></TableCell>
                    <TableCell className="text-center"><LtrInline>{formatDateShortArabic(d.endDate)}</LtrInline></TableCell>
                    <TableCell className="text-center">
                      {d.scope === "all_cases" ? "جميع القضايا" : "قضايا محددة"}
                    </TableCell>
                    <TableCell className="text-center">{getStatusBadge(d.status)}</TableCell>
                    <TableCell className="text-center">
                      <div className="flex items-center justify-center gap-1">
                        {d.status === "قيد_الانتظار" && canApprove && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => approveMutation.mutate(d.id)}
                            disabled={approveMutation.isPending}
                            data-testid={`button-approve-${d.id}`}
                          >
                            <CheckCircle className="h-3 w-3 ml-1" />
                            اعتماد
                          </Button>
                        )}
                        {(d.status === "قيد_الانتظار" || d.status === "نشط") && (d.fromUserId === user?.id || canApprove) && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => cancelMutation.mutate(d.id)}
                            disabled={cancelMutation.isPending}
                            data-testid={`button-cancel-${d.id}`}
                          >
                            <XCircle className="h-3 w-3 ml-1" />
                            إلغاء
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserCheck className="h-5 w-5" />
              طلب تفويض جديد
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>تفويض إلى</Label>
              <Select value={form.toUserId} onValueChange={(v) => setForm({ ...form, toUserId: v })}>
                <SelectTrigger data-testid="select-delegate-to">
                  <SelectValue placeholder="اختر المحامي" />
                </SelectTrigger>
                <SelectContent>
                  {lawyers.map((l: any) => (
                    <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>السبب</Label>
              <Select value={form.reason} onValueChange={(v) => setForm({ ...form, reason: v })}>
                <SelectTrigger data-testid="select-delegation-reason">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(DelegationReasonLabels).map(([key, label]) => (
                    <SelectItem key={key} value={key}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>من تاريخ</Label>
                <Input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} data-testid="input-delegation-start" />
              </div>
              <div>
                <Label>إلى تاريخ</Label>
                <Input type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} data-testid="input-delegation-end" />
              </div>
            </div>
            <div>
              <Label>النطاق</Label>
              <Select value={form.scope} onValueChange={(v) => setForm({ ...form, scope: v })}>
                <SelectTrigger data-testid="select-delegation-scope">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all_cases">جميع القضايا</SelectItem>
                  <SelectItem value="specific_cases">قضايا محددة</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>تفاصيل إضافية</Label>
              <Textarea
                value={form.reasonDetails}
                onChange={(e) => setForm({ ...form, reasonDetails: e.target.value })}
                placeholder="تفاصيل إضافية عن التفويض..."
                data-testid="input-delegation-details"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>إلغاء</Button>
            <Button
              onClick={() => createMutation.mutate()}
              disabled={!form.toUserId || !form.startDate || !form.endDate || createMutation.isPending}
              data-testid="button-submit-delegation"
            >
              إرسال الطلب
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
