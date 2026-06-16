import { useQuery } from "@tanstack/react-query";
import type { FieldTask } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";

// Case-scoped field tasks: ALL field tasks on a case (the complete picture),
// served by GET /api/field-tasks/case/:caseId and gated server-side by case
// access. Use this in case/hearing detail views — distinct from the per-user
// scoped general list (/api/field-tasks, useFieldTasks), which only returns the
// requester's own/created/dept tasks. Disabled when no caseId is open.
export function useCaseFieldTasks(caseId: string | null | undefined) {
  return useQuery<FieldTask[]>({
    queryKey: ["/api/field-tasks/case", caseId],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/field-tasks/case/${caseId}`);
      return res.json();
    },
    enabled: !!caseId,
  });
}
