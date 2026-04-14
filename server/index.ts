import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { authMiddleware, csrfProtection } from "./auth";
import { startScheduler } from "./scheduler";
import { storage } from "./storage";
import { pool } from "./db";
import { readFileSync } from "fs";
import { join } from "path";
import { setupWebSocket } from "./websocket";

const app = express();
app.set("trust proxy", 1);
const httpServer = createServer(app);

// Short-lived cache for the "is this user still active?" DB check.
// We verify once per request, but at 10+ parallel API calls on login the
// check fires many times for the same user within milliseconds. A 30-second
// cache cuts those redundant DB reads to virtually zero.
const activeUserCache = new Map<string, { isActive: boolean; ts: number }>();
const USER_CACHE_TTL_MS = 30_000;

function clearActiveUserCache(userId: string) {
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
app.use(csrfProtection);

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
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
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
    const indexSql = readFileSync(join(__dirname, "migrate-indexes.sql"), "utf8");
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

  // One-time idempotent classification migration.
  //   1. Rename legacy value literals to the new scheme.
  //   2. Promote cases whose currentStage means they're actually in court.
  //   3. Revert cases that were wrongly promoted while still in pre-trial
  //      review/conciliation stages (bug from a previous release).
  // All three steps use plain UPDATEs and are safe to run on every boot.
  try {
    await pool.query(
      `UPDATE cases SET case_classification = 'قيد_الدراسة' WHERE case_classification = 'قضية_جديدة'`,
    );
    await pool.query(
      `UPDATE cases SET case_classification = 'منظورة_بالمحكمة' WHERE case_classification = 'قضية_مقيدة'`,
    );
    await pool.query(
      `UPDATE cases
         SET case_classification = 'منظورة_بالمحكمة',
             client_role = COALESCE(NULLIF(client_role, ''), 'مدعي')
       WHERE case_classification = 'قيد_الدراسة'
         AND current_stage IN (
           'منظورة',
           'منظورة_استئناف',
           'محكوم_حكم_ابتدائي',
           'محكوم_حكم_نهائي',
           'تحصيل'
         )`,
    );
    await pool.query(
      `UPDATE cases
         SET case_classification = 'قيد_الدراسة'
       WHERE case_classification = 'منظورة_بالمحكمة'
         AND current_stage IN (
           'مداولة_الصلح',
           'أغلق_طلب_الصلح',
           'قيد_التدقيق_في_تراضي',
           'قيد_التدقيق_في_ناجز',
           'قيد_التدقيق_في_معين'
         )`,
    );
    console.log("Case classification migration applied successfully.");
  } catch (err) {
    console.error("Failed to apply classification migration:", err);
  }

  setupWebSocket(httpServer);
  await registerRoutes(httpServer, app);

  app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    console.error("Internal Server Error:", err);

    if (res.headersSent) {
      return next(err);
    }

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
})();
