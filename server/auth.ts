import type { Request, Response, NextFunction } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

// Get JWT secret from environment or use default for development
const JWT_SECRET = process.env.JWT_SECRET || "oun-law-jwt-secret-2024";
const SALT_ROUNDS = 12;
const TOKEN_EXPIRY = "24h";

/**
 * Hash a password using bcrypt with 12 salt rounds
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

/**
 * Compare a plain text password with a bcrypt hash
 */
export async function comparePassword(
  password: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/**
 * Generate a JWT token for a user
 */
export function generateToken(userId: string, role: string): string {
  return jwt.sign({ userId, role }, JWT_SECRET, {
    expiresIn: TOKEN_EXPIRY,
  });
}

/**
 * Verify a JWT token and return the decoded payload
 */
export function verifyToken(
  token: string
): { userId: string; role: string } | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as {
      userId: string;
      role: string;
      iat?: number;
      exp?: number;
    };
    return { userId: decoded.userId, role: decoded.role };
  } catch (error) {
    return null;
  }
}

/**
 * Extract token from Authorization header or auth_token cookie
 */
function extractToken(req: Request): string | null {
  // Check Authorization header first
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    return authHeader.slice(7);
  }

  // Check cookies
  const cookies = req.headers.cookie;
  if (cookies) {
    const cookieArray = cookies.split(";").map((c) => c.trim());
    for (const cookie of cookieArray) {
      if (cookie.startsWith("auth_token=")) {
        return cookie.slice(11);
      }
    }
  }

  return null;
}

/**
 * Express middleware for JWT authentication
 * Verifies token and attaches user info to req.user
 * Skips auth for /api/auth/login endpoint
 */
export function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Skip authentication for login endpoint
  if (req.path === "/api/auth/login") {
    return next();
  }

  const token = extractToken(req);

  if (!token) {
    res.status(401).json({ error: "Missing or invalid token" });
    return;
  }

  const decoded = verifyToken(token);
  if (!decoded) {
    res.status(401).json({ error: "Invalid or expired token" });
    return;
  }

  // Attach user info to request
  (req as any).user = {
    id: decoded.userId,
    role: decoded.role,
  };

  next();
}
