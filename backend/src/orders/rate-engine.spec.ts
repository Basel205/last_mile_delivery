import { calculateCharge } from './rate-engine';
import { Decimal } from 'decimal.js';

// Helper to build a minimal rate card
function makeRateCard(basePrice: number, baseWeightKg: number, additionalPricePerKg: number) {
  return {
    id: 'test-card-id',
    basePrice: new Decimal(basePrice),
    baseWeightKg: new Decimal(baseWeightKg),
    additionalPricePerKg: new Decimal(additionalPricePerKg),
  };
}

const BASE_INPUT = {
  pickupZoneId: 'zone-a',
  dropZoneId: 'zone-b',
  orderType: 'B2C' as const,
  paymentType: 'PREPAID' as const,
};

describe('Rate Engine — calculateCharge()', () => {
  describe('Volumetric weight', () => {
    it('uses volumetric weight when it exceeds actual weight', () => {
      // 30 × 20 × 15 / 5000 = 1.8 kg (volumetric) > 1 kg (actual)
      const result = calculateCharge({
        ...BASE_INPUT,
        lengthCm: 30, breadthCm: 20, heightCm: 15, actualWeightKg: 1,
        activeRateCard: makeRateCard(100, 5, 20),
      });
      expect(result.volumetricWeightKg).toBe(1.8);
      expect(result.billedWeightKg).toBe(1.8);
    });

    it('uses actual weight when it exceeds volumetric weight', () => {
      // 10 × 10 × 10 / 5000 = 0.2 kg (volumetric) < 5 kg (actual)
      const result = calculateCharge({
        ...BASE_INPUT,
        lengthCm: 10, breadthCm: 10, heightCm: 10, actualWeightKg: 5,
        activeRateCard: makeRateCard(100, 10, 20),
      });
      expect(result.volumetricWeightKg).toBe(0.2);
      expect(result.billedWeightKg).toBe(5);
    });

    it('rounds volumetric weight to 2dp with HALF_UP', () => {
      // 11 × 11 × 11 / 5000 = 1331/5000 = 0.2662 → rounds to 0.27
      const result = calculateCharge({
        ...BASE_INPUT,
        lengthCm: 11, breadthCm: 11, heightCm: 11, actualWeightKg: 0.1,
        activeRateCard: makeRateCard(100, 5, 10),
      });
      expect(result.volumetricWeightKg).toBe(0.27);
    });
  });

  describe('Base charge calculation', () => {
    it('charges only base price when billed weight is within slab', () => {
      // billed = 1.8 kg, base = 5 kg → no extra charge
      const result = calculateCharge({
        ...BASE_INPUT,
        lengthCm: 30, breadthCm: 20, heightCm: 15, actualWeightKg: 1,
        activeRateCard: makeRateCard(100, 5, 20),
      });
      expect(result.baseCharge).toBe(100);
    });

    it('charges exactly base price when billed weight equals slab boundary', () => {
      // billed = 5 kg, base = 5 kg → no extra (<=, not <)
      const result = calculateCharge({
        ...BASE_INPUT,
        lengthCm: 10, breadthCm: 10, heightCm: 10, actualWeightKg: 5,
        activeRateCard: makeRateCard(150, 5, 25),
      });
      expect(result.baseCharge).toBe(150);
    });

    it('adds extra charge for weight beyond slab', () => {
      // billed = 8 kg, base = 5 kg → base_price + (8-5) * 20 = 200 + 60 = 260
      const result = calculateCharge({
        ...BASE_INPUT,
        lengthCm: 10, breadthCm: 10, heightCm: 10, actualWeightKg: 8,
        activeRateCard: makeRateCard(200, 5, 20),
      });
      expect(result.billedWeightKg).toBe(8);
      expect(result.baseCharge).toBe(260);
    });
  });

  describe('COD surcharge', () => {
    it('applies no surcharge for PREPAID orders', () => {
      const result = calculateCharge({
        ...BASE_INPUT,
        paymentType: 'PREPAID',
        lengthCm: 10, breadthCm: 10, heightCm: 10, actualWeightKg: 2,
        activeRateCard: makeRateCard(100, 5, 10),
        codSurchargeConfig: { surchargeType: 'FLAT', value: new Decimal(50) },
      });
      expect(result.codSurcharge).toBe(0);
    });

    it('applies flat COD surcharge correctly', () => {
      const result = calculateCharge({
        ...BASE_INPUT,
        paymentType: 'COD',
        lengthCm: 10, breadthCm: 10, heightCm: 10, actualWeightKg: 2,
        activeRateCard: makeRateCard(100, 5, 10),
        codSurchargeConfig: { surchargeType: 'FLAT', value: new Decimal(30) },
      });
      expect(result.codSurcharge).toBe(30);
      expect(result.totalCharge).toBe(130);
    });

    it('applies percentage COD surcharge correctly', () => {
      // base = 100, 10% of 100 = 10
      const result = calculateCharge({
        ...BASE_INPUT,
        paymentType: 'COD',
        lengthCm: 10, breadthCm: 10, heightCm: 10, actualWeightKg: 2,
        activeRateCard: makeRateCard(100, 5, 10),
        codSurchargeConfig: { surchargeType: 'PERCENTAGE', value: new Decimal(10) },
      });
      expect(result.codSurcharge).toBe(10);
      expect(result.totalCharge).toBe(110);
    });

    it('applies no surcharge when no codSurchargeConfig is provided for PREPAID', () => {
      const result = calculateCharge({
        ...BASE_INPUT,
        paymentType: 'PREPAID',
        lengthCm: 10, breadthCm: 10, heightCm: 10, actualWeightKg: 2,
        activeRateCard: makeRateCard(200, 5, 10),
      });
      expect(result.codSurcharge).toBe(0);
      expect(result.totalCharge).toBe(200);
    });
  });

  describe('Total charge', () => {
    it('computes totalCharge as baseCharge + codSurcharge', () => {
      // base = 100, COD flat 25 → total = 125
      const result = calculateCharge({
        ...BASE_INPUT,
        paymentType: 'COD',
        lengthCm: 10, breadthCm: 10, heightCm: 10, actualWeightKg: 2,
        activeRateCard: makeRateCard(100, 5, 20),
        codSurchargeConfig: { surchargeType: 'FLAT', value: new Decimal(25) },
      });
      expect(result.totalCharge).toBe(result.baseCharge + result.codSurcharge);
      expect(result.totalCharge).toBe(125);
    });

    it('returns the rateCardId from the active card', () => {
      const result = calculateCharge({
        ...BASE_INPUT,
        lengthCm: 10, breadthCm: 10, heightCm: 10, actualWeightKg: 2,
        activeRateCard: makeRateCard(100, 5, 20),
      });
      expect(result.rateCardId).toBe('test-card-id');
    });
  });
});
