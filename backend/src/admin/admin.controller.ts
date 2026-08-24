import { Controller, Get, Post, Body, Patch, Param, UseGuards, Query, Delete, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JwtAuthGuard } from '../common/jwt.guard';
import { RolesGuard, Roles } from '../common/roles.guard';
import * as bcrypt from 'bcrypt';

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class AdminController {
  constructor(private readonly prisma: PrismaService) {}

  // ── Zones ──────────────────────────────────────────────────────────────────

  @Get('zones')
  async getZones() {
    return this.prisma.zone.findMany({ include: { pincodes: true } });
  }

  @Post('zones')
  async createZone(@Body() data: { name: string; code: string }) {
    return this.prisma.zone.create({ data });
  }

  @Post('zones/:id/pincodes')
  async addPincode(@Param('id') zoneId: string, @Body() data: { pincode: string }) {
    return this.prisma.zonePincode.create({ data: { zoneId, pincode: data.pincode } });
  }

  @Delete('zones/:id/pincodes/:pincode')
  async removePincode(@Param('pincode') pincode: string) {
    return this.prisma.zonePincode.delete({ where: { pincode } });
  }

  // ── Rate Cards ─────────────────────────────────────────────────────────────

  @Get('rate-cards')
  async getRateCards(@Query('active') active?: string) {
    const where: any = {};
    if (active === 'true') {
      where.OR = [{ effectiveTo: null }, { effectiveTo: { gt: new Date() } }];
    }
    return this.prisma.rateCard.findMany({ where, orderBy: { effectiveFrom: 'desc' } });
  }

  @Post('rate-cards')
  async createRateCard(@Body() data: any) {
    // Close the current active card for that (orderType, rateType) pair, then insert new one
    return this.prisma.$transaction(async (tx) => {
      await tx.rateCard.updateMany({
        where: { orderType: data.orderType, rateType: data.rateType, effectiveTo: null },
        data: { effectiveTo: new Date() },
      });
      return tx.rateCard.create({
        data: {
          orderType: data.orderType,
          rateType: data.rateType,
          basePrice: data.basePrice,
          baseWeightKg: data.baseWeightKg,
          additionalPricePerKg: data.additionalPricePerKg,
          effectiveFrom: new Date(),
          createdBy: data.createdBy,
        },
      });
    });
  }

  // ── COD Surcharge Config ───────────────────────────────────────────────────

  @Get('cod-surcharge-config')
  async getCodSurchargeConfig() {
    return this.prisma.codSurchargeConfig.findMany({ orderBy: { effectiveFrom: 'desc' } });
  }

  @Post('cod-surcharge-config')
  async createCodSurchargeConfig(@Body() data: any) {
    return this.prisma.$transaction(async (tx) => {
      await tx.codSurchargeConfig.updateMany({
        where: { orderType: data.orderType, effectiveTo: null },
        data: { effectiveTo: new Date() },
      });
      return tx.codSurchargeConfig.create({
        data: {
          orderType: data.orderType,
          surchargeType: data.surchargeType,
          value: data.value,
          effectiveFrom: new Date(),
        },
      });
    });
  }

  // ── Agents ─────────────────────────────────────────────────────────────────

  @Get('agents')
  async getAgents(@Query('status') status?: string, @Query('zoneId') zoneId?: string) {
    const where: any = {};
    if (status) where.status = status;
    if (zoneId) where.zoneId = zoneId;
    return this.prisma.agent.findMany({
      where,
      include: {
        user: { select: { name: true, email: true, phone: true } },
        zone: { select: { name: true, code: true } },
      },
    });
  }

  @Post('agents')
  async createAgent(
    @Body() data: {
      name: string;
      email: string;
      phone: string;
      password: string;
      zoneId: string;
      maxConcurrentOrders?: number;
    },
  ) {
    const existing = await this.prisma.user.findUnique({ where: { email: data.email } });
    if (existing) throw new ConflictException('An account with this email already exists');

    const passwordHash = await bcrypt.hash(data.password, 10);

    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          name: data.name,
          email: data.email,
          phone: data.phone,
          role: 'AGENT',
          passwordHash,
        },
      });
      const agent = await tx.agent.create({
        data: {
          userId: user.id,
          zoneId: data.zoneId,
          status: 'AVAILABLE',
          maxConcurrentOrders: data.maxConcurrentOrders ?? 3,
        },
        include: {
          user: { select: { name: true, email: true, phone: true } },
          zone: { select: { name: true, code: true } },
        },
      });
      return agent;
    });
  }

  @Patch('agents/:id')
  async updateAgent(
    @Param('id') id: string,
    @Body() data: { zoneId?: string; maxConcurrentOrders?: number; status?: any },
  ) {
    return this.prisma.agent.update({ where: { id }, data });
  }
}
