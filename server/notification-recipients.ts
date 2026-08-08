// Shared recipient fan-out for server-generated notifications.
//
// WHY THIS EXISTS. The same shape — "notify the person the work is assigned to,
// optionally that entity's department head, and never notify anyone twice" — is
// already open-coded in two places: checkLegalDeadlines' overdue tier and
// checkStruckOffExpiry's notifyIds array (both in server/scheduler.ts). The
// pause-expiry notice would have been the third copy, so it is written once
// here instead.
//
// ⚠ THE TWO EXISTING FRAGMENTS ARE DELIBERATELY NOT REFACTORED ONTO THIS
// HELPER in the commit that introduces it. Both are live notification paths
// with their own guards, and rewriting them is a behaviour risk that belongs in
// its own reviewed batch, not smuggled into a feature commit.
//
// 🔴 EVERY RETURNED ID IS A REAL, ACTIVE USER, AND THAT IS LOAD-BEARING — not
// politeness. On PRODUCTION `notifications.recipient_id` carries a foreign key
// to `users.id` (`notifications_recipient_id_fkey`, applied via
// script/apply-fk-constraints.sql). That declaration is COMMENTED in
// shared/schema.ts, which per the FK dev/prod sync rule means it exists on prod
// and NOT on dev. So an id naming no user — the literal "system", or a
// since-deleted account — inserts cleanly on dev and throws a foreign-key
// violation on prod. Filtering here is what stops that divergence from becoming
// a production-only crash that dev can never reproduce.

// Structural subset of shared/schema.ts's User. Declared as its own shape
// rather than importing User so callers can pass any roster-like row (the full
// User satisfies it, since role: UserRoleType is assignable to string).
export interface NotificationRecipientUser {
  id: string;
  role: string;
  departmentId: string | null;
  isActive: boolean;
}

/**
 * Resolve the final recipient list for one notification.
 *
 * @param candidates Ids to notify, in priority order — typically the assignee
 *   first, then anyone else with a stake (e.g. paused_by). Null, undefined and
 *   blank entries are dropped, so a caller never has to pre-filter; ids that do
 *   not name an ACTIVE user are dropped too (see the FK note above).
 * @param users The user roster, fetched once by the caller. An empty roster
 *   yields an empty result, which makes every send a no-op — the intended
 *   degradation when the roster could not be loaded.
 * @param options.departmentId When set, the active department_head(s) of that
 *   department are appended. Leave unset to notify only the named candidates.
 *
 * Order is preserved (Set insertion order), so the assignee stays first.
 */
export function resolveNotificationRecipients(
  candidates: (string | null | undefined)[],
  users: NotificationRecipientUser[],
  options?: { departmentId?: string | null },
): string[] {
  // Lookup set for the candidate filter. Deliberately a Set of ids rather than a
  // Map of rows: the project's TS target forbids iterating a Map's values
  // without --downlevelIteration, and the department-head scan below reads the
  // roster array directly anyway, so nothing needs the row objects keyed.
  const activeIds = new Set<string>();
  for (const u of users) {
    if (u.isActive) activeIds.add(u.id);
  }

  const resolved = new Set<string>();
  for (const candidate of candidates) {
    const id = String(candidate ?? "").trim();
    if (!id) continue;              // "" / null / undefined — never send to nobody
    if (!activeIds.has(id)) continue; // "system", deleted or deactivated accounts
    resolved.add(id);
  }

  // Department-head fan-out. Unused by the pause-expiry caller (the owner
  // scoped that notice to the assignee + the pauser); it exists because the
  // assignment-notification and reminder batches both need exactly this and
  // would otherwise each grow their own copy.
  const departmentId = options?.departmentId;
  if (departmentId) {
    for (const u of users) {
      if (!u.isActive) continue;
      // 🔴 !!u.departmentId is MANDATORY, per the standing rule: the bare
      // equality lets a user whose department is NULL match every entity whose
      // department is also NULL. This is the single most repeated permission
      // bug in this codebase.
      if (u.role === "department_head" && !!u.departmentId && u.departmentId === departmentId) {
        resolved.add(u.id);
      }
    }
  }

  return Array.from(resolved);
}
