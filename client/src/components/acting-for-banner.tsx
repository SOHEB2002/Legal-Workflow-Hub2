import { useQuery } from "@tanstack/react-query";
import { Info } from "lucide-react";
import { useAuth } from "@/lib/auth-context";

interface ActingDelegator {
  userId: string;
  name: string;
}

interface ActingAsResponse {
  delegators: ActingDelegator[];
}

// 4d — "acting on behalf of" banner. Reads /api/delegations/acting-as (the
// server-resolved set of active+approved+in-window delegations where the
// current user is the delegate). Renders ONLY when that set is non-empty — a
// user with no active delegation gets { delegators: [] } → null → byte-identical
// UI. Display-only; it surfaces inherited authority the server already grants
// per request, it does not confer anything.
export function ActingForBanner() {
  const { user } = useAuth();
  const { data } = useQuery<ActingAsResponse>({
    queryKey: ["/api/delegations/acting-as"],
    enabled: !!user,
  });

  const delegators = data?.delegators ?? [];
  if (delegators.length === 0) return null;

  const names = delegators.map((d) => d.name).join("، ");

  return (
    <div
      dir="rtl"
      data-testid="banner-acting-for"
      className="flex items-center gap-2 border-b border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
    >
      <Info className="h-4 w-4 shrink-0" />
      <span>
        أنت تعمل بالنيابة عن <span className="font-semibold">{names}</span>
      </span>
    </div>
  );
}

// 4d — reusable badge that tags a unified-task item surfaced to the current
// user because they act on behalf of a delegator (MyTaskItem.onBehalfOfUserId).
// Resolves the delegator's display name from the loaded user list (same source
// the app uses for other owner-name displays). Renders null when there is no
// on-behalf owner, so a non-delegated user's feed stays byte-identical. Ready
// for the unified-tasks page (not built yet) to drop in next to each task row.
export function OnBehalfBadge({ userId }: { userId: string | null | undefined }) {
  const { users } = useAuth();
  if (!userId) return null;
  const name = users.find((u) => u.id === userId)?.name ?? userId;
  return (
    <span
      dir="rtl"
      data-testid="badge-on-behalf"
      className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900/50 dark:text-amber-200"
    >
      بالنيابة عن {name}
    </span>
  );
}
