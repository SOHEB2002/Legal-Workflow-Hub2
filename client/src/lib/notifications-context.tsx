import { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import type {
  Notification,
  NotificationTemplate,
  UserNotificationPreferences,
  NotificationTypeValue,
  NotificationPriorityValue,
  NotificationStatusValue,
  ResponseTypeValue,
  NotificationRule,
} from "@shared/schema";
import { NotificationType, NotificationPriority, NotificationStatus, DigestMode } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "./auth-context";
import { useWebSocket, type WSEvent } from "./useWebSocket";

// ⚠ VERSIONED KEY. getStoredTemplates returns the stored copy whenever the key
// exists, and a useEffect writes the templates to localStorage on first mount —
// so every existing user already has a byte-for-byte snapshot of the OLD
// tokenised defaults persisted, and editing defaultTemplates alone would never
// reach them. Bumping the key is what makes the new defaults take effect.
//
// Discarding the stored copy costs nothing here: addTemplate / updateTemplate /
// deleteTemplate have ZERO consumers — there is no UI anywhere to create, edit
// or delete a template — so the stored value can only ever be a copy of the
// shipped defaults. Nobody has customised anything. If a template editor is
// ever built, this key must be bumped with a real merge instead.
const TEMPLATES_STORAGE_KEY = "lawfirm_notification_templates_v2";
const PREFERENCES_STORAGE_KEY = "lawfirm_notification_preferences";
const RULES_STORAGE_KEY = "lawfirm_notification_rules";

// One page of the notification list.
//
// 30, not the app's DEFAULT_PAGE_SIZE of 15: this list is a chronological feed
// scrolled in one column, not a seven-column table, and 15 would put the
// heaviest recipient (branch_manager, ~7-10/week) behind "load more" every
// fortnight. 30 covers roughly a month for them and the entire history for a
// typical lawyer, so most users never see the control at all — while still
// bounding a fetch that previously returned the user's whole life.
const NOTIFICATIONS_PAGE_SIZE = 30;

// The two SERVER-SIDE tab filters. Only these two moved server-side; the type
// and priority filters stay client-side by decision.
export interface NotificationTabFilter {
  unread?: boolean;
  requiresResponse?: boolean;
}

const isTabFilterActive = (f: NotificationTabFilter): boolean =>
  !!(f.unread || f.requiresResponse);

const tabFilterQuery = (f: NotificationTabFilter): string =>
  `${f.unread ? "&unread=true" : ""}${f.requiresResponse ? "&requiresResponse=true" : ""}`;

// Does a single notification satisfy the active tab filter?
//
// Used ONLY to decide whether a WebSocket-pushed row may be prepended into a
// filtered view. It is a deliberate second implementation of the server's two
// predicates — acceptable precisely because there are two of them and each is
// one comparison; the pair is trivially checkable against the SQL in
// getNotificationsByRecipient. If the type/priority filters ever move
// server-side, this shortcut stops being reasonable and the prepend should
// switch to "don't prepend while filtered, let the poll reconcile".
const matchesTabFilter = (n: Notification, f: NotificationTabFilter): boolean => {
  if (f.unread && n.isRead) return false;
  if (f.requiresResponse && !(n.requiresResponse && !n.response)) return false;
  return true;
};

export interface WorkflowNotificationEvent {
  type: NotificationTypeValue;
  entityType: "case" | "consultation";
  entityId: string;
  entityName?: string;
  stage?: string;
  previousStage?: string;
  assignedTo?: string;
  returnCount?: number;
  returnReason?: string;
  slaPercentage?: number;
  timeRemaining?: string;
  overdueTime?: string;
  employeeId?: string;
  employeeName?: string;
  count?: number;
  additionalData?: Record<string, unknown>;
}

const defaultNotificationRules: NotificationRule[] = [
  {
    id: "rule_1",
    name: "إشعار تعيين قضية",
    triggerEvent: NotificationType.CASE_ASSIGNED,
    conditions: {},
    recipients: { assignedEmployee: true, departmentHead: false, branchManager: false, reviewCommittee: false, customUserIds: [] },
    notificationPriority: NotificationPriority.MEDIUM,
    template: { title: "تم تعيين قضية جديدة", message: "تم تعيينك على القضية: {entityName}" },
    isActive: true,
    autoEscalate: false,
    escalateAfterHours: 24,
  },
  {
    id: "rule_2",
    name: "إشعار تعيين استشارة",
    triggerEvent: NotificationType.CONSULTATION_ASSIGNED,
    conditions: {},
    recipients: { assignedEmployee: true, departmentHead: false, branchManager: false, reviewCommittee: false, customUserIds: [] },
    notificationPriority: NotificationPriority.MEDIUM,
    template: { title: "تم تعيين استشارة جديدة", message: "تم تعيينك على الاستشارة: {entityName}" },
    isActive: true,
    autoEscalate: false,
    escalateAfterHours: 24,
  },
  {
    id: "rule_3",
    name: "تحذير SLA",
    triggerEvent: NotificationType.SLA_WARNING,
    conditions: { slaPercentage: 80 },
    recipients: { assignedEmployee: true, departmentHead: true, branchManager: false, reviewCommittee: false, customUserIds: [] },
    notificationPriority: NotificationPriority.HIGH,
    template: { title: "تحذير: اقتراب الموعد", message: "متبقي {timeRemaining} على انتهاء مدة المرحلة للقضية: {entityName}" },
    isActive: true,
    autoEscalate: true,
    escalateAfterHours: 4,
  },
  {
    id: "rule_4",
    name: "تأخر SLA",
    triggerEvent: NotificationType.SLA_OVERDUE,
    conditions: {},
    recipients: { assignedEmployee: true, departmentHead: true, branchManager: true, reviewCommittee: false, customUserIds: [] },
    notificationPriority: NotificationPriority.URGENT,
    template: { title: "تأخر عن الموعد النهائي", message: "تأخرت القضية {entityName} عن الموعد بـ {overdueTime}" },
    isActive: true,
    autoEscalate: true,
    escalateAfterHours: 2,
  },
  {
    id: "rule_5",
    name: "إرجاع للتعديل",
    triggerEvent: NotificationType.RETURNED_FOR_REVISION,
    conditions: {},
    recipients: { assignedEmployee: true, departmentHead: false, branchManager: false, reviewCommittee: false, customUserIds: [] },
    notificationPriority: NotificationPriority.HIGH,
    template: { title: "تم إرجاع العمل للتعديل", message: "تم إرجاع {entityType}: {entityName}. السبب: {returnReason}" },
    isActive: true,
    autoEscalate: false,
    escalateAfterHours: 24,
  },
  {
    id: "rule_6",
    name: "إرجاع ثالث - تحذير",
    triggerEvent: NotificationType.THIRD_RETURN_WARNING,
    conditions: { returnCountMin: 3 },
    recipients: { assignedEmployee: true, departmentHead: true, branchManager: true, reviewCommittee: false, customUserIds: [] },
    notificationPriority: NotificationPriority.URGENT,
    template: { title: "إرجاع للمرة الثالثة - تحذير", message: "تم إرجاع {entityName} للمرة الثالثة. يرجى المراجعة." },
    isActive: true,
    autoEscalate: true,
    escalateAfterHours: 1,
  },
  {
    id: "rule_7",
    name: "حمل عمل مرتفع",
    triggerEvent: NotificationType.WORKLOAD_HIGH,
    conditions: {},
    recipients: { assignedEmployee: false, departmentHead: true, branchManager: false, reviewCommittee: false, customUserIds: [] },
    notificationPriority: NotificationPriority.MEDIUM,
    template: { title: "حمل عمل مرتفع", message: "الموظف {employeeName} لديه {count} قضية نشطة" },
    isActive: true,
    autoEscalate: false,
    escalateAfterHours: 24,
  },
  {
    id: "rule_8",
    name: "حمل عمل حرج",
    triggerEvent: NotificationType.WORKLOAD_CRITICAL,
    conditions: {},
    recipients: { assignedEmployee: false, departmentHead: true, branchManager: true, reviewCommittee: false, customUserIds: [] },
    notificationPriority: NotificationPriority.URGENT,
    template: { title: "حمل عمل حرج - يتطلب تدخل فوري", message: "الموظف {employeeName} لديه {count} قضية نشطة - يجب إعادة التوزيع" },
    isActive: true,
    autoEscalate: true,
    escalateAfterHours: 2,
  },
  {
    id: "rule_9",
    name: "تغيير المرحلة",
    triggerEvent: NotificationType.STAGE_CHANGED,
    conditions: {},
    recipients: { assignedEmployee: true, departmentHead: false, branchManager: false, reviewCommittee: false, customUserIds: [] },
    notificationPriority: NotificationPriority.LOW,
    template: { title: "تغيرت المرحلة", message: "تم نقل {entityName} إلى مرحلة: {stage}" },
    isActive: true,
    autoEscalate: false,
    escalateAfterHours: 24,
  },
  {
    id: "rule_10",
    name: "إرسال للمراجعة",
    triggerEvent: NotificationType.SENT_TO_REVIEW,
    conditions: {},
    recipients: { assignedEmployee: false, departmentHead: false, branchManager: false, reviewCommittee: true, customUserIds: [] },
    notificationPriority: NotificationPriority.MEDIUM,
    template: { title: "تم استلام عمل للمراجعة", message: "تم استلام {entityType}: {entityName} للمراجعة" },
    isActive: true,
    autoEscalate: false,
    escalateAfterHours: 24,
  },
  {
    id: "rule_11",
    name: "تكليف مهمة ميدانية",
    triggerEvent: NotificationType.FIELD_TASK_ASSIGNED,
    conditions: {},
    recipients: { assignedEmployee: true, departmentHead: false, branchManager: false, reviewCommittee: false, customUserIds: [] },
    notificationPriority: NotificationPriority.HIGH,
    template: { title: "مهمة ميدانية جديدة", message: "تم تكليفك بمهمة ميدانية جديدة: {entityName}" },
    isActive: true,
    autoEscalate: false,
    escalateAfterHours: 24,
  },
];

interface NotificationFilters {
  type?: NotificationTypeValue;
  priority?: NotificationPriorityValue;
  status?: NotificationStatusValue;
  senderId?: string;
  dateFrom?: string;
  dateTo?: string;
  isRead?: boolean;
  requiresResponse?: boolean;
}

interface NotificationsContextType {
  notifications: Notification[];
  templates: NotificationTemplate[];
  preferences: Record<string, UserNotificationPreferences>;
  rules: NotificationRule[];
  isLoading: boolean;
  refetchNotifications: () => Promise<void>;
  /** The two server-side tab filters. Setting one resets paging to one page. */
  tabFilter: NotificationTabFilter;
  setTabFilter: (next: NotificationTabFilter) => Promise<void>;
  /** Newest rows for the bell — never filtered by the page's active tab. */
  getBellNotifications: (userId: string) => Notification[];
  /** True when a full page came back, i.e. there are probably older rows. */
  hasMoreNotifications: boolean;
  isLoadingMore: boolean;
  loadMoreNotifications: () => Promise<void>;
  sendNotification: (notification: Omit<Notification, "id" | "createdAt" | "updatedAt" | "isRead" | "readAt" | "response" | "status" | "escalationLevel" | "escalatedTo" | "requiresResponse" | "scheduledAt" | "autoEscalateAfterHours">) => Promise<Notification>;
  sendBulkNotification: (recipientIds: string[], notification: Omit<Notification, "id" | "createdAt" | "updatedAt" | "isRead" | "readAt" | "response" | "status" | "escalationLevel" | "escalatedTo" | "requiresResponse" | "scheduledAt" | "autoEscalateAfterHours" | "recipientId">) => Promise<Notification[]>;
  scheduleNotification: (notification: Omit<Notification, "id" | "createdAt" | "updatedAt" | "isRead" | "readAt" | "response" | "escalationLevel" | "escalatedTo">, scheduledAt: string) => Promise<Notification>;
  sendToTeam: (departmentId: string, userIds: string[], notification: Omit<Notification, "id" | "createdAt" | "updatedAt" | "isRead" | "readAt" | "response" | "status" | "escalationLevel" | "escalatedTo" | "requiresResponse" | "scheduledAt" | "autoEscalateAfterHours" | "recipientId">) => Promise<Notification[]>;
  markAsRead: (id: string) => Promise<void>;
  markAllAsRead: (userId: string) => Promise<void>;
  deleteNotification: (id: string) => Promise<void>;
  getUnreadCount: (userId: string) => number;
  getMyNotifications: (userId: string, filters?: NotificationFilters) => Notification[];
  respondToNotification: (id: string, responseType: ResponseTypeValue | string, message: string) => Promise<void>;
  getNotificationResponses: (senderId: string) => Notification[];
  getUserPreferences: (userId: string) => UserNotificationPreferences;
  updateUserPreferences: (userId: string, prefs: Partial<UserNotificationPreferences>) => void;
  getTemplates: () => NotificationTemplate[];
  addTemplate: (template: Omit<NotificationTemplate, "id">) => NotificationTemplate;
  updateTemplate: (id: string, template: Partial<NotificationTemplate>) => void;
  deleteTemplate: (id: string) => void;
  getUrgentCount: (userId: string) => number;
  hasNewNotifications: boolean;
  setHasNewNotifications: (value: boolean) => void;
  triggerWorkflowNotification: (event: WorkflowNotificationEvent, recipientIds: string[]) => void;
  getNotificationRules: () => NotificationRule[];
  updateNotificationRule: (id: string, rule: Partial<NotificationRule>) => void;
  toggleRuleActive: (id: string) => void;
  addNotificationRule: (rule: Omit<NotificationRule, "id">) => NotificationRule;
  deleteNotificationRule: (id: string) => void;
  getWorkflowNotifications: (entityId: string) => Notification[];
  getNotificationStats: () => { total: number; unread: number; urgent: number; byType: Record<string, number> };
}

const NotificationsContext = createContext<NotificationsContextType | undefined>(undefined);

// Starter messages for the قالب جاهز picker in the send dialog.
//
// ⚠ NO PLACEHOLDER TOKENS. These used to embed {caseName}, {deadline} and
// {consultationNumber}, and NOTHING ever substituted them: handleTemplateSelect
// copies template.message verbatim into the textarea, so the recipient received
// the literal "{deadline}". (The only substitution machinery in the codebase,
// in triggerWorkflowNotification, works on RULES, uses an entirely different
// token set — {entityName}, {stage}, … — and has zero callers.)
//
// Each message is now a complete sentence that stands on its own. The sender
// adds the specifics in the editable textarea, which is what they were doing
// anyway when they noticed the token.
const defaultTemplates: NotificationTemplate[] = [
  {
    id: "1",
    name: "تنبيه تأخر",
    title: "تنبيه تأخر في الإنجاز",
    message: "يُرجى الإسراع في إنجاز العمل المطلوب وتحديث الحالة في أقرب وقت.",
    type: NotificationType.CASE_DELAY,
    priority: NotificationPriority.HIGH,
  },
  {
    id: "2",
    name: "تذكير موعد جلسة",
    title: "تذكير بموعد الجلسة",
    message: "نذكّركم بموعد الجلسة القادمة، يُرجى الاستعداد وتجهيز المستندات اللازمة.",
    type: NotificationType.DEADLINE_WARNING,
    priority: NotificationPriority.URGENT,
  },
  {
    id: "3",
    name: "مطلوب تحديث حالة",
    title: "مطلوب تحديث حالة القضية",
    message: "يُرجى تحديث حالة القضية وإفادتنا بآخر المستجدات.",
    type: NotificationType.RESPONSE_REQUEST,
    priority: NotificationPriority.MEDIUM,
  },
  {
    id: "4",
    name: "مراجعة عاجلة",
    title: "مراجعة مستند عاجلة",
    message: "مطلوب مراجعة المستند بشكل عاجل قبل الموعد المحدد.",
    type: NotificationType.DEADLINE_WARNING,
    priority: NotificationPriority.URGENT,
  },
  {
    id: "5",
    name: "إسناد مهمة جديدة",
    title: "تم إسناد مهمة جديدة",
    message: "تم إسناد مهمة جديدة إليك، يُرجى الاطلاع عليها والبدء بتنفيذها.",
    type: NotificationType.ASSIGNMENT,
    priority: NotificationPriority.MEDIUM,
  },
];

function getStoredTemplates(): NotificationTemplate[] {
  const stored = localStorage.getItem(TEMPLATES_STORAGE_KEY);
  return stored ? JSON.parse(stored) : defaultTemplates;
}

function getStoredPreferences(): Record<string, UserNotificationPreferences> {
  const stored = localStorage.getItem(PREFERENCES_STORAGE_KEY);
  return stored ? JSON.parse(stored) : {};
}

function getStoredRules(): NotificationRule[] {
  const stored = localStorage.getItem(RULES_STORAGE_KEY);
  return stored ? JSON.parse(stored) : defaultNotificationRules;
}

const defaultPreferences: UserNotificationPreferences = {
  userId: "",
  enableSound: true,
  enableDesktop: true,
  digestMode: DigestMode.INSTANT,
  mutedTypes: [],
  quietHoursStart: null,
  quietHoursEnd: null,
  notifyOnAssignment: true,
  notifyOnStageChange: true,
  notifyOnReviewNotes: true,
  notifyOnReturn: true,
  notifyOnSlaWarning: true,
};

export function NotificationsProvider({ children }: { children: React.ReactNode }) {
  const { user, users } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [templates, setTemplates] = useState<NotificationTemplate[]>(() => getStoredTemplates());
  const [preferences, setPreferences] = useState<Record<string, UserNotificationPreferences>>(() => getStoredPreferences());
  const [rules, setRules] = useState<NotificationRule[]>(() => getStoredRules());
  const [hasNewNotifications, setHasNewNotifications] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const prevCountRef = useRef<number>(0);
  // How many rows the user has chosen to have loaded. A REF, not state: the
  // poll reads it without needing to be re-created, and — importantly — it is
  // NOT derived from notifications.length, so a WebSocket prepend cannot inflate
  // the next poll's window.
  const loadedCountRef = useRef<number>(NOTIFICATIONS_PAGE_SIZE);
  const [hasMoreNotifications, setHasMoreNotifications] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [serverUnreadCount, setServerUnreadCount] = useState(0);

  // THE ACTIVE TAB FILTER, HELD IN A REF AS WELL AS STATE.
  //
  // ⚠ The ref is not a style choice, it is the fix for the one bug most likely
  // to be shipped here. The polling setInterval captures its callback ONCE; a
  // filter kept only in React state would be stale inside that closure and the
  // poll would silently re-fetch with whatever filter was active when the
  // interval was created — quietly repopulating the list with the wrong rows.
  // loadedCountRef already exists for exactly this reason. The state copy is
  // only so consumers can re-render off it.
  const tabFilterRef = useRef<NotificationTabFilter>({});
  const [tabFilter, setTabFilterState] = useState<NotificationTabFilter>({});
  // Newest few UNFILTERED rows, fetched only while a filter is active — see
  // getBellNotifications.
  const [unfilteredRecent, setUnfilteredRecent] = useState<Notification[]>([]);

  // The unread badge comes from SQL, never from the loaded array.
  //
  // getUnreadCount used to filter `notifications` client-side. With the list
  // capped that filter can only see the loaded window, so the badge would
  // silently undercount — and the badge is the one number a user is entitled
  // to trust. GET /api/notifications/unread-count is a COUNT(*) over ALL the
  // caller's rows, independent of paging.
  const fetchUnreadCount = useCallback(async () => {
    const authToken = localStorage.getItem("lawfirm_token");
    if (!authToken) { setServerUnreadCount(0); return; }
    try {
      const res = await apiRequest("GET", "/api/notifications/unread-count");
      const body = await res.json();
      if (typeof body?.count === "number") setServerUnreadCount(body.count);
    } catch {
      // Leave the previous value rather than flashing 0 on a transient failure.
    }
  }, []);

  const fetchNotifications = useCallback(async (countOverride?: number) => {
    const authToken = localStorage.getItem("lawfirm_token");
    if (!authToken) {
      setNotifications([]);
      setIsLoading(false);
      return;
    }
    try {
      // apiRequest carries the shared single-flight refresh + 401 retry. The
      // raw fetch here silently 401'd after a JWT rotation, freezing the badge
      // counter until the user navigated or reloaded.
      // ALWAYS anchored at the newest row (offset 0) and sized to how much the
      // user has chosen to load. Re-fetching the whole loaded WINDOW rather
      // than appending an offset page is what makes the poll safe:
      //   • it can never shrink the list back to one page (the poll asks for
      //     loadedCount, not PAGE_SIZE);
      //   • there is no cursor or running offset to drift, so a notification
      //     arriving between two polls cannot duplicate or skip a row — the
      //     next poll simply takes the newest N again;
      //   • a WebSocket-prepended row is reconciled by the next poll instead of
      //     corrupting a page boundary.
      // Cost is bounded by what the user asked for, not by their history.
      const count = countOverride ?? loadedCountRef.current;
      // Read the filter from the REF, never from a captured state value.
      const filter = tabFilterRef.current;
      const res = await apiRequest(
        "GET",
        `/api/notifications?limit=${count}&offset=0${tabFilterQuery(filter)}`,
      );
      const data = await res.json();
      const prevCount = prevCountRef.current;
      setNotifications(data);
      // A FULL page came back → there is probably more behind it. Short page →
      // we have reached the end. This is why the response needs no total.
      setHasMoreNotifications(data.length >= count);
      if (prevCount > 0 && data.length > prevCount) {
        setHasNewNotifications(true);
      }
      prevCountRef.current = data.length;
    } catch (err) {
      // fetch notifications failed silently
    } finally {
      setIsLoading(false);
    }
    // The unread BADGE must not depend on the loaded window — see
    // fetchUnreadCount.
    void fetchUnreadCount();

    // THE BELL MUST STAY UNFILTERED. It shows the newest few notifications
    // regardless of which tab the page is on, so while a filter is active the
    // main array can no longer serve it. One EXTRA request, and only then —
    // with no filter the main array is already unfiltered and the bell reads it
    // directly, so the common case adds no traffic at all. limit=5 matches what
    // the bell renders.
    if (isTabFilterActive(tabFilterRef.current)) {
      try {
        const bellRes = await apiRequest("GET", "/api/notifications?limit=5&offset=0");
        const bellData = await bellRes.json();
        if (Array.isArray(bellData)) setUnfilteredRecent(bellData);
      } catch {
        // Leave the previous bell rows rather than emptying the dropdown.
      }
    }
  }, [fetchUnreadCount]);

  const refetchNotifications = useCallback(async () => {
    await fetchNotifications();
  }, [fetchNotifications]);

  // Switch tab. RESETS PAGING to one page, which is not optional: a user three
  // pages deep in الكل who switches to a narrow tab would otherwise re-request
  // 90 MATCHING rows, which very likely do not exist — the page would render
  // short and "load more" would already be exhausted, making the tab look empty
  // of history it actually has.
  const setTabFilter = useCallback(async (next: NotificationTabFilter) => {
    tabFilterRef.current = next;      // ref FIRST — the fetch below reads it
    setTabFilterState(next);
    loadedCountRef.current = NOTIFICATIONS_PAGE_SIZE;
    if (!isTabFilterActive(next)) setUnfilteredRecent([]); // bell falls back to the main array
    await fetchNotifications(NOTIFICATIONS_PAGE_SIZE);
  }, [fetchNotifications]);

  // Grow the window by one page and re-read it.
  const loadMoreNotifications = useCallback(async () => {
    if (isLoadingMore) return;
    setIsLoadingMore(true);
    const next = loadedCountRef.current + NOTIFICATIONS_PAGE_SIZE;
    loadedCountRef.current = next;
    try {
      await fetchNotifications(next);
    } finally {
      setIsLoadingMore(false);
    }
  }, [fetchNotifications, isLoadingMore]);

  // WebSocket handler: real-time notification updates
  const handleWSEvent = useCallback((event: WSEvent) => {
    switch (event.type) {
      case "notification:new":
        if (event.payload) {
          setHasNewNotifications(true);
          // The badge is a server COUNT and must move immediately, whatever the
          // page is filtered to.
          void fetchUnreadCount();
          // PREPEND ONLY IF IT BELONGS IN THE CURRENT VIEW. A row that does not
          // match the active tab would otherwise appear and then vanish at the
          // next poll — a visible glitch. A row that DOES match is prepended as
          // before, so غير مقروءة stays instant (see matchesTabFilter).
          if (matchesTabFilter(event.payload, tabFilterRef.current)) {
            setNotifications((prev) => [event.payload, ...prev]);
            prevCountRef.current += 1;
          }
        }
        break;
      case "notification:updated":
        if (event.payload) {
          setNotifications((prev) =>
            prev.map((n) => (n.id === event.payload.id ? event.payload : n))
          );
        }
        break;
      case "notification:deleted":
        if (event.payload?.id) {
          setNotifications((prev) => prev.filter((n) => n.id !== event.payload.id));
        }
        break;
      case "notification:all-read":
        setNotifications((prev) =>
          prev.map((n) => ({ ...n, isRead: true, readAt: n.readAt || new Date().toISOString(), status: "read" as any }))
        );
        break;
      // 🔔 Pre-hearing ring — ACCELERATORS ONLY. Neither event carries ring
      // state; both just invalidate the query so HearingRing re-derives from
      // /api/hearings/ring-state immediately instead of waiting up to 30s.
      // Dropping either one changes ONLY the latency, never the outcome.
      // Handled here because this is the app's single useWebSocket consumer —
      // opening a second socket per tab to own these would double connections.
      case "hearing:ring":
      case "hearing:ring-stop":
      case "hearing:ring-ack":
        void queryClient.invalidateQueries({ queryKey: ["/api/hearings/ring-state"] });
        break;
      // 🔴 A DEFAULT ARM, added with the ring events. This switch previously had
      // none, so a server pushing a type the client did not know did NOTHING —
      // silently, with no way to notice during development. An unknown type is
      // now surfaced in the console rather than swallowed.
      case "connected":
        break;
      default:
        console.warn("[ws] unhandled event type:", (event as WSEvent).type);
        break;
    }
  }, []);

  // Connect WebSocket only when user is logged in
  const { isConnected } = useWebSocket(user ? handleWSEvent : () => {});

  useEffect(() => {
    prevCountRef.current = 0;
    if (user) {
      fetchNotifications();

      if (pollingRef.current) {
        clearInterval(pollingRef.current);
      }
      // With WebSocket active, polling is a fallback only — increase to 10 minutes
      pollingRef.current = setInterval(() => {
        fetchNotifications();
      }, isConnected ? 600000 : 300000);
    } else {
      setNotifications([]);
      setIsLoading(false);
    }

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [user, fetchNotifications, isConnected]);

  useEffect(() => {
    localStorage.setItem(TEMPLATES_STORAGE_KEY, JSON.stringify(templates));
  }, [templates]);

  useEffect(() => {
    localStorage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify(preferences));
  }, [preferences]);

  useEffect(() => {
    localStorage.setItem(RULES_STORAGE_KEY, JSON.stringify(rules));
  }, [rules]);

  const sendNotification = useCallback(async (
    notificationData: Omit<Notification, "id" | "createdAt" | "updatedAt" | "isRead" | "readAt" | "response" | "status" | "escalationLevel" | "escalatedTo" | "requiresResponse" | "scheduledAt" | "autoEscalateAfterHours">
  ): Promise<Notification> => {
    const res = await apiRequest("POST", "/api/notifications", {
      ...notificationData,
      // Always SENT — the manual send dialog no longer offers scheduling, and
      // nothing ever consumed scheduledAt anyway (no job reads it), so a
      // "pending" row would simply have been delivered immediately under a
      // misleading status.
      status: NotificationStatus.SENT,
      isRead: false,
      readAt: null,
      response: null,
      escalationLevel: 0,
      escalatedTo: null,
    });
    const newNotification = await res.json();
    await refetchNotifications();
    setHasNewNotifications(true);
    return newNotification;
  }, [refetchNotifications]);

  const sendBulkNotification = useCallback(async (
    recipientIds: string[],
    notificationData: Omit<Notification, "id" | "createdAt" | "updatedAt" | "isRead" | "readAt" | "response" | "status" | "escalationLevel" | "escalatedTo" | "requiresResponse" | "scheduledAt" | "autoEscalateAfterHours" | "recipientId">
  ): Promise<Notification[]> => {
    const promises = recipientIds.map(async (recipientId) => {
      try {
        const res = await apiRequest("POST", "/api/notifications", {
          ...notificationData,
          recipientId,
          status: NotificationStatus.SENT,
          isRead: false,
          readAt: null,
          response: null,
          escalationLevel: 0,
          escalatedTo: null,
        });
        return await res.json();
      } catch (err) {
        // send notification failed silently
        return null;
      }
    });
    const results = (await Promise.all(promises)).filter(Boolean) as Notification[];
    await refetchNotifications();
    setHasNewNotifications(true);
    return results;
  }, [refetchNotifications]);

  const scheduleNotification = useCallback(async (
    notificationData: Omit<Notification, "id" | "createdAt" | "updatedAt" | "isRead" | "readAt" | "response" | "escalationLevel" | "escalatedTo">,
    scheduledAt: string
  ): Promise<Notification> => {
    const res = await apiRequest("POST", "/api/notifications", {
      ...notificationData,
      status: NotificationStatus.PENDING,
      scheduledAt,
      isRead: false,
      readAt: null,
      response: null,
      escalationLevel: 0,
      escalatedTo: null,
    });
    const newNotification = await res.json();
    await refetchNotifications();
    return newNotification;
  }, [refetchNotifications]);

  const sendToTeam = useCallback(async (
    _departmentId: string,
    userIds: string[],
    notificationData: Omit<Notification, "id" | "createdAt" | "updatedAt" | "isRead" | "readAt" | "response" | "status" | "escalationLevel" | "escalatedTo" | "requiresResponse" | "scheduledAt" | "autoEscalateAfterHours" | "recipientId">
  ): Promise<Notification[]> => {
    return sendBulkNotification(userIds, notificationData);
  }, [sendBulkNotification]);

  const markAsRead = useCallback(async (id: string) => {
    const now = new Date().toISOString();
    try {
      await apiRequest("PATCH", `/api/notifications/${id}`, {
        isRead: true,
        readAt: now,
        status: NotificationStatus.READ,
      });
      await refetchNotifications();
    } catch (err) {
      // mark as read failed silently
    }
  }, [refetchNotifications]);

  const markAllAsRead = useCallback(async (_userId: string) => {
    try {
      await apiRequest("POST", "/api/notifications/mark-all-read", {});
      await refetchNotifications();
    } catch (err) {
      // mark all as read failed silently
    }
  }, [refetchNotifications]);

  const deleteNotification = useCallback(async (id: string) => {
    try {
      await apiRequest("DELETE", `/api/notifications/${id}`);
      await refetchNotifications();
    } catch (err) {
      // delete notification failed silently
    }
  }, [refetchNotifications]);

  // Server COUNT(*), not a filter over the loaded window — see fetchUnreadCount.
  // The userId argument is kept so every call site is unchanged; the server
  // already scopes the count to the authenticated user, and the only caller
  // passes that same user. A different id falls back to the local count, which
  // is all the old implementation could ever have done anyway.
  const getUnreadCount = useCallback((userId: string): number => {
    if (user && userId === user.id) return serverUnreadCount;
    return notifications.filter(n => n.recipientId === userId && !n.isRead && n.status !== NotificationStatus.ARCHIVED).length;
  }, [notifications, serverUnreadCount, user]);

  const getUrgentCount = useCallback((userId: string): number => {
    return notifications.filter(n => 
      n.recipientId === userId && 
      !n.isRead && 
      n.priority === NotificationPriority.URGENT &&
      n.status !== NotificationStatus.ARCHIVED
    ).length;
  }, [notifications]);

  const getMyNotifications = useCallback((userId: string, filters?: NotificationFilters): Notification[] => {
    let result = notifications.filter(n => n.recipientId === userId || n.escalatedTo === userId);
    
    if (filters) {
      if (filters.type) result = result.filter(n => n.type === filters.type);
      if (filters.priority) result = result.filter(n => n.priority === filters.priority);
      if (filters.status) result = result.filter(n => n.status === filters.status);
      if (filters.senderId) result = result.filter(n => n.senderId === filters.senderId);
      if (filters.dateFrom) result = result.filter(n => n.createdAt >= filters.dateFrom!);
      if (filters.dateTo) result = result.filter(n => n.createdAt <= filters.dateTo!);
      if (filters.isRead !== undefined) result = result.filter(n => n.isRead === filters.isRead);
      if (filters.requiresResponse !== undefined) result = result.filter(n => n.requiresResponse === filters.requiresResponse);
    }
    
    return result.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [notifications]);

  // The bell's rows — ALWAYS UNFILTERED, whatever tab the page is on.
  //
  // With no filter active the main array is already unfiltered, so it is used
  // directly and there is no extra request. Only while filtered does the bell
  // fall back to unfilteredRecent, the small limit=5 read fetchNotifications
  // makes alongside the main one.
  const getBellNotifications = useCallback((userId: string): Notification[] => {
    const source = isTabFilterActive(tabFilterRef.current) ? unfilteredRecent : notifications;
    return source
      .filter(n => n.recipientId === userId || n.escalatedTo === userId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [notifications, unfilteredRecent]);

  // Does this senderId belong to a real user who could receive a reply?
  //
  // THE PREDICATE IS "resolves to a users row", not `=== "system"`, because the
  // automated producers do not agree on one sentinel:
  //   • server/scheduler.ts — 18 sites, all senderId: "system"
  //   • server/routes.ts:2640 — also "system"
  //   • the POST route's documented system-notification contract sends
  //     senderId: null, which createNotification coalesces to "" (storage.ts)
  // A literal check would have to enumerate all three and would still miss a
  // sender who has since been deleted. Resolving against the roster covers
  // every case with one rule, and GET /api/users returns the FULL roster to
  // every role (routes.ts:2161-2168), so this is reliable for all viewers.
  //
  // ⚠ Fails SAFE: while `users` is still loading it returns false, so a reply
  // is skipped rather than attempted. The acknowledgement is still recorded on
  // the row; only the courtesy reply-to-sender is lost in that brief window.
  const senderResolvesToUser = useCallback((senderId: string | null | undefined): boolean => {
    return !!senderId && users.some(u => u.id === senderId);
  }, [users]);

  const respondToNotification = useCallback(async (id: string, responseType: ResponseTypeValue | string, message: string) => {
    try {
      const notification = notifications.find(n => n.id === id);
      await apiRequest("PATCH", `/api/notifications/${id}`, {
        response: {
          type: responseType,
          message,
          respondedAt: new Date().toISOString(),
          responderId: user?.id || "",
          responderName: user?.name || "",
        },
        status: NotificationStatus.RESPONDED,
      });

      // The «طلب تحويل» arm that used to sit ahead of this one is GONE — it held
      // an approval branch that could never run (`responseType === "approve"`,
      // while ResponseType offers only completed / in_progress / need_more_time /
      // noted) plus an approve/reject notice keyed off it. Both trigger functions
      // that produced such requests are also gone (38dd468 and this batch), so no
      // new ones can arrive. The ~12 EXISTING production rows now fall through to
      // the ordinary reply below — which is the honest outcome: responding to one
      // records the response and tells the sender someone replied, instead of
      // announcing a rejection that no decision produced.
      if (
        notification
        && notification.senderId
        && notification.senderId !== user?.id
        // NO HUMAN SENDER → no reply. senderId must resolve to a real users row,
        // because notifications_recipient_id_fkey (recipient_id → users.id)
        // rejects anything else. All 18 server/scheduler.ts producers write the
        // literal "system", as does routes.ts:2640, and there is NO users row
        // with id='system' (verified against production: 0 rows) — so this POST
        // was guaranteed to fail with a foreign-key violation, 500, and be
        // swallowed by the catch below. The user saw the dialog close and
        // nothing happen. See senderResolvesToUser.
        && senderResolvesToUser(notification.senderId)
      ) {
        try {
          const responseLabel = responseType === "approve" ? "موافقة" 
            : responseType === "reject" ? "رفض"
            : responseType === "in_progress" ? "قيد التنفيذ"
            : "رد";
          await apiRequest("POST", "/api/notifications", {
            type: NotificationType.GENERAL_ALERT,
            priority: NotificationPriority.MEDIUM,
            status: NotificationStatus.SENT,
            title: `رد على إشعارك: ${notification.title || ""}`,
            message: `قام ${user?.name || "مستخدم"} بالرد (${responseLabel}) على إشعارك "${notification.title || ""}". ${message ? "الرد: " + message : ""}`,
            senderId: user?.id || "system",
            senderName: user?.name || "النظام",
            recipientId: notification.senderId,
            relatedType: notification.relatedType || null,
            relatedId: notification.relatedId || null,
            isRead: false,
            readAt: null,
            response: null,
            requiresResponse: false,
            scheduledAt: null,
            escalationLevel: 0,
            escalatedTo: null,
            autoEscalateAfterHours: 0,
          });
        } catch {
          // The courtesy reply-to-sender is BEST EFFORT and stays swallowed on
          // purpose: the user's own response is already persisted by the PATCH
          // above, and failing the whole action because a secondary
          // notification could not be delivered would lose their answer.
        }
      }

      await refetchNotifications();
    } catch (err) {
      // The PATCH that records the response is NOT best-effort. It used to be
      // swallowed here, so a failed response looked identical to a successful
      // one — the dialog closed and showed "تم إرسال الرد بنجاح" either way.
      // Rethrow so the caller can surface it; RespondDialog toasts it.
      throw err;
    }
  }, [refetchNotifications, user, notifications, senderResolvesToUser]);

  const getNotificationResponses = useCallback((senderId: string): Notification[] => {
    return notifications.filter(n => n.senderId === senderId && n.response !== null);
  }, [notifications]);

  const getUserPreferences = useCallback((userId: string): UserNotificationPreferences => {
    return preferences[userId] || { ...defaultPreferences, userId };
  }, [preferences]);

  const updateUserPreferences = useCallback((userId: string, prefs: Partial<UserNotificationPreferences>) => {
    setPreferences(prev => ({
      ...prev,
      [userId]: { ...prev[userId] || { ...defaultPreferences, userId }, ...prefs, userId }
    }));
  }, []);

  const getTemplates = useCallback((): NotificationTemplate[] => {
    return templates;
  }, [templates]);

  const addTemplate = useCallback((templateData: Omit<NotificationTemplate, "id">): NotificationTemplate => {
    const newTemplate: NotificationTemplate = {
      ...templateData,
      id: `template_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    };
    setTemplates(prev => [...prev, newTemplate]);
    return newTemplate;
  }, []);

  const updateTemplate = useCallback((id: string, templateData: Partial<NotificationTemplate>) => {
    setTemplates(prev => prev.map(t => t.id === id ? { ...t, ...templateData } : t));
  }, []);

  const deleteTemplate = useCallback((id: string) => {
    setTemplates(prev => prev.filter(t => t.id !== id));
  }, []);

  const shouldNotifyUser = useCallback((userId: string, eventType: NotificationTypeValue): boolean => {
    const userPrefs = preferences[userId] || defaultPreferences;
    
    switch (eventType) {
      case NotificationType.CASE_ASSIGNED:
      case NotificationType.CONSULTATION_ASSIGNED:
        return userPrefs.notifyOnAssignment !== false;
      case NotificationType.STAGE_CHANGED:
        return userPrefs.notifyOnStageChange !== false;
      case NotificationType.SENT_TO_REVIEW:
      case NotificationType.REVIEW_NOTES_ADDED:
        return userPrefs.notifyOnReviewNotes !== false;
      case NotificationType.RETURNED_FOR_REVISION:
      case NotificationType.THIRD_RETURN_WARNING:
        return userPrefs.notifyOnReturn !== false;
      case NotificationType.SLA_WARNING:
      case NotificationType.SLA_OVERDUE:
        return userPrefs.notifyOnSlaWarning !== false;
      default:
        return true;
    }
  }, [preferences]);

  const triggerWorkflowNotification = useCallback((
    event: WorkflowNotificationEvent,
    recipientIds: string[]
  ) => {
    const matchingRules = rules.filter(r => r.isActive && r.triggerEvent === event.type);
    
    matchingRules.forEach(rule => {
      let title = rule.template.title;
      let message = rule.template.message;
      
      const replacements: Record<string, string> = {
        "{entityName}": event.entityName || "",
        "{entityType}": event.entityType === "case" ? "قضية" : "استشارة",
        "{stage}": event.stage || "",
        "{previousStage}": event.previousStage || "",
        "{returnReason}": event.returnReason || "",
        "{timeRemaining}": event.timeRemaining || "",
        "{overdueTime}": event.overdueTime || "",
        "{employeeName}": event.employeeName || "",
        "{count}": String(event.count || 0),
      };
      
      Object.entries(replacements).forEach(([key, value]) => {
        title = title.replace(key, value);
        message = message.replace(key, value);
      });
      
      const filteredRecipients = recipientIds.filter(id => shouldNotifyUser(id, event.type));
      
      if (filteredRecipients.length === 0) return;
      
      const postPromises = filteredRecipients.map(recipientId =>
        apiRequest("POST", "/api/notifications", {
          type: event.type,
          priority: rule.notificationPriority,
          status: NotificationStatus.SENT,
          title,
          message,
          senderId: null,
          senderName: null,
          isAutomatic: true,
          recipientId,
          relatedType: event.entityType,
          relatedId: event.entityId,
          relatedStage: event.stage || null,
          workflowTriggerId: `trigger_${Date.now()}`,
          isRead: false,
          readAt: null,
          response: null,
          requiresResponse: false,
          scheduledAt: null,
          escalationLevel: 0,
          escalatedTo: null,
          autoEscalateAfterHours: rule.autoEscalate ? rule.escalateAfterHours : 0,
        }).catch(() => {})
      );
      
      Promise.all(postPromises).then(() => {
        refetchNotifications();
        setHasNewNotifications(true);
      });
    });
  }, [rules, shouldNotifyUser, refetchNotifications]);

  const getNotificationRules = useCallback((): NotificationRule[] => {
    return rules;
  }, [rules]);

  const updateNotificationRule = useCallback((id: string, ruleData: Partial<NotificationRule>) => {
    setRules(prev => prev.map(r => r.id === id ? { ...r, ...ruleData } : r));
  }, []);

  const toggleRuleActive = useCallback((id: string) => {
    setRules(prev => prev.map(r => r.id === id ? { ...r, isActive: !r.isActive } : r));
  }, []);

  const addNotificationRule = useCallback((ruleData: Omit<NotificationRule, "id">): NotificationRule => {
    const newRule: NotificationRule = {
      ...ruleData,
      id: `rule_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    };
    setRules(prev => [...prev, newRule]);
    return newRule;
  }, []);

  const deleteNotificationRule = useCallback((id: string) => {
    setRules(prev => prev.filter(r => r.id !== id));
  }, []);

  const getWorkflowNotifications = useCallback((entityId: string): Notification[] => {
    return notifications.filter(n => n.relatedId === entityId && n.isAutomatic);
  }, [notifications]);

  const getNotificationStats = useCallback(() => {
    const total = notifications.length;
    const unread = notifications.filter(n => !n.isRead).length;
    const urgent = notifications.filter(n => n.priority === NotificationPriority.URGENT && !n.isRead).length;
    const byType: Record<string, number> = {};
    notifications.forEach(n => {
      byType[n.type] = (byType[n.type] || 0) + 1;
    });
    return { total, unread, urgent, byType };
  }, [notifications]);

  return (
    <NotificationsContext.Provider value={{
      notifications,
      templates,
      preferences,
      rules,
      isLoading,
      refetchNotifications,
      tabFilter,
      setTabFilter,
      getBellNotifications,
      hasMoreNotifications,
      isLoadingMore,
      loadMoreNotifications,
      sendNotification,
      sendBulkNotification,
      scheduleNotification,
      sendToTeam,
      markAsRead,
      markAllAsRead,
      deleteNotification,
      getUnreadCount,
      getMyNotifications,
      respondToNotification,
      getNotificationResponses,
      getUserPreferences,
      updateUserPreferences,
      getTemplates,
      addTemplate,
      updateTemplate,
      deleteTemplate,
      getUrgentCount,
      hasNewNotifications,
      setHasNewNotifications,
      triggerWorkflowNotification,
      getNotificationRules,
      updateNotificationRule,
      toggleRuleActive,
      addNotificationRule,
      deleteNotificationRule,
      getWorkflowNotifications,
      getNotificationStats,
    }}>
      {children}
    </NotificationsContext.Provider>
  );
}

export function useNotifications() {
  const context = useContext(NotificationsContext);
  if (context === undefined) {
    throw new Error("useNotifications must be used within a NotificationsProvider");
  }
  return context;
}
