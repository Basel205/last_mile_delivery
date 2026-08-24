import { Injectable, BadRequestException, NotFoundException, ConflictException, ForbiddenException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { type CreateOrderInput } from '../common/schemas';
import { calculateCharge, RateEngineInput } from './rate-engine';
import { AssignmentService } from '../assignment/assignment.service';
import * as https from 'https';

// Maps Indian state names (from India Post API) → zone codes in the DB.
// Unmapped states get their own auto-created zone.
const STATE_TO_ZONE: Record<string, { code: string; name: string }> = {
  // South
  'Karnataka':          { code: 'SOUTH', name: 'South Zone' },
  'Tamil Nadu':         { code: 'SOUTH', name: 'South Zone' },
  'Kerala':             { code: 'SOUTH', name: 'South Zone' },
  'Andhra Pradesh':     { code: 'SOUTH', name: 'South Zone' },
  'Telangana':          { code: 'SOUTH', name: 'South Zone' },
  'Puducherry':         { code: 'SOUTH', name: 'South Zone' },
  // North
  'Delhi':              { code: 'NORTH', name: 'North Zone' },
  'Haryana':            { code: 'NORTH', name: 'North Zone' },
  'Punjab':             { code: 'NORTH', name: 'North Zone' },
  'Himachal Pradesh':   { code: 'NORTH', name: 'North Zone' },
  'Uttarakhand':        { code: 'NORTH', name: 'North Zone' },
  'Chandigarh':         { code: 'NORTH', name: 'North Zone' },
  'Jammu and Kashmir':  { code: 'NORTH', name: 'North Zone' },
  'Ladakh':             { code: 'NORTH', name: 'North Zone' },
  // West
  'Maharashtra':        { code: 'WEST', name: 'West Zone' },
  'Goa':                { code: 'WEST', name: 'West Zone' },
  'Gujarat':            { code: 'WEST', name: 'West Zone' },
  'Rajasthan':          { code: 'WEST', name: 'West Zone' },
  'Dadra and Nagar Haveli and Daman and Diu': { code: 'WEST', name: 'West Zone' },
  // East
  'West Bengal':        { code: 'EAST', name: 'East Zone' },
  'Odisha':             { code: 'EAST', name: 'East Zone' },
  'Bihar':              { code: 'EAST', name: 'East Zone' },
  'Jharkhand':          { code: 'EAST', name: 'East Zone' },
  'Assam':              { code: 'EAST', name: 'East Zone' },
  'Meghalaya':          { code: 'EAST', name: 'East Zone' },
  'Manipur':            { code: 'EAST', name: 'East Zone' },
  'Mizoram':            { code: 'EAST', name: 'East Zone' },
  'Nagaland':           { code: 'EAST', name: 'East Zone' },
  'Tripura':            { code: 'EAST', name: 'East Zone' },
  'Arunachal Pradesh':  { code: 'EAST', name: 'East Zone' },
  'Sikkim':             { code: 'EAST', name: 'East Zone' },
  'Andaman and Nicobar Islands': { code: 'EAST', name: 'East Zone' },
  // Central
  'Uttar Pradesh':      { code: 'CENTRAL', name: 'Central Zone' },
  'Madhya Pradesh':     { code: 'CENTRAL', name: 'Central Zone' },
  'Chhattisgarh':       { code: 'CENTRAL', name: 'Central Zone' },
};

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly assignmentService: AssignmentService,
  ) {}

  async previewCharge(input: CreateOrderInput) {
    return this.runRateEngine(input);
  }

  async createOrder(
    input: CreateOrderInput,
    idempotencyKey: string | null,
    actorId: string | null,
    actorRole: 'CUSTOMER' | 'ADMIN' = 'CUSTOMER',
  ) {
    const customerId = actorRole === 'CUSTOMER' ? actorId : (input.customerId || null);

    if (customerId && idempotencyKey) {
      const existing = await this.prisma.order.findUnique({
        where: { customerId_idempotencyKey: { customerId, idempotencyKey } },
      });
      if (existing) return existing;
    }

    const rateResult = await this.runRateEngine(input);

    try {
      const order = await this.prisma.$transaction(async (tx) => {
        const newOrder = await tx.order.create({
          data: {
            idempotencyKey,
            customerId,
            createdBy: actorId,
            orderType: input.orderType,
            paymentType: input.paymentType,
            pickupAddress: input.pickupAddress,
            pickupPincode: input.pickupPincode,
            pickupZoneId: rateResult.pickupZoneId,
            dropAddress: input.dropAddress,
            dropPincode: input.dropPincode,
            dropZoneId: rateResult.dropZoneId,
            lengthCm: input.lengthCm,
            breadthCm: input.breadthCm,
            heightCm: input.heightCm,
            actualWeightKg: input.actualWeightKg,
            volumetricWeightKg: rateResult.charge.volumetricWeightKg,
            billedWeightKg: rateResult.charge.billedWeightKg,
            rateCardId: rateResult.charge.rateCardId,
            baseCharge: rateResult.charge.baseCharge,
            codSurcharge: rateResult.charge.codSurcharge,
            totalCharge: rateResult.charge.totalCharge,
            status: 'CREATED',
          },
        });

        await tx.orderTrackingEvent.create({
          data: {
            orderId: newOrder.id,
            status: 'CREATED',
            actorId,
            actorRole,
            note: 'Order created',
          },
        });

        return newOrder;
      });

      // Trigger auto-assignment asynchronously (non-blocking)
      this.assignmentService.autoAssign(order.id).catch(() => {});

      return order;
    } catch (e: any) {
      if (e.code === 'P2002') throw new ConflictException('Idempotency key already used');
      throw e;
    }
  }

  async getOrders(
    role: string,
    userId: string,
    agentId: string | null,
    filters: { status?: string; page?: number; pageSize?: number },
  ) {
    const page = filters.page || 1;
    const pageSize = Math.min(filters.pageSize || 20, 100);
    const skip = (page - 1) * pageSize;

    const where: any = {};
    if (role === 'CUSTOMER') where.customerId = userId;
    else if (role === 'AGENT' && agentId) where.assignedAgentId = agentId;
    if (filters.status) where.status = filters.status;

    const [orders, total] = await Promise.all([
      this.prisma.order.findMany({
        where, skip, take: pageSize,
        orderBy: { createdAt: 'desc' },
        include: {
          pickupZone: { select: { name: true } },
          dropZone: { select: { name: true } },
          assignedAgent: { include: { user: { select: { name: true } } } },
          customer: { select: { name: true } },
        },
      }),
      this.prisma.order.count({ where }),
    ]);

    return { orders, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  }

  async getOrderById(id: string, role: string, userId: string, agentId: string | null) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: {
        pickupZone: true,
        dropZone: true,
        assignedAgent: { include: { user: { select: { name: true, email: true, phone: true } } } },
        customer: { select: { name: true, email: true, phone: true } },
        rateCard: true,
      },
    });

    if (!order) throw new NotFoundException('Order not found');
    if (role === 'CUSTOMER' && order.customerId !== userId) throw new ForbiddenException('Access denied');
    if (role === 'AGENT' && order.assignedAgentId !== agentId) throw new ForbiddenException('Access denied');

    return order;
  }

  async getTracking(orderId: string, role: string, userId: string, agentId: string | null) {
    const order = await this.getOrderById(orderId, role, userId, agentId);
    const events = await this.prisma.orderTrackingEvent.findMany({
      where: { orderId },
      orderBy: { createdAt: 'asc' },
      include: { actor: { select: { name: true, role: true } } },
    });
    return { order, events };
  }

  async manualAssign(orderId: string, agentId: string, adminId: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Order not found');
    const agent = await this.prisma.agent.findUnique({ where: { id: agentId } });
    if (!agent) throw new NotFoundException('Agent not found');

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.order.update({
        where: { id: orderId },
        data: { assignedAgentId: agentId, assignmentType: 'MANUAL', statusVersion: { increment: 1 } },
      });
      await tx.orderTrackingEvent.create({
        data: {
          orderId,
          status: order.status,
          actorId: adminId,
          actorRole: 'ADMIN',
          note: `Manually assigned to agent ${agentId}`,
        },
      });
      const activeOrders = await tx.order.count({
        where: { assignedAgentId: agentId, status: { notIn: ['DELIVERED', 'FAILED', 'CANCELLED'] } },
      });
      if (activeOrders >= agent.maxConcurrentOrders) {
        await tx.agent.update({ where: { id: agentId }, data: { status: 'ON_DELIVERY' } });
      }
      return updated;
    });
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Private helpers
  // ─────────────────────────────────────────────────────────────────────────────

  private async runRateEngine(input: CreateOrderInput) {
    const [pickupZoneId, dropZoneId] = await Promise.all([
      this.resolveZoneForPincode(input.pickupPincode),
      this.resolveZoneForPincode(input.dropPincode),
    ]);

    const rateType = pickupZoneId === dropZoneId ? 'INTRA_ZONE' : 'INTER_ZONE';

    const activeRateCard = await this.prisma.rateCard.findFirst({
      where: {
        orderType: input.orderType,
        rateType,
        effectiveFrom: { lte: new Date() },
        OR: [{ effectiveTo: null }, { effectiveTo: { gt: new Date() } }],
      },
      orderBy: { effectiveFrom: 'desc' },
    });

    if (!activeRateCard) {
      throw new BadRequestException(
        `No active rate card found for ${input.orderType} ${rateType}. Ask an admin to create one.`,
      );
    }

    let codSurchargeConfig = null;
    if (input.paymentType === 'COD') {
      codSurchargeConfig = await this.prisma.codSurchargeConfig.findFirst({
        where: {
          orderType: input.orderType,
          effectiveFrom: { lte: new Date() },
          OR: [{ effectiveTo: null }, { effectiveTo: { gt: new Date() } }],
        },
        orderBy: { effectiveFrom: 'desc' },
      });
      if (!codSurchargeConfig) {
        throw new BadRequestException('No active COD surcharge config found for this order type.');
      }
    }

    const engineInput: RateEngineInput = {
      pickupZoneId,
      dropZoneId,
      lengthCm: input.lengthCm,
      breadthCm: input.breadthCm,
      heightCm: input.heightCm,
      actualWeightKg: input.actualWeightKg,
      orderType: input.orderType,
      paymentType: input.paymentType,
      activeRateCard,
      codSurchargeConfig: codSurchargeConfig
        ? { surchargeType: codSurchargeConfig.surchargeType, value: codSurchargeConfig.value }
        : undefined,
    };

    return { pickupZoneId, dropZoneId, charge: calculateCharge(engineInput) };
  }

  /**
   * Resolves a pincode to a zone ID using a 3-step process:
   *
   * 1. Check zone_pincodes table (instant cache hit).
   * 2. If missing, call India Post public API to identify the state.
   * 3. Upsert the correct zone by state, cache pincode → zone, return zone ID.
   *
   * Any valid Indian pincode will work — no manual admin setup needed.
   */
  private async resolveZoneForPincode(pincode: string): Promise<string> {
    // Step 1: Cache hit — already mapped
    const existing = await this.prisma.zonePincode.findUnique({ where: { pincode } });
    if (existing) return existing.zoneId;

    // Step 2: Resolve via India Post API
    this.logger.log(`Pincode ${pincode} not cached — resolving via India Post API…`);
    let state: string;
    let district: string;
    try {
      const data = await this.fetchIndiaPostPincode(pincode);
      state = data.State;
      district = data.District;
      this.logger.log(`Resolved pincode ${pincode} → ${district}, ${state}`);
    } catch {
      throw new BadRequestException(
        `Pincode ${pincode} is invalid or unrecognised. Please verify and try again.`,
      );
    }

    // Step 3: Find or auto-create the zone for this state
    const zoneMeta = STATE_TO_ZONE[state] ?? {
      code: state.toUpperCase().replace(/\s+/g, '_').slice(0, 20),
      name: `${state} Zone`,
    };

    const zone = await this.prisma.zone.upsert({
      where: { code: zoneMeta.code },
      update: {},
      create: { name: zoneMeta.name, code: zoneMeta.code, isActive: true },
    });

    // Cache the mapping (ignore unique-constraint errors from concurrent requests)
    try {
      await this.prisma.zonePincode.create({ data: { pincode, zoneId: zone.id } });
      this.logger.log(`Auto-mapped pincode ${pincode} → zone "${zone.name}"`);
    } catch {
      // Already inserted by a concurrent request — that's fine
    }

    return zone.id;
  }

  /** Hits the free India Post API and returns the first PostOffice record. */
  private fetchIndiaPostPincode(
    pincode: string,
  ): Promise<{ State: string; District: string; Name: string }> {
    return new Promise((resolve, reject) => {
      const req = https.get(
        `https://api.postalpincode.in/pincode/${pincode}`,
        { timeout: 5000 },
        (res) => {
          let body = '';
          res.on('data', (chunk) => (body += chunk));
          res.on('end', () => {
            try {
              const parsed = JSON.parse(body);
              if (
                !parsed[0] ||
                parsed[0].Status !== 'Success' ||
                !parsed[0].PostOffice?.length
              ) {
                return reject(new Error(`Invalid pincode: ${pincode}`));
              }
              resolve(parsed[0].PostOffice[0]);
            } catch {
              reject(new Error('Failed to parse India Post API response'));
            }
          });
        },
      );
      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('India Post API timed out'));
      });
    });
  }
}
