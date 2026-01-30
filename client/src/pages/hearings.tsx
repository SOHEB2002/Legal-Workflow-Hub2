import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Plus, Calendar, Clock, MapPin, AlertCircle, CheckCircle, XCircle } from "lucide-react";
import { useHearings } from "@/lib/hearings-context";
import { useCases } from "@/lib/cases-context";
import { useClients } from "@/lib/clients-context";
import { useAuth } from "@/lib/auth-context";
import type { Hearing, HearingStatusValue, HearingResultValue, CourtTypeValue } from "@shared/schema";
import { HearingStatus, HearingResult, CourtType } from "@shared/schema";
import { format, differenceInDays, isToday, isTomorrow } from "date-fns";
import { ar } from "date-fns/locale";

function getUrgencyColor(hearingDate: string) {
  const days = differenceInDays(new Date(hearingDate), new Date());
  if (days < 0) return "bg-muted text-muted-foreground";
  if (days === 0) return "bg-destructive text-destructive-foreground";
  if (days <= 3) return "bg-orange-500 text-white";
  if (days <= 7) return "bg-yellow-500 text-white";
  return "bg-accent text-accent-foreground";
}

function getStatusColor(status: HearingStatusValue) {
  switch (status) {
    case HearingStatus.UPCOMING:
      return "bg-primary/20 text-primary border-primary/30";
    case HearingStatus.COMPLETED:
      return "bg-accent/30 text-accent border-accent/40";
    case HearingStatus.POSTPONED:
      return "bg-orange-500/20 text-orange-600 border-orange-500/30";
    case HearingStatus.CANCELLED:
      return "bg-destructive/20 text-destructive border-destructive/30";
    default:
      return "bg-muted text-muted-foreground";
  }
}

const statusLabels: Record<HearingStatusValue, string> = {
  "قادمة": "قادمة",
  "تمت": "تمت",
  "مؤجلة": "مؤجلة",
  "ملغية": "ملغية",
};

const resultLabels: Record<HearingResultValue, string> = {
  "تأجيل": "تأجيل",
  "حكم": "حكم",
  "صلح": "صلح",
  "شطب": "شطب",
  "أخرى": "أخرى",
};

export default function HearingsPage() {
  const { hearings, addHearing, updateHearing, markCompleted, markPostponed, markCancelled, getUpcomingHearings } = useHearings();
  const { cases, getCaseById } = useCases();
  const { getClientName } = useClients();
  const { user, permissions } = useAuth();

  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [selectedHearing, setSelectedHearing] = useState<Hearing | null>(null);
  const [resultDialog, setResultDialog] = useState<Hearing | null>(null);
  const [resultData, setResultData] = useState({ result: "" as HearingResultValue, details: "" });

  const [formData, setFormData] = useState({
    caseId: "",
    hearingDate: "",
    hearingTime: "",
    courtName: "المحكمة العامة" as CourtTypeValue,
    courtRoom: "",
    notes: "",
  });

  const resetForm = () => {
    setFormData({
      caseId: "",
      hearingDate: "",
      hearingTime: "",
      courtName: "المحكمة العامة",
      courtRoom: "",
      notes: "",
    });
  };

  const handleAddHearing = () => {
    if (!formData.caseId || !formData.hearingDate || !formData.hearingTime) return;
    addHearing(formData);
    setIsAddDialogOpen(false);
    resetForm();
  };

  const handleMarkCompleted = () => {
    if (!resultDialog || !resultData.result) return;
    markCompleted(resultDialog.id, resultData.result, resultData.details);
    setResultDialog(null);
    setResultData({ result: "" as HearingResultValue, details: "" });
  };

  const upcomingHearings = getUpcomingHearings();
  const todayHearings = hearings.filter(
    (h) => h.status === HearingStatus.UPCOMING && isToday(new Date(h.hearingDate))
  );

  const getCaseInfo = (caseId: string) => {
    const caseData = getCaseById(caseId);
    if (!caseData) return { number: "غير معروف", client: "غير معروف" };
    return {
      number: caseData.caseNumber,
      client: getClientName(caseData.clientId),
    };
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">إدارة الجلسات</h1>
          <p className="text-muted-foreground">جدول الجلسات والمواعيد</p>
        </div>
        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-add-hearing" onClick={resetForm}>
              <Plus className="w-4 h-4 ml-2" />
              إضافة جلسة
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>إضافة جلسة جديدة</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>القضية</Label>
                <Select
                  value={formData.caseId}
                  onValueChange={(value) => setFormData({ ...formData, caseId: value })}
                >
                  <SelectTrigger data-testid="select-case">
                    <SelectValue placeholder="اختر القضية" />
                  </SelectTrigger>
                  <SelectContent>
                    {cases
                      .filter((c) => c.status !== "مغلق")
                      .map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.caseNumber} - {getClientName(c.clientId)}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>التاريخ</Label>
                  <Input
                    data-testid="input-hearing-date"
                    type="date"
                    value={formData.hearingDate}
                    onChange={(e) => setFormData({ ...formData, hearingDate: e.target.value })}
                  />
                </div>
                <div>
                  <Label>الوقت</Label>
                  <Input
                    data-testid="input-hearing-time"
                    type="time"
                    value={formData.hearingTime}
                    onChange={(e) => setFormData({ ...formData, hearingTime: e.target.value })}
                  />
                </div>
              </div>
              <div>
                <Label>المحكمة</Label>
                <Select
                  value={formData.courtName}
                  onValueChange={(value: CourtTypeValue) =>
                    setFormData({ ...formData, courtName: value })
                  }
                >
                  <SelectTrigger data-testid="select-court">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.values(CourtType).map((court) => (
                      <SelectItem key={court} value={court}>
                        {court}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>رقم الدائرة</Label>
                <Input
                  data-testid="input-court-room"
                  value={formData.courtRoom}
                  onChange={(e) => setFormData({ ...formData, courtRoom: e.target.value })}
                  placeholder="مثال: الدائرة 5"
                />
              </div>
              <div>
                <Label>ملاحظات</Label>
                <Textarea
                  data-testid="input-notes"
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="ملاحظات إضافية..."
                />
              </div>
            </div>
            <Button
              data-testid="button-submit-hearing"
              onClick={handleAddHearing}
              className="w-full"
              disabled={!formData.caseId || !formData.hearingDate || !formData.hearingTime}
            >
              إضافة الجلسة
            </Button>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">جلسات اليوم</CardTitle>
            <AlertCircle className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{todayHearings.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">الجلسات القادمة</CardTitle>
            <Calendar className="h-4 w-4 text-accent" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{upcomingHearings.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">إجمالي الجلسات</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{hearings.length}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>جدول الجلسات</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-right">التاريخ والوقت</TableHead>
                <TableHead className="text-right">القضية</TableHead>
                <TableHead className="text-right">المحكمة</TableHead>
                <TableHead className="text-right">الدائرة</TableHead>
                <TableHead className="text-right">الحالة</TableHead>
                <TableHead className="text-right">الإجراءات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {hearings
                .sort((a, b) => new Date(a.hearingDate).getTime() - new Date(b.hearingDate).getTime())
                .map((hearing) => {
                  const caseInfo = getCaseInfo(hearing.caseId);
                  return (
                    <TableRow key={hearing.id} data-testid={`row-hearing-${hearing.id}`}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Badge className={getUrgencyColor(hearing.hearingDate)}>
                            {format(new Date(hearing.hearingDate), "dd MMM yyyy", { locale: ar })}
                          </Badge>
                          <span className="text-muted-foreground">{hearing.hearingTime}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium">{caseInfo.number}</p>
                          <p className="text-sm text-muted-foreground">{caseInfo.client}</p>
                        </div>
                      </TableCell>
                      <TableCell>{hearing.courtName}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <MapPin className="w-3 h-3" />
                          {hearing.courtRoom || "-"}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge className={getStatusColor(hearing.status)}>
                          {statusLabels[hearing.status]}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {hearing.status === HearingStatus.UPCOMING && (
                          <div className="flex items-center gap-1">
                            <Button
                              size="icon"
                              variant="ghost"
                              data-testid={`button-complete-${hearing.id}`}
                              onClick={() => setResultDialog(hearing)}
                            >
                              <CheckCircle className="w-4 h-4 text-green-600" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              data-testid={`button-cancel-${hearing.id}`}
                              onClick={() => markCancelled(hearing.id)}
                            >
                              <XCircle className="w-4 h-4 text-destructive" />
                            </Button>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={!!resultDialog} onOpenChange={(open) => !open && setResultDialog(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>نتيجة الجلسة</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>النتيجة</Label>
              <Select
                value={resultData.result}
                onValueChange={(value: HearingResultValue) =>
                  setResultData({ ...resultData, result: value })
                }
              >
                <SelectTrigger data-testid="select-result">
                  <SelectValue placeholder="اختر النتيجة" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(resultLabels).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>التفاصيل</Label>
              <Textarea
                data-testid="input-result-details"
                value={resultData.details}
                onChange={(e) => setResultData({ ...resultData, details: e.target.value })}
                placeholder="تفاصيل إضافية عن النتيجة..."
              />
            </div>
          </div>
          <Button
            data-testid="button-submit-result"
            onClick={handleMarkCompleted}
            className="w-full"
            disabled={!resultData.result}
          >
            حفظ النتيجة
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
