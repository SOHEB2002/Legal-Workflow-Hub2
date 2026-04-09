import { WebSocketServer, WebSocket } from "ws";
import type { Server } from "http";
import { verifyToken } from "./auth";
import type { IncomingMessage } from "http";

interface AuthenticatedSocket extends WebSocket {
  userId: string;
  role: string;
  isAlive: boolean;
}

// Map of userId -> Set of their connected sockets (supports multiple tabs)
const userSockets = new Map<string, Set<AuthenticatedSocket>>();

let wss: WebSocketServer;

export function setupWebSocket(httpServer: Server) {
  wss = new WebSocketServer({ server: httpServer, path: "/ws" });

  // Heartbeat every 30s to clean up dead connections
  const heartbeatInterval = setInterval(() => {
    wss.clients.forEach((ws) => {
      const sock = ws as AuthenticatedSocket;
      if (!sock.isAlive) {
        removeSocket(sock);
        return sock.terminate();
      }
      sock.isAlive = false;
      sock.ping();
    });
  }, 30_000);

  wss.on("close", () => clearInterval(heartbeatInterval));

  wss.on("connection", (ws: WebSocket, req: IncomingMessage) => {
    const sock = ws as AuthenticatedSocket;

    // Authenticate via query param: ws://host/ws?token=JWT
    const url = new URL(req.url || "", `http://${req.headers.host}`);
    const token = url.searchParams.get("token");

    if (!token) {
      sock.close(4001, "Missing token");
      return;
    }

    const decoded = verifyToken(token);
    if (!decoded) {
      sock.close(4001, "Invalid token");
      return;
    }

    sock.userId = decoded.userId;
    sock.role = decoded.role;
    sock.isAlive = true;

    // Track socket
    if (!userSockets.has(sock.userId)) {
      userSockets.set(sock.userId, new Set());
    }
    userSockets.get(sock.userId)!.add(sock);

    sock.on("pong", () => {
      sock.isAlive = true;
    });

    sock.on("close", () => {
      removeSocket(sock);
    });

    sock.on("error", () => {
      removeSocket(sock);
    });

    // Send a welcome message to confirm connection
    sock.send(JSON.stringify({ type: "connected", userId: sock.userId }));
  });

  console.log("WebSocket server initialized on /ws");
}

function removeSocket(sock: AuthenticatedSocket) {
  const sockets = userSockets.get(sock.userId);
  if (sockets) {
    sockets.delete(sock);
    if (sockets.size === 0) {
      userSockets.delete(sock.userId);
    }
  }
}

function sendToSocket(sock: AuthenticatedSocket, data: object) {
  if (sock.readyState === WebSocket.OPEN) {
    sock.send(JSON.stringify(data));
  }
}

/** Send an event to a specific user (all their tabs) */
export function sendToUser(userId: string, event: object) {
  const sockets = userSockets.get(userId);
  if (sockets) {
    sockets.forEach((sock) => sendToSocket(sock, event));
  }
}

/** Send an event to multiple users */
export function sendToUsers(userIds: string[], event: object) {
  for (const uid of userIds) {
    sendToUser(uid, event);
  }
}

/** Broadcast to all connected & authenticated clients */
export function broadcastToAll(event: object) {
  if (!wss) return;
  wss.clients.forEach((ws) => {
    const sock = ws as AuthenticatedSocket;
    if (sock.userId && sock.readyState === WebSocket.OPEN) {
      sock.send(JSON.stringify(event));
    }
  });
}

/** Broadcast to all admin-role users */
export function broadcastToAdmins(event: object) {
  const adminRoles = ["branch_manager", "admin_support", "cases_review_head", "consultations_review_head"];
  if (!wss) return;
  wss.clients.forEach((ws) => {
    const sock = ws as AuthenticatedSocket;
    if (sock.userId && adminRoles.includes(sock.role) && sock.readyState === WebSocket.OPEN) {
      sock.send(JSON.stringify(event));
    }
  });
}
