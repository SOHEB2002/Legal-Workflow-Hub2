import { useEffect, useRef, useCallback, useState } from "react";

export type WSEventType =
  | "connected"
  | "notification:new"
  | "notification:updated"
  | "notification:deleted"
  | "notification:all-read";

export interface WSEvent {
  type: WSEventType;
  payload?: any;
}

type WSEventHandler = (event: WSEvent) => void;

const RECONNECT_DELAYS = [1000, 2000, 4000, 8000, 15000, 30000]; // exponential backoff, max 30s

export function useWebSocket(onEvent: WSEventHandler) {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttempt = useRef(0);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onEventRef = useRef(onEvent);
  const [isConnected, setIsConnected] = useState(false);

  // Keep callback ref current without re-triggering effect
  onEventRef.current = onEvent;

  const connect = useCallback(() => {
    const token = localStorage.getItem("lawfirm_token");
    if (!token) return;

    // Clean up any existing connection
    if (wsRef.current) {
      wsRef.current.onclose = null;
      wsRef.current.close();
    }

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws?token=${encodeURIComponent(token)}`);

    ws.onopen = () => {
      reconnectAttempt.current = 0;
      setIsConnected(true);
    };

    ws.onmessage = (e) => {
      try {
        const event: WSEvent = JSON.parse(e.data);
        onEventRef.current(event);
      } catch {
        // ignore malformed messages
      }
    };

    ws.onclose = (e) => {
      setIsConnected(false);
      wsRef.current = null;

      // Don't reconnect if closed intentionally (4001 = auth failure)
      if (e.code === 4001) return;

      // Schedule reconnect with exponential backoff
      const delay = RECONNECT_DELAYS[Math.min(reconnectAttempt.current, RECONNECT_DELAYS.length - 1)];
      reconnectAttempt.current += 1;
      reconnectTimer.current = setTimeout(connect, delay);
    };

    ws.onerror = () => {
      // onclose will fire after this, triggering reconnect
    };

    wsRef.current = ws;
  }, []);

  useEffect(() => {
    connect();

    return () => {
      if (reconnectTimer.current) {
        clearTimeout(reconnectTimer.current);
      }
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
        wsRef.current = null;
      }
      setIsConnected(false);
    };
  }, [connect]);

  return { isConnected };
}
