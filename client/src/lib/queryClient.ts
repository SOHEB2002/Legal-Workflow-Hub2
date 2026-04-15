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

async function throwIfResNotOk(res: Response) {
  if (res.status === 401) {
    const token = localStorage.getItem("lawfirm_token");
    if (token) {
      try {
        const refreshRes = await fetch("/api/auth/refresh", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        });
        if (refreshRes.ok) {
          const data = await refreshRes.json();
          if (data.token) {
            localStorage.setItem("lawfirm_token", data.token);
            if (data.csrfToken) {
              localStorage.setItem("lawfirm_csrf_token", data.csrfToken);
            }
          }
          throw new RetryableAuthError("Token refreshed, retry request");
        }
      } catch (e) {
        if (e instanceof RetryableAuthError) throw e;
      }
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

// ============================================================
// API Call Counter — diagnostics
// Call startApiCallCounter() right after login to measure how
// many fetch('/api/...') calls are made in the first 30 seconds.
// Results are printed to the browser console.
// ============================================================
let _origFetch: typeof fetch | null = null;
let _apiCallCount = 0;
let _apiCounterTimer: ReturnType<typeof setTimeout> | null = null;

export function startApiCallCounter() {
  if (_origFetch) return; // already running
  _apiCallCount = 0;
  _origFetch = window.fetch;
  (window as any).fetch = ((...args: Parameters<typeof fetch>) => {
    const url =
      typeof args[0] === "string"
        ? args[0]
        : (args[0] as Request).url;
    if (url.startsWith("/api/")) {
      _apiCallCount++;
      console.log(`[API #${_apiCallCount}] ${url}`);
    }
    return _origFetch!(...args);
  }) as typeof fetch;

  if (_apiCounterTimer) clearTimeout(_apiCounterTimer);
  _apiCounterTimer = setTimeout(() => {
    console.log(
      `%c[API Counter] TOTAL /api/* calls in first 30s: ${_apiCallCount}`,
      "color: red; font-size: 14px; font-weight: bold"
    );
    if (_origFetch) {
      (window as any).fetch = _origFetch;
      _origFetch = null;
    }
  }, 30_000);
}
