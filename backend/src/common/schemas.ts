import { z } from 'zod';

export const orderTypeSchema = z.enum(['B2B', 'B2C']);
export const paymentTypeSchema = z.enum(['PREPAID', 'COD']);

export const createOrderSchema = z.object({
  customerId: z.string().uuid().optional(),
  orderType: orderTypeSchema,
  paymentType: paymentTypeSchema,
  pickupAddress: z.string().min(5),
  pickupPincode: z.string().regex(/^\d{6}$/, "Must be a 6-digit pincode"),
  dropAddress: z.string().min(5),
  dropPincode: z.string().regex(/^\d{6}$/, "Must be a 6-digit pincode"),
  lengthCm: z.number().positive(),
  breadthCm: z.number().positive(),
  heightCm: z.number().positive(),
  actualWeightKg: z.number().positive(),
});

export type CreateOrderInput = z.infer<typeof createOrderSchema>;
