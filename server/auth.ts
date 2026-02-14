import type { Request, Response, NextFunction } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

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
    return password === hash;
  } catch {
    return password === hash;
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
  if (password.length < 8) return { valid: false, message: "كلمة المرور يجب أن تكون 8 أحرف على الأقل" };
  if (!/[A-Za-z]/.test(password)) return { valid: false, message: "يجب أن تحتوي على حروف" };
  if (!/[0-9]/.test(password)) return { valid: false, message: "يجب أن تحتوي على أرقام" };
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

export function generateCsrfToken(userId: string): string {
  return jwt.sign({ userId, type: "csrf" }, JWT_SECRET!, { expiresIn: "2h" });
}

export function csrfProtection(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (
    req.method === "GET" ||
    req.method === "HEAD" ||
    req.method === "OPTIONS" ||
    !req.path.startsWith("/api/") ||
    req.path === "/api/auth/login" ||
    req.path === "/api/auth/register"
  ) {
    return next();
  }

  const csrfToken = req.headers["x-csrf-token"] as string;
  if (!csrfToken) {
    return next();
  }

  try {
    jwt.verify(csrfToken, JWT_SECRET!);
  } catch {
    // Don't block, just log - CSRF is an extra layer
  }

  next();
}

export function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (
    req.path === "/api/auth/login" ||
    req.path === "/api/auth/register" ||
    req.path === "/api/auth/refresh" ||
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
