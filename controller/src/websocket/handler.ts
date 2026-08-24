import * as http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { logger } from '../utils/logger';

export class WebSocketHandler {
  private wss: WebSocketServer;

  constructor(server: http.Server) {
    this.wss = new WebSocketServer({ server, path: '/ws' });
    
    this.wss.on('connection', (ws: WebSocket) => {
      logger.info('New WebSocket connection');
      
      ws.on('error', (err) => {
        logger.error('WebSocket error', { error: err.message });
      });

      ws.on('close', () => {
        logger.debug('WebSocket connection closed');
      });
    });
  }

  broadcast(event: string, data: any): void {
    const message = JSON.stringify({ event, data });
    this.wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
  }

  send(clientId: string, event: string, data: any): void {
    // Basic implementation: if you needed to track clients by ID, you'd store them in a Map.
    // For now, it's just broadcast.
    logger.warn('send to specific client not implemented, use broadcast');
  }

  clientCount(): number {
    let count = 0;
    this.wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) count++;
    });
    return count;
  }
}
