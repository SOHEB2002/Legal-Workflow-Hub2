import type { Request, Response, NextFunction } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.SESSION_SECRET || "oun-law-jwt-secret-2024";
const SALT_ROUNDS = 12;
const TOKEN_EXPIRY = "24h";

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
  return jwt.sign({ userId, role, departmentId: departmentId || null }, JWT_SECRET, {
    expiresIn: TOKEN_EXPIRY,
  });
}

export function verifyToken(
  token: string
): { userId: string; role: string; departmentId: string | null } | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as {
      userId: string;
      role: string;
      departmentId: string | null;
    };
    return { userId: decoded.userId, role: decoded.role, departmentId: decoded.departmentId || null };
  } catch {
    return null;
  }
}

export function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (
    req.path === "/api/auth/login" ||
    req.path === "/api/auth/register" ||
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
