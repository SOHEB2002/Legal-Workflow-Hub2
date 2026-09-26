import { useRef } from "react";
import { useDepartments } from "@/lib/departments-context";
import { useAuth } from "@/lib/auth-context";
import { CaseWorkflowLabels, NO_CASE_DEPARTMENT, eligibleCaseAssignee, workflowForDepartmentName, suggestedCaseWorkflow } from "@shared/schema";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export type CaseOwnershipForm = { departmentId: string; primaryLawyerId: string; caseWorkflow: string };
export function CaseOwnershipFields({ value, onChange, suggestWorkflow = false, allowedDepartmentId }: {
  value: CaseOwnershipForm;
  onChange: (value: CaseOwnershipForm) => void;
  suggestWorkflow?: boolean;
  allowedDepartmentId?: string;
}) {
  const { departments } = useDepartments();
  const { users } = useAuth();
  const manuallyChosen = useRef(!suggestWorkflow && !!value.caseWorkflow);
  return <div className="grid gap-4" dir="rtl">
    <div><Label>القسم التنظيمي *</Label>
      <Select value={value.departmentId} onValueChange={departmentId => {
        const name = departments.find(d => d.id === departmentId)?.name;
        const caseWorkflow = suggestWorkflow && !manuallyChosen.current
          ? suggestedCaseWorkflow(value.caseWorkflow, false, name) : value.caseWorkflow;
        onChange({ ...value, departmentId, caseWorkflow });
      }}><SelectTrigger><SelectValue placeholder="اختر القسم التنظيمي" /></SelectTrigger><SelectContent>
        {departments.filter(d => workflowForDepartmentName(d.name) && (!allowedDepartmentId || d.id === allowedDepartmentId)).map(d => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
        <SelectItem value={NO_CASE_DEPARTMENT}>بدون قسم</SelectItem>
      </SelectContent></Select>
    </div>
    <div><Label>المسؤول عن القضية{value.departmentId === NO_CASE_DEPARTMENT ? " *" : " (اختياري)"}</Label>
      <Select value={value.primaryLawyerId || "__none__"} onValueChange={id => onChange({ ...value, primaryLawyerId: id === "__none__" ? "" : id })}>
        <SelectTrigger><SelectValue placeholder="اختر المسؤول" /></SelectTrigger><SelectContent>
          <SelectItem value="__none__">بدون مسؤول</SelectItem>
          {users.filter(eligibleCaseAssignee).map(u => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
        </SelectContent></Select>
    </div>
    <div><Label>مسار القضية *</Label>
      <Select value={value.caseWorkflow} onValueChange={caseWorkflow => { manuallyChosen.current = true; onChange({ ...value, caseWorkflow }); }}>
        <SelectTrigger><SelectValue placeholder="اختر مسار القضية" /></SelectTrigger><SelectContent>
          {Object.entries(CaseWorkflowLabels).map(([key, label]) => <SelectItem key={key} value={key}>{label}</SelectItem>)}
        </SelectContent></Select>
      {!suggestWorkflow && <p className="text-sm text-muted-foreground">للقضية القديمة يُقترح المسار من قسمها الحالي ويُحفظ عند الحفظ. يمكنك تغييره. إذا لم يظهر مسار افتراضي، يجب اختياره.</p>}
    </div>
  </div>;
}
