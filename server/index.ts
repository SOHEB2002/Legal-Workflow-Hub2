import express, { type Request, Response, NextFunction } from "express";
import helmet from "helmet";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { authMiddleware, csrfProtection } from "./auth";
import { attachActingContext } from "./acting-context";
import { startScheduler } from "./scheduler";
import { storage } from "./storage";
import { pool } from "./db";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { setupWebSocket } from "./websocket";

const app = express();
app.set("trust proxy", 1);
const httpServer = createServer(app);

// ==================== Security headers (helmet + CSP) ====================
// Auth tokens live in localStorage, so an XSS injection = session theft. The
// Content-Security-Policy below is the mitigation: script-src is kept strict
// ('self' only — the built index.html has NO inline scripts, just a hashed
// /assets module bundle), so an injected inline/remote script cannot execute.
//
// Everything else is deliberately permissive to avoid a white-screen, with the
// app's real needs audited from the build output:
//   - styleSrc 'unsafe-inline'  -> Radix UI / Recharts set inline style= attrs
//   - styleSrc fonts.googleapis -> the Cairo/Tajawal stylesheet (index.html)
//   - fontSrc  fonts.gstatic    -> the actual Arabic font files
//   - connectSrc ws:/wss:       -> the /ws notification WebSocket
//   - imgSrc data:/blob:/https: -> avatars, base64 previews, file blobs
// useDefaults keeps helmet's safe directives (frame-ancestors 'self',
// base-uri 'self', object-src 'none', upgrade-insecure-requests, etc.).
// COEP is disabled so cross-origin Google Fonts load without a CORP handshake.
//
// REQUIRES a post-deploy preview smoke-test (open the site, confirm pages
// render + no CSP errors in the browser console). If anything is blocked,
// this commit can be reverted in isolation.
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
        imgSrc: ["'self'", "data:", "blob:", "https:"],
        connectSrc: ["'self'", "ws:", "wss:"],
        objectSrc: ["'none'"],
      },
    },
    crossOriginEmbedderPolicy: false,
  }),
);

// Short-lived cache for the "is this user still active?" DB check.
// We verify once per request, but at 10+ parallel API calls on login the
// check fires many times for the same user within milliseconds. A 30-second
// cache cuts those redundant DB reads to virtually zero.
const activeUserCache = new Map<string, { isActive: boolean; ts: number }>();
const USER_CACHE_TTL_MS = 30_000;

// Phase 5 A2/L2 — drop a user's cached active-status so the next request
// re-reads it from the DB. Called from the user-deactivation path so a
// disabled account loses authorization immediately instead of up to
// USER_CACHE_TTL_MS (30s) later.
export function invalidateUserCache(userId: string): void {
  activeUserCache.delete(userId);
}


declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false }));
app.use(authMiddleware);
// Unified-tasks I4a — resolve the delegation acting context once per request
// (after auth populates req.user). 4a only ATTACHES it; nothing consumes it yet,
// so behavior is unchanged. Fail-safe (never blocks the request).
app.use(attachActingContext);
app.use(csrfProtection);

// ==================== Viewer read-only guard ====================
// Single chokepoint for the "viewer" role: any non-GET API call from a
// viewer is rejected with 403 before the route handler runs. Reads
// (GET/HEAD/OPTIONS) and the auth endpoints (login/refresh/logout/
// password-change) stay open — viewers still need to sign in, refresh
// their session, and change their own password. Putting the gate here
// instead of on every individual write handler means we cannot
// accidentally ship a new mutating route that forgets the check.
app.use((req: Request, res: Response, next: NextFunction) => {
  const user = (req as any).user;
  if (!user || user.role !== "viewer") return next();
  if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") return next();
  if (req.path.startsWith("/api/auth/")) return next();
  return res.status(403).json({
    error: "ليس لديك صلاحية لتنفيذ هذا الإجراء — حساب مشاهد للقراءة فقط",
  });
});

app.use(async (req: Request, res: Response, next: NextFunction) => {
  const user = (req as any).user;
  if (!user || !req.path.startsWith("/api/")) return next();
  if (["/api/auth/login", "/api/auth/refresh", "/api/auth/logout", "/api/auth/emergency-reset"].includes(req.path)) return next();

  const cached = activeUserCache.get(user.id);
  if (cached && Date.now() - cached.ts < USER_CACHE_TTL_MS) {
    if (!cached.isActive) {
      return res.status(401).json({ error: "الحساب معطّل أو محذوف. أعد تسجيل الدخول" });
    }
    return next();
  }

  const dbUser = await storage.getUser(user.id);
  const isActive = !!(dbUser?.isActive);
  activeUserCache.set(user.id, { isActive, ts: Date.now() });
  if (!isActive) {
    return res.status(401).json({ error: "الحساب معطّل أو محذوف. أعد تسجيل الدخول" });
  }
  next();
});

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        // Auth responses carry secrets (token / csrfToken / tempPassword);
        // never serialize their bodies into the log. Everything else logs
        // its response body as before.
        if (path.startsWith("/api/auth")) {
          logLine += ` :: [redacted]`;
        } else {
          logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
        }
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  // Apply DB indexes on every startup (all statements use IF NOT EXISTS so
  // this is fully idempotent and safe to run repeatedly).
  try {
    // ESM (tsx/dev) has no __dirname; derive the module dir from
    // import.meta.url. esbuild shims import.meta.url in the prod CJS bundle,
    // so this resolves correctly in both run modes.
    const moduleDir = dirname(fileURLToPath(import.meta.url));
    const indexSql = readFileSync(join(moduleDir, "migrate-indexes.sql"), "utf8");
    // Split on semicolons and run each statement individually
    const statements = indexSql
      .split(";")
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && !s.startsWith("--"));
    for (const stmt of statements) {
      await pool.query(stmt);
    }
    console.log("DB indexes applied successfully.");
  } catch (err) {
    console.error("Failed to apply DB indexes:", err);
  }

  // NOTE: two one-time boot migrations were removed here (case classification
  // migration + department-id backfill). Both targeted a `cases` relation that
  // does not exist (the table is `law_cases`), so they threw
  // `relation "cases" does not exist` on every boot and never executed. Their
  // intent was superseded by the live stage-bar flow (classification) and a
  // since-corrected client department list (backfill); nothing at runtime
  // depended on them. Removed rather than repointed at `law_cases`, since
  // repointing would activate dormant UPDATEs against live data.

  setupWebSocket(httpServer);
  await registerRoutes(httpServer, app);

  // Any /api/* request that reaches here matched NO route above. Without this it
  // falls through to the SPA catch-all (vite.ts / static.ts), which serves
  // index.html with HTTP 200 — so the client treats a missing/not-yet-registered
  // endpoint as SUCCESS (a mutating POST silently no-ops while apiRequest, which
  // only throws on non-2xx, fires its success toast). Returning a JSON 404 here
  // makes apiRequest throw, surfacing the real failure instead of masking it.
  // Placed after registerRoutes (so real routes win) and before the SPA
  // catch-all; non-/api paths skip it and still reach the SPA.
  app.use("/api", (_req: Request, res: Response) => {
    res.status(404).json({ error: "المسار غير موجود" });
  });

  app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    const status = err.status || err.statusCode || 500;

    console.error("Internal Server Error:", err);

    if (res.headersSent) {
      return next(err);
    }

    // Don't leak raw err.message to clients on server errors — an unhandled
    // DB/Drizzle throw can echo SQL/column/constraint text. 5xx returns a
    // generic message; a deliberately-thrown 4xx keeps its own message. The
    // full error is still recorded server-side via console.error above.
    const message = status >= 500 ? "Internal Server Error" : (err.message || "Bad Request");
    return res.status(status).json({ message });
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true,
    },
    () => {
      log(`serving on port ${port}`);
      startScheduler();
    },
  );

  const gracefulShutdown = (signal: string) => {
    log(`Received ${signal}, shutting down gracefully...`);
    httpServer.close(() => {
      log("HTTP server closed");
      process.exit(0);
    });
    setTimeout(() => {
      log("Forced shutdown after timeout");
      process.exit(1);
    }, 5000).unref();
  };
  process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
  process.on("SIGINT", () => gracefulShutdown("SIGINT"));
})();
