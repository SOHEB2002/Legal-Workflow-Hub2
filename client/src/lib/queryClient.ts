import { QueryClient, QueryFunction } from "@tanstack/react-query";

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

class RetryableAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RetryableAuthError";
  }
}

// Single-flight refresh. Multiple concurrent callers — apiRequest's 401
// retry path here, the scheduled refresh in auth-context, and the
// visibility-change handler — share one in-flight promise so they can't
// race each other into consuming the same rotation token (which left the
// loser logged out via localStorage.clear + reload).
export type RefreshResult =
  | { ok: true }
  | { ok: false; reason: "no-token" | "network" | "rejected" };

let refreshInFlight: Promise<RefreshResult> | null = null;

export function refreshAuthToken(): Promise<RefreshResult> {
  if (refreshInFlight) return refreshInFlight;
  const p: Promise<RefreshResult> = (async () => {
    const token = localStorage.getItem("lawfirm_token");
    if (!token) return { ok: false, reason: "no-token" } as const;
    try {
      const headers: Record<string, string> = {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
      };
      const csrf = localStorage.getItem("lawfirm_csrf_token");
      if (csrf) headers["X-CSRF-Token"] = csrf;
      const res = await fetch("/api/auth/refresh", { method: "POST", headers });
      if (!res.ok) return { ok: false, reason: "rejected" } as const;
      const data = await res.json();
      if (data.token) {
        localStorage.setItem("lawfirm_token", data.token);
        if (data.csrfToken) {
          localStorage.setItem("lawfirm_csrf_token", data.csrfToken);
        }
        return { ok: true } as const;
      }
      return { ok: false, reason: "rejected" } as const;
    } catch {
      return { ok: false, reason: "network" } as const;
    }
  })();
  refreshInFlight = p;
  void p.finally(() => {
    if (refreshInFlight === p) refreshInFlight = null;
  });
  return p;
}

async function throwIfResNotOk(res: Response) {
  if (res.status === 401) {
    const result = await refreshAuthToken();
    if (result.ok) {
      throw new RetryableAuthError("Token refreshed, retry request");
    }
    // Only nuke the session when the server actually rejected the refresh.
    // Network blips fall through — a transient failure on a 30s sidebar
    // poll shouldn't force a logout.
    if (result.reason === "rejected") {
      localStorage.removeItem("lawfirm_token");
      localStorage.removeItem("lawfirm_csrf_token");
      localStorage.removeItem("lawfirm_user");
      window.location.reload();
    }
    throw new Error("401: غير مصرح");
  }
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const makeRequest = async () => {
    const headers: Record<string, string> = {
      ...getAuthHeaders(),
    };
    if (data) {
      headers["Content-Type"] = "application/json";
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);
    try {
      return await fetch(url, {
        method,
        headers,
        body: data ? JSON.stringify(data) : undefined,
        credentials: "include",
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }
  };

  let res = await makeRequest();
  try {
    await throwIfResNotOk(res);
  } catch (e) {
    if (e instanceof RetryableAuthError) {
      // Retry with refreshed token
      res = await makeRequest();
      await throwIfResNotOk(res);
    } else {
      throw e;
    }
  }
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const res = await fetch(queryKey.join("/") as string, {
      credentials: "include",
      headers: getAuthHeaders(),
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      // Never auto-poll. Any polling is explicit (e.g., notifications-context).
      refetchInterval: false,
      // Tab-focus refetch causes an extra round-trip every time a user switches
      // windows — a big source of needless API calls in a multi-tab office.
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
      refetchOnMount: false,
      staleTime: 60 * 1000,
      gcTime: 5 * 60 * 1000,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
