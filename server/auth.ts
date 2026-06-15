import type { Request, Response, NextFunction } from "express";
import { globalActingRoles } from "./acting-context";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { randomBytes, createHmac } from "crypto";

const JWT_SECRET = process.env.SESSION_SECRET;
if (!JWT_SECRET) {
  console.error("FATAL: SESSION_SECRET environment variable is required");
  process.exit(1);
}

const SALT_ROUNDS = 10;
const TOKEN_EXPIRY = "2h";

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function comparePassword(
  password: string,
  hash: string
): Promise<boolean> {
  try {
    if (hash.startsWith("$2b$") || hash.startsWith("$2a$")) {
      return await bcrypt.compare(password, hash);
    }
    return false;
  } catch {
    return false;
  }
}

// JWT now also carries `name` so audit-log inserts that need
// userName (case_notes, case_comments, case_activity_log, etc.) can
// pull it straight off req.user without a DB roundtrip. Tokens issued
// before this change carry no name; consumers must fall back to user.id
// to avoid NOT-NULL violations on the userName column.
export function generateToken(userId: string, role: string, departmentId?: string | null, name?: string | null): string {
  return jwt.sign({ userId, role, departmentId: departmentId || null, name: name || null }, JWT_SECRET!, {
    expiresIn: TOKEN_EXPIRY,
  });
}

export function verifyToken(
  token: string
): { userId: string; role: string; departmentId: string | null; name: string | null } | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET!) as {
      userId: string;
      role: string;
      departmentId: string | null;
      name?: string | null;
    };
    return {
      userId: decoded.userId,
      role: decoded.role,
      departmentId: decoded.departmentId || null,
      name: decoded.name || null,
    };
  } catch {
    return null;
  }
}

export function verifyTokenForRefresh(
  token: string
): { userId: string; role: string; departmentId: string | null; name: string | null } | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET!, { ignoreExpiration: true }) as {
      userId: string;
      role: string;
      departmentId: string | null;
      name?: string | null;
      exp?: number;
    };
    if (decoded.exp) {
      const now = Math.floor(Date.now() / 1000);
      const expiredAgo = now - decoded.exp;
      if (expiredAgo > 30 * 60) {
        return null;
      }
    }
    return {
      userId: decoded.userId,
      role: decoded.role,
      departmentId: decoded.departmentId || null,
      name: decoded.name || null,
    };
  } catch {
    return null;
  }
}

export function validatePassword(password: string): { valid: boolean; message: string } {
  if (password.length < 6) return { valid: false, message: "كلمة المرور يجب أن تكون 6 أحرف على الأقل" };
  if (password.length > 128) return { valid: false, message: "كلمة المرور طويلة جداً (الحد الأقصى 128 حرف)" };
  return { valid: true, message: "" };
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "غير مصرح" });
    return;
  }
  const token = authHeader.slice(7);
  const decoded = verifyToken(token);
  if (!decoded) {
    res.status(401).json({ error: "جلسة منتهية" });
    return;
  }
  (req as any).user = {
    id: decoded.userId,
    role: decoded.role,
    departmentId: decoded.departmentId,
    name: decoded.name || decoded.userId,
  };
  next();
}

// 4c-6: delegation role-inheritance for the ENTITY-AGNOSTIC requireRole gates is
// now ENABLED. A delegate inherits the delegator's role (all_cases delegators
// only — globalActingRoles) on the requireRole gates: entity deletes
// (case/client/consultation/contract/hearing/field-task/contact-log/memo/
// notification/attachment), the lawyer-performance / court-analytics stats, and
// delegation-approve. The activity log records the real human actor, which is
// the accountability deterrent for the inherited (scope-bound, reversible-in-
// spirit) operations.
//
// Two operation CLASSES are deliberately EXCLUDED from delegation inheritance
// because they are destructive / privilege-escalating and would outlast the
// delegation window: (1) user-account create/delete/deactivate, (2) any
// role/permission change, plus the takeover-class password reset. Those routes
// use requireRealRole (below) or an inline real-role check so they require the
// actor's OWN role — never an inherited one. See server/routes.ts.
//
// PARITY: for a user with no active delegations, ctx.delegators === [] so
// globalActingRoles(ctx) === { ctx.self.role } === { user.role } — byte-
// identical to the pre-flip new Set([user.role]).
const DELEGATION_REQUIREROLE_ENABLED = true;

export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = (req as any).user;
    if (!user) {
      res.status(403).json({ error: "لا تملك صلاحية" });
      return;
    }
    const ctx = req.actingContext;
    const effectiveRoles = (DELEGATION_REQUIREROLE_ENABLED && ctx)
      ? globalActingRoles(ctx)
      : new Set<string>([user.role]);
    if (!roles.some((r) => effectiveRoles.has(r))) {
      res.status(403).json({ error: "لا تملك صلاحية" });
      return;
    }
    next();
  };
}

// requireRealRole — like requireRole but NEVER delegation-expanded. It checks
// the actor's OWN (real, JWT) role only, so an inherited/delegated role can
// never satisfy it. Used for the delegation-EXCLUDED operation classes
// (user-account create / delete / deactivate, password reset) so a delegate
// cannot perform account-destruction or privilege-escalation that would outlast
// the delegation window. Behaviorally this is exactly what requireRole was
// before the flag flip — so a real branch_manager/admin_support is unaffected
// (full parity), and a delegate is blocked exactly as they were pre-4c-6.
export function requireRealRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = (req as any).user;
    if (!user) {
      res.status(403).json({ error: "لا تملك صلاحية" });
      return;
    }
    if (!roles.includes(user.role)) {
      res.status(403).json({ error: "لا تملك صلاحية" });
      return;
    }
    next();
  };
}

export function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (
    req.path === "/api/auth/login" ||
    req.path === "/api/auth/refresh" ||
    req.path === "/api/auth/logout" ||
    req.path === "/api/auth/emergency-reset" ||
    !req.path.startsWith("/api/")
  ) {
    return next();
  }

  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    const decoded = verifyToken(token);
    if (decoded) {
      (req as any).user = {
        id: decoded.userId,
        role: decoded.role,
        departmentId: decoded.departmentId,
        name: decoded.name || decoded.userId,
      };
    }
  }

  next();
}

// ==================== CSRF Protection ====================

export function generateCsrfToken(userId: string): string {
  const timestamp = Date.now().toString();
  const random = randomBytes(16).toString("hex");
  const data = `${userId}:${timestamp}:${random}`;
  const signature = createHmac("sha256", JWT_SECRET!).update(data).digest("hex");
  return `${data}:${signature}`;
}

export function verifyCsrfToken(token: string, userId: string): boolean {
  try {
    const parts = token.split(":");
    if (parts.length !== 4) return false;
    const [tokenUserId, timestamp, random, signature] = parts;
    if (tokenUserId !== userId) return false;
    const age = Date.now() - parseInt(timestamp, 10);
    if (age > 4 * 60 * 60 * 1000) return false;
    const expectedSig = createHmac("sha256", JWT_SECRET!)
      .update(`${tokenUserId}:${timestamp}:${random}`)
      .digest("hex");
    return signature === expectedSig;
  } catch {
    return false;
  }
}

export function csrfProtection(req: Request, res: Response, next: NextFunction): void {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    return next();
  }
  if (req.path === "/api/auth/login" || req.path === "/api/auth/refresh" || req.path === "/api/auth/logout" || req.path === "/api/auth/emergency-reset") {
    return next();
  }
  if (!req.path.startsWith("/api/")) {
    return next();
  }

  const user = (req as any).user;
  if (!user) {
    return next();
  }

  const csrfToken = req.headers["x-csrf-token"] as string;
  if (!csrfToken || !verifyCsrfToken(csrfToken, user.id)) {
    res.status(403).json({ error: "رمز الحماية غير صالح. أعد تحميل الصفحة" });
    return;
  }
  next();
}
