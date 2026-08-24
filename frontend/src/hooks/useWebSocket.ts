import { useState, useEffect, useCallback, useRef } from 'react';

interface WebSocketMessage {
  event: string;
  data: any;
}

export function useWebSocket(url: string) {
  const [connected, setConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState<WebSocketMessage | null>(null);
  const ws = useRef<WebSocket | null>(null);
  const reconnectTimeout = useRef<number | NodeJS.Timeout>(0);
  
  const connect = useCallback(() => {
    try {
      const wsUrl = new URL(url, window.location.href);
      wsUrl.protocol = wsUrl.protocol.replace('http', 'ws');
      
      ws.current = new WebSocket(wsUrl.toString());

      ws.current.onopen = () => {
        setConnected(true);
        console.log('WebSocket connected');
      };

      ws.current.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          setLastMessage(message);
        } catch (e) {
          console.error('Failed to parse WebSocket message:', e);
        }
      };

      ws.current.onclose = () => {
        setConnected(false);
        console.log('WebSocket disconnected, attempting reconnect...');
        // Reconnect with backoff could be added here
        reconnectTimeout.current = setTimeout(connect, 3000);
      };

      ws.current.onerror = (error) => {
        console.error('WebSocket error:', error);
        ws.current?.close();
      };
    } catch (e) {
      console.error('WebSocket connection failed:', e);
    }
  }, [url]);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimeout.current) clearTimeout(reconnectTimeout.current as number);
      if (ws.current) {
        ws.current.onclose = null; // Prevent reconnect on intentional unmount
        ws.current.close();
      }
    };
  }, [connect]);

  const sendMessage = useCallback((event: string, data: any) => {
    if (ws.current && ws.current.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify({ event, data }));
    }
  }, []);

  return { connected, lastMessage, sendMessage };
}
