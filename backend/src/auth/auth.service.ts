import { Injectable, UnauthorizedException, ConflictException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import * as jwt from 'jsonwebtoken';
import * as crypto from 'crypto';

const JWT_SECRET = process.env.JWT_SECRET || 'supersecret_lmd_jwt_key_2026';
const JWT_EXPIRES_IN = '15m';
const REFRESH_EXPIRES_DAYS = 7;

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}

  async register(dto: {
    name: string;
    email: string;
    phone: string;
    password: string;
    role?: 'CUSTOMER' | 'AGENT' | 'ADMIN';
  }) {
    const existing = await this.prisma.user.findFirst({
      where: { OR: [{ email: dto.email }, { phone: dto.phone }] },
    });
    if (existing) throw new ConflictException('Email or phone already registered');

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const user = await this.prisma.user.create({
      data: {
        name: dto.name,
        email: dto.email,
        phone: dto.phone,
        passwordHash,
        role: dto.role || 'CUSTOMER',
      },
    });

    const { accessToken, refreshToken } = await this.issueTokens(user);
    return { user: this.sanitize(user), accessToken, refreshToken };
  }

  async login(email: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { email }, include: { agent: true } });
    if (!user || !user.isActive) throw new UnauthorizedException('Invalid credentials');

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) throw new UnauthorizedException('Invalid credentials');

    const { accessToken, refreshToken } = await this.issueTokens(user);
    return { user: this.sanitize(user), accessToken, refreshToken, agentId: user.agent?.id };
  }

  async refresh(rawToken: string) {
    const tokenHash = this.hashToken(rawToken);
    const stored = await this.prisma.refreshToken.findFirst({
      where: { tokenHash },
      include: { user: { include: { agent: true } } },
    });

    if (!stored) throw new UnauthorizedException('Invalid refresh token');

    // Reuse detection: if token was already replaced, revoke whole chain
    if (stored.replacedBy) {
      await this.prisma.refreshToken.updateMany({
        where: { userId: stored.userId },
        data: { revoked: true },
      });
      throw new UnauthorizedException('Refresh token reuse detected. Please login again.');
    }

    if (stored.revoked || stored.expiresAt < new Date()) {
      throw new UnauthorizedException('Refresh token expired or revoked');
    }

    const { accessToken, refreshToken: newRawToken } = await this.issueTokens(stored.user);

    // Mark old token as replaced
    const newTokenHash = this.hashToken(newRawToken);
    const newStored = await this.prisma.refreshToken.findFirst({ where: { tokenHash: newTokenHash } });
    if (newStored) {
      await this.prisma.refreshToken.update({
        where: { id: stored.id },
        data: { replacedBy: newStored.id },
      });
    }

    return { accessToken, refreshToken: newRawToken, agentId: stored.user.agent?.id };
  }

  async logout(rawToken: string) {
    const tokenHash = this.hashToken(rawToken);
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash },
      data: { revoked: true },
    });
  }

  private async issueTokens(user: any) {
    const payload: any = { sub: user.id, role: user.role };
    if (user.agent) payload.agentId = user.agent.id;

    const accessToken = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

    const rawToken = crypto.randomBytes(40).toString('hex');
    const tokenHash = this.hashToken(rawToken);
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + REFRESH_EXPIRES_DAYS);

    await this.prisma.refreshToken.create({
      data: { userId: user.id, tokenHash, expiresAt },
    });

    return { accessToken, refreshToken: rawToken };
  }

  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  private sanitize(user: any) {
    const { passwordHash, ...rest } = user;
    return rest;
  }
}
