import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'supersecret_lmd_jwt_key_2026';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const authHeader: string = req.headers['authorization'] || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

    if (!token) throw new UnauthorizedException('Missing access token');

    try {
      const decoded = jwt.verify(token, JWT_SECRET) as any;
      req.user = decoded; // { sub, role, agentId? }
      return true;
    } catch {
      throw new UnauthorizedException('Invalid or expired access token');
    }
  }
}
