import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Injectable, Logger } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';

@Injectable()
@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
export class EventsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(EventsGateway.name);

  handleConnection(client: Socket) {
    const token = client.handshake.auth?.token;
    if (!token) {
      this.logger.warn(`Client disconnected (no token): ${client.id}`);
      client.disconnect();
      return;
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'supersecret_lmd_jwt_key_2026') as any;
      client.data.user = decoded; // { sub: userId, role: 'CUSTOMER'|'AGENT'|'ADMIN', agentId?: string }
      this.logger.log(`Client connected: ${client.id} - ${decoded.role}`);
      
      // Auto-join specific rooms based on role
      if (decoded.role === 'CUSTOMER') {
        client.join(`customer:${decoded.sub}`);
      } else if (decoded.role === 'AGENT' && decoded.agentId) {
        client.join(`agent:${decoded.agentId}`);
      } else if (decoded.role === 'ADMIN') {
        client.join('admin:all');
      }
    } catch (e) {
      this.logger.warn(`Client disconnected (invalid token): ${client.id}`);
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  // Called by OrderStatusService and AssignmentService when state changes
  notifyOrderUpdate(orderId: string, eventName: string, data: any) {
    // Notify anyone watching the order page directly
    this.server.to(`order:${orderId}`).emit(eventName, data);
    
    // Also notify admins
    this.server.to('admin:all').emit(eventName, data);
    
    // Notify specific customer or agent based on data (caller should handle resolving this or we just emit to order room and clients join it)
  }
}
