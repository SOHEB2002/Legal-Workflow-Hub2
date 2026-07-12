import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/lib/auth-context";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { extractApiError } from "@/lib/utils";
import { ClipboardList } from "lucide-react";
import {
  AssignableAdminSupportTaskKind,
  AssignableAdminSupportTaskLabels,
  AssignableAdminSupportTaskClass,
  TaskSpecialtyLabels,
} from "@shared/schema";
import type {
  AdminSupportTaskAssignment,
  AssignableAdminSupportTaskKindValue,
} from "@shared/schema";

// Radix Select can't hold an empty-string value, so "unassigned" needs a
// sentinel; it maps to null (clear) on save.
const UNASSIGNED = "__unassigned__";

export default function AdminSupportTasksPage() {
  const { users, permissions } = useAuth();
  const { toast } = useToast();

  const { data: assignments = [] } = useQuery<AdminSupportTaskAssignment[]>({
    queryKey: ["/api/admin-support-task-assignments"],
    enabled: permissions.canManageUsers,
  });

  const setMutation = useMutation({
    mutationFn: async ({ taskType, assigneeUserId }: { taskType: string; assigneeUserId: string | null }) => {
      const res = await apiRequest("PUT", `/api/admin-support-task-assignments/${taskType}`, { assigneeUserId });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin-support-task-assignments"] });
      toast({ title: "تم حفظ الإسناد" });
    },
    onError: (e: unknown) => {
      toast({ title: "تعذّر حفظ الإسناد", description: extractApiError(e), variant: "destructive" });
    },
  });

  // Server also enforces this (403); the client guard just avoids rendering the
  // config to non-managers.
  if (!permissions.canManageUsers) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            ليس لديك صلاحية للوصول إلى هذه الصفحة
          </CardContent>
        </Card>
      </div>
    );
  }

  const activeAdminSupport = users.filter((u) => u.role === "admin_support" && u.isActive);
  const assigneeOf = (taskType: string) =>
    assignments.find((a) => a.taskType === taskType)?.assigneeUserId ?? null;

  const taskTypes = Object.values(AssignableAdminSupportTaskKind) as AssignableAdminSupportTaskKindValue[];

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <ClipboardList className="h-6 w-6" /> إسناد مهام الدعم الإداري
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          حدّد الموظف المسؤول عن كل نوع من مهام الدعم الإداري. المهام غير المُسندة تظهر في مجموعة "غير مُسندة" لدى المدير.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>أنواع المهام</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {taskTypes.map((taskType) => {
            const current = assigneeOf(taskType);
            const currentUser = current ? users.find((u) => u.id === current) : null;
            // A saved assignee who is now inactive (or was deleted) is still shown
            // — selected, with a hint — so the manager knows to reassign.
            const showStaleItem = !!current && (!currentUser || !currentUser.isActive);
            const value = current ?? UNASSIGNED;
            return (
              <div
                key={taskType}
                className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 border-b pb-4 last:border-b-0 last:pb-0"
              >
                <div className="sm:w-64">
                  <Label className="font-semibold">{AssignableAdminSupportTaskLabels[taskType]}</Label>
                  {/* Specialty hint only where a class exists; the four
                      data-completion rows are grouped by their shared label
                      prefix, and contract has no two-class specialty. */}
                  {(() => {
                    const cls = AssignableAdminSupportTaskClass[taskType];
                    return cls ? (
                      <div className="text-xs text-muted-foreground">
                        التخصص: {TaskSpecialtyLabels[cls]}
                      </div>
                    ) : null;
                  })()}
                </div>
                <div className="flex-1 max-w-sm">
                  <Select
                    value={value}
                    onValueChange={(v) =>
                      setMutation.mutate({ taskType, assigneeUserId: v === UNASSIGNED ? null : v })
                    }
                  >
                    <SelectTrigger data-testid={`select-assignee-${taskType}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={UNASSIGNED}>غير محدد</SelectItem>
                      {showStaleItem && current && (
                        <SelectItem value={current}>
                          {currentUser ? `${currentUser.name} (غير نشط)` : "مستخدم غير معروف"}
                        </SelectItem>
                      )}
                      {activeAdminSupport.map((u) => (
                        <SelectItem key={u.id} value={u.id}>
                          {u.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
