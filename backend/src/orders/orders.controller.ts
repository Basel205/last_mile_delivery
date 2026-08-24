import {
  Controller, Post, Body, Headers, Get, Param, Query, Patch,
  UseGuards, Req, HttpCode, HttpStatus
} from '@nestjs/common';
import { OrdersService } from './orders.service';
import { OrderStatusService } from './order-status.service';
import { RescheduleService } from './reschedule.service';
import { AssignmentService } from '../assignment/assignment.service';
import { createOrderSchema, type CreateOrderInput } from '../common/schemas';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { JwtAuthGuard } from '../common/jwt.guard';
import { RolesGuard, Roles } from '../common/roles.guard';

@Controller('orders')
export class OrdersController {
  constructor(
    private readonly ordersService: OrdersService,
    private readonly orderStatusService: OrderStatusService,
    private readonly rescheduleService: RescheduleService,
    private readonly assignmentService: AssignmentService,
  ) {}

  // Public: preview charge before creating order
  @Post('preview-charge')
  @UseGuards(JwtAuthGuard)
  async previewCharge(@Body() body: any) {
    // Validate manually so preview doesn't require strict customerId
    const parsed = createOrderSchema.safeParse(body);
    if (!parsed.success) return { message: 'Validation failed', errors: parsed.error.flatten() };
    return this.ordersService.previewCharge(parsed.data);
  }

  // Create order (customer or admin on behalf of customer)
  @Post()
  @UseGuards(JwtAuthGuard)
  async createOrder(
    @Body() body: any,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() req: any,
  ) {
    const parsed = createOrderSchema.safeParse(body);
    if (!parsed.success) return { message: 'Validation failed', errors: parsed.error.flatten() };
    return this.ordersService.createOrder(
      parsed.data,
      idempotencyKey || null,
      req.user.sub,
      req.user.role,
    );
  }

  // List orders — role-scoped
  @Get()
  @UseGuards(JwtAuthGuard)
  async getOrders(
    @Req() req: any,
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.ordersService.getOrders(
      req.user.role,
      req.user.sub,
      req.user.agentId || null,
      { status, page: page ? parseInt(page) : 1, pageSize: pageSize ? parseInt(pageSize) : 20 },
    );
  }

  // Get single order (IDOR-safe)
  @Get(':id')
  @UseGuards(JwtAuthGuard)
  async getOrder(@Param('id') id: string, @Req() req: any) {
    return this.ordersService.getOrderById(id, req.user.role, req.user.sub, req.user.agentId || null);
  }

  // Get tracking timeline
  @Get(':id/tracking')
  @UseGuards(JwtAuthGuard)
  async getTracking(@Param('id') id: string, @Req() req: any) {
    return this.ordersService.getTracking(id, req.user.role, req.user.sub, req.user.agentId || null);
  }

  // Update status (agent or admin)
  @Patch(':id/status')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('AGENT', 'ADMIN')
  async updateStatus(
    @Param('id') id: string,
    @Body() body: { status: string; note?: string; lat?: number; lng?: number; cancellationReason?: string },
    @Req() req: any,
  ) {
    return this.orderStatusService.updateStatus(
      id,
      body.status as any,
      req.user.sub,
      req.user.role,
      body.note,
      body.lat,
      body.lng,
      body.cancellationReason,
    );
  }

  // Cancel order
  @Post(':id/cancel')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async cancelOrder(
    @Param('id') id: string,
    @Body() body: { cancellationReason: string },
    @Req() req: any,
  ) {
    return this.orderStatusService.updateStatus(
      id,
      'CANCELLED' as any,
      req.user.sub,
      req.user.role,
      undefined,
      undefined,
      undefined,
      body.cancellationReason,
    );
  }

  // Reschedule (customer or admin after FAILED)
  @Post(':id/reschedule')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async reschedule(
    @Param('id') id: string,
    @Body() body: { newScheduledDate: string },
    @Req() req: any,
  ) {
    const newDate = new Date(body.newScheduledDate);
    return this.rescheduleService.requestReschedule(id, newDate, req.user.sub, req.user.role);
  }

  // Manual assign (admin only)
  @Patch(':id/assign')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  async manualAssign(
    @Param('id') id: string,
    @Body() body: { agentId: string },
    @Req() req: any,
  ) {
    return this.ordersService.manualAssign(id, body.agentId, req.user.sub);
  }

  // Auto-assign (admin only)
  @Post(':id/auto-assign')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @HttpCode(HttpStatus.OK)
  async autoAssign(@Param('id') id: string) {
    await this.assignmentService.autoAssign(id);
    return { message: 'Auto-assignment triggered' };
  }
}
