import type { Request, Response, NextFunction } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { randomBytes, createHmac } from "crypto";

const JWT_SECRET = process.env.SESSION_SECRET;
if (!JWT_SECRET) {
  console.error("FATAL: SESSION_SECRET environment variable is required");
  process.exit(1);
}

const SALT_ROUNDS = 12;
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
    // Reject non-bcrypt hashes - never compare plain text
    return false;
  } catch {
    return false;
  }
}

export function generateToken(userId: string, role: string, departmentId?: string | null): string {
  return jwt.sign({ userId, role, departmentId: departmentId || null }, JWT_SECRET!, {
    expiresIn: TOKEN_EXPIRY,
  });
}

export function verifyToken(
  token: string
): { userId: string; role: string; departmentId: string | null } | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET!) as {
      userId: string;
      role: string;
      departmentId: string | null;
    };
    return { userId: decoded.userId, role: decoded.role, departmentId: decoded.departmentId || null };
  } catch {
    return null;
  }
}

export function verifyTokenForRefresh(
  token: string
): { userId: string; role: string; departmentId: string | null } | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET!, { ignoreExpiration: true }) as {
      userId: string;
      role: string;
      departmentId: string | null;
      exp?: number;
    };
    if (decoded.exp) {
      const now = Math.floor(Date.now() / 1000);
      const expiredAgo = now - decoded.exp;
      if (expiredAgo > 30 * 60) {
        return null;
      }
    }
    return { userId: decoded.userId, role: decoded.role, departmentId: decoded.departmentId || null };
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
  };
  next();
}

export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = (req as any).user;
    if (!user || !roles.includes(user.role)) {
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
    // Token valid for 4 hours
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
  // Only protect state-changing methods
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    return next();
  }
  // Skip CSRF for login and refresh (no session yet)
  if (req.path === "/api/auth/login" || req.path === "/api/auth/refresh" || req.path === "/api/auth/logout" || req.path === "/api/auth/emergency-reset") {
    return next();
  }
  // Skip non-API routes
  if (!req.path.startsWith("/api/")) {
    return next();
  }

  const user = (req as any).user;
  if (!user) {
    return next(); // requireAuth will handle unauthorized
  }

  const csrfToken = req.headers["x-csrf-token"] as string;
  if (!csrfToken || !verifyCsrfToken(csrfToken, user.id)) {
    res.status(403).json({ error: "رمز الحماية غير صالح. أعد تحميل الصفحة" });
    return;
  }
  next();
}
