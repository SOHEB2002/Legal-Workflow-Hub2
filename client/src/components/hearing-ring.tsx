import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Bell, BellOff, CheckCircle, Gavel } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useHearings } from "@/lib/hearings-context";
import { useToast } from "@/hooks/use-toast";
import { BidiText } from "@/components/ui/bidi-text";
import { extractApiError } from "@/lib/utils";
import { isRingWindowOpen, HearingRingTier, type HearingRingItem } from "@shared/schema";
import { canCheckInHearing } from "@/lib/attachment-indicators";

// WHY this user is being rung, per tier. The modal must say so: an admin_support
// user woken by a hearing in a department they have never touched needs to know
// it is a firm-wide escalation, not their own session.
const TIER_HEADLINE: Record<string, string> = {
  [HearingRingTier.ATTENDING]: "جلستك",
  [HearingRingTier.DEPARTMENT]: "جلسة في قسمك — لم يتم تحضيرها بعد",
  [HearingRingTier.ADMIN_SUPPORT]: "جلسة لم تُحضَّر — تصعيد",
  [HearingRingTier.BRANCH_MANAGER]: "جلسة لم تُحضَّر — تصعيد نهائي",
};

// 🔔 THE PRE-HEARING RING — batch 3, tier 1 (the attending lawyer only).
//
// 🔴 WHY THIS IS ITS OWN APP-LEVEL COMPONENT AND NOT PART OF THE BELL.
// notifications-bell.tsx cannot host it, for three independent reasons:
//   1. its sound effect is keyed on `hasNewNotifications && unreadCount > 0` —
//      a ring has nothing to do with unread notification counts;
//   2. it is gated on preferences.enableSound, which lives in localStorage and
//      is therefore PER-BROWSER, not per-account (see the mute note below);
//   3. it is mounted inside the bell dropdown's subtree, so its lifetime is
//      tied to a UI affordance rather than to the session.
// This component is mounted ONCE at the app root and renders nothing until a
// ring window is actually open.
//
// 🔴 DERIVATION IS THE MECHANISM; THE SOCKET IS ONLY AN ACCELERATOR.
// Everything below decides whether to ring from ring-state DATA plus the local
// clock. A client that never receives a single push still rings within one poll
// interval, and a client that refreshes mid-ring resumes immediately because
// there is no ring state to lose — see the query below.
const RING_POLL_MS = 30_000;

export function HearingRing() {
  const { user } = useAuth();
  const { checkInHearing } = useHearings();
  const { toast } = useToast();

  const [nowMs, setNowMs] = useState(() => Date.now());
  const [audioBlocked, setAudioBlocked] = useState(false);
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const unlockedRef = useRef(false);
  const originalTitleRef = useRef<string | null>(null);

  // THE DERIVATION SOURCE. Explicit refetchInterval because the app's global
  // default is `refetchInterval: false` (queryClient.ts) — nothing polls unless
  // it says so. refetchOnMount is forced true here for the same reason: the
  // global default is false, and a ring that did not re-derive on mount would
  // stay silent after a page refresh.
  const { data: items = [] } = useQuery<HearingRingItem[]>({
    queryKey: ["/api/hearings/ring-state"],
    enabled: !!user,
    refetchInterval: RING_POLL_MS,
    refetchOnMount: true,
    staleTime: 0,
  });

  // Local clock tick, so the window opens and closes on the right SECOND rather
  // than only on a poll boundary. Cheap: one setState per second, and only while
  // the user is logged in.
  useEffect(() => {
    if (!user) return;
    const t = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(t);
  }, [user]);

  // The hearings whose window is open RIGHT NOW. One shared rule
  // (isRingWindowOpen) with the server, so client and server cannot disagree
  // about when a hearing is ringing.
  const ringing = useMemo(
    () => items.filter((i) => isRingWindowOpen(i, nowMs)),
    [items, nowMs],
  );
  const isRinging = ringing.length > 0;

  // 🔴 THE AUTOPLAY UNLOCK. Browsers refuse programmatic playback until the
  // origin has seen a user gesture. Logging in is NOT sufficient by itself in
  // every engine, so this hooks the FIRST pointer or key event anywhere in the
  // document and performs a silent play/pause to satisfy the policy. Once only,
  // passive, and self-removing.
  useEffect(() => {
    if (!user) return;
    const unlock = () => {
      if (unlockedRef.current) return;
      unlockedRef.current = true;
      const el = ensureAudio();
      const prevVolume = el.volume;
      el.volume = 0;
      el.play()
        .then(() => {
          el.pause();
          el.currentTime = 0;
          el.volume = prevVolume;
          setAudioBlocked(false);
        })
        .catch(() => {
          el.volume = prevVolume;
          // Not treated as "blocked" yet — a failed silent unlock is common and
          // the real attempt below is what decides.
        });
    };
    document.addEventListener("pointerdown", unlock, { once: true, passive: true });
    document.addEventListener("keydown", unlock, { once: true });
    return () => {
      document.removeEventListener("pointerdown", unlock);
      document.removeEventListener("keydown", unlock);
    };
  }, [user]);

  function ensureAudio(): HTMLAudioElement {
    if (!audioRef.current) {
      const el = new Audio("/notification-chime.wav");
      // 🔴 CONTINUOUS until dismissed — the chime is a one-shot, this is not.
      el.loop = true;
      el.volume = 0.7;
      audioRef.current = el;
    }
    return audioRef.current;
  }

  // Start / stop the loop, and the document.title marker, purely as a function
  // of isRinging. No imperative start/stop calls anywhere else.
  useEffect(() => {
    const el = ensureAudio();
    if (isRinging) {
      // 🔴 NOT GATED ON preferences.enableSound — owner decision. That
      // preference lives in localStorage, so it is per-BROWSER, not
      // per-account: a user who muted notifications once on a shared machine
      // would silently lose a safety alert everywhere. The ring overrides mute.
      //
      // 🔴 THE AUDIO HONESTY FIX. The bell swallows a blocked-playback
      // rejection into an empty catch, so it cannot tell a played chime from a
      // silent one. Here the rejection SETS STATE, and that state drives the
      // visible "الصوت مكتوم" marker on the modal — so a blocked ring is
      // announced rather than invisible.
      el.play().then(() => setAudioBlocked(false)).catch(() => setAudioBlocked(true));

      if (originalTitleRef.current === null) originalTitleRef.current = document.title;
      // Backgrounded tabs show no modal — the title is the only signal that
      // reaches a user looking at another tab's strip. Restored on stop.
      document.title = `🔔 تحضير الجلسة — ${document.title.replace(/^🔔 تحضير الجلسة — /, "")}`;
    } else {
      el.pause();
      el.currentTime = 0;
      if (originalTitleRef.current !== null) {
        document.title = originalTitleRef.current;
        originalTitleRef.current = null;
      }
    }
  }, [isRinging]);

  // Unmount safety — a logout mid-ring must not leave audio playing or the tab
  // title mangled.
  useEffect(() => {
    return () => {
      audioRef.current?.pause();
      if (originalTitleRef.current !== null) document.title = originalTitleRef.current;
    };
  }, []);

  const handleCheckIn = async (item: HearingRingItem) => {
    setSubmittingId(item.hearingId);
    try {
      // 🔴 THE FLAG IS READ NOW. It was discarded, so a 2nd and 3rd press each
      // toasted «تم تحضير الجلسة» exactly like the first — which is what made
      // the old lag feel like a dead button rather than a slow one: the user
      // pressed again precisely BECAUSE the ring had not stopped, and was told
      // "done" again. hearings.tsx has always consumed this flag; the ring did
      // not, so one context function was reported honestly in one place and not
      // the other.
      //
      // The repeat message is NOT an error and must not read as one: the hearing
      // IS prepared, which is exactly what the user wanted. It states the
      // existing fact instead of claiming a fresh success.
      const { alreadyCheckedIn } = await checkInHearing(item.hearingId);
      toast({ title: alreadyCheckedIn ? "الجلسة محضّرة مسبقاً" : "تم تحضير الجلسة" });
      // No local "silence it" flag: the check-in makes the row stop matching
      // ring-state, and checkInHearing now invalidates that query, so the ring
      // ends because the DATA changed — the same reason it ends for everyone
      // else. The server's ring-stop push (now addressed to the actor as well as
      // the attending lawyer) is the accelerator for this user's OTHER tabs.
    } catch (e: any) {
      toast({ title: "تعذّر تحضير الجلسة", description: extractApiError(e), variant: "destructive" });
    } finally {
      setSubmittingId(null);
    }
  };

  // "تم الاطلاع" — silences THIS PERSON's ring only. The chain continues: the
  // hearing is still unprepared, later tiers still fire for everyone else, and
  // this is never treated as a check-in anywhere.
  const handleAcknowledge = async (item: HearingRingItem) => {
    setSubmittingId(item.hearingId);
    try {
      await apiRequest("POST", `/api/hearings/${item.hearingId}/acknowledge`);
      // Re-derive from the server rather than hiding it locally: the ack is
      // server state, so the row disappearing is the same event every other tab
      // of this user sees.
      await queryClient.invalidateQueries({ queryKey: ["/api/hearings/ring-state"] });
    } catch (e: any) {
      toast({ title: "تعذّر تسجيل الاطلاع", description: extractApiError(e), variant: "destructive" });
    } finally {
      setSubmittingId(null);
    }
  };

  if (!user || !isRinging) return null;

  // 🔴 THE VISUAL FALLBACK, and it is not a fallback so much as the primary
  // surface: a modal that CANNOT be auto-dismissed and cannot be closed by
  // clicking away or pressing Escape. A toast was rejected outright — it
  // disappears on a timer, which is the one thing this must never do. It works
  // identically whether or not audio played, so a muted or blocked tab loses
  // nothing but the noise.
  return (
    <Dialog open>
      <DialogContent
        dir="rtl"
        className="max-w-md border-2 border-destructive"
        onEscapeKeyDown={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
        data-testid="dialog-hearing-ring"
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <Bell className="h-5 w-5 animate-pulse" />
            تحضير الجلسة
          </DialogTitle>
        </DialogHeader>

        {audioBlocked && (
          <div
            className="flex items-center gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400"
            data-testid="banner-ring-audio-blocked"
          >
            <BellOff className="h-4 w-4 shrink-0" />
            الصوت مكتوم في هذا المتصفح — هذا التنبيه مرئي فقط
          </div>
        )}

        <div className="space-y-3">
          {ringing.map((item) => {
            // 🔴 VISIBILITY == AUTHORIZATION. تحضير renders ONLY when the SHARED
            // client predicate passes — the same rule the server's
            // canCheckInHearing enforces — so a department member or an
            // admin_support user never sees a button that would 403. They get
            // "تم الاطلاع" instead, which is exactly why that action exists:
            // without it they would face a non-dismissable modal with no action
            // they are permitted to take.
            const mayPrepare = canCheckInHearing(
              user,
              { attendingLawyerId: item.attendingLawyerId },
              { departmentId: item.caseDepartmentId },
            );
            return (
              <div
                key={item.hearingId}
                className="rounded-md border bg-card p-3 text-sm"
                data-testid={`ring-item-${item.hearingId}`}
              >
                <div className="font-medium" data-testid={`ring-tier-${item.hearingId}`}>
                  {TIER_HEADLINE[item.tier] ?? "جلسة لم تُحضَّر"} — الساعة {item.hearingTime}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  القضية رقم <BidiText>{item.caseNumber}</BidiText>
                  {item.courtName ? <> — <BidiText>{item.courtName}</BidiText></> : null}
                </div>
                <div className="mt-3 flex gap-2">
                  {mayPrepare && (
                    <Button
                      className="flex-1"
                      onClick={() => handleCheckIn(item)}
                      disabled={submittingId === item.hearingId}
                      data-testid={`button-ring-check-in-${item.hearingId}`}
                    >
                      <CheckCircle className="ml-2 h-4 w-4" />
                      تحضير
                    </Button>
                  )}
                  {/* Offered to EVERYONE the ring reaches, including those who
                      may prepare — a lawyer who cannot act right now may still
                      want the noise to stop. */}
                  <Button
                    variant="outline"
                    className={mayPrepare ? "" : "flex-1"}
                    onClick={() => handleAcknowledge(item)}
                    disabled={submittingId === item.hearingId}
                    data-testid={`button-ring-ack-${item.hearingId}`}
                  >
                    تم الاطلاع
                  </Button>
                </div>
              </div>
            );
          })}
        </div>

        <DialogFooter className="text-xs text-muted-foreground sm:justify-start">
          <span className="flex items-center gap-1">
            <Gavel className="h-3 w-3" />
            يستمر التنبيه حتى يتم التحضير
          </span>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
