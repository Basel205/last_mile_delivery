import { Decimal } from 'decimal.js';

export interface RateEngineInput {
  pickupZoneId: string;
  dropZoneId: string;
  lengthCm: number;
  breadthCm: number;
  heightCm: number;
  actualWeightKg: number;
  orderType: 'B2B' | 'B2C';
  paymentType: 'PREPAID' | 'COD';
  activeRateCard: {
    id: string;
    basePrice: Decimal;
    baseWeightKg: Decimal;
    additionalPricePerKg: Decimal;
  };
  codSurchargeConfig?: {
    surchargeType: 'FLAT' | 'PERCENTAGE';
    value: Decimal;
  };
}

export function calculateCharge(input: RateEngineInput) {
  // Volumetric weight: (L × B × H) / 5000, rounded to 2dp with fixed round-half-up
  const volWeightRaw = new Decimal(input.lengthCm).mul(input.breadthCm).mul(input.heightCm).div(5000);
  const volumetricWeightKg = volWeightRaw.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  
  // Billed weight: MAX(actual_weight_kg, volumetric_weight_kg)
  const actualWeight = new Decimal(input.actualWeightKg).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  const billedWeightKg = Decimal.max(actualWeight, volumetricWeightKg);
  
  // Base charge: billed_weight_kg <= base_weight_kg ? base_price : base_price + (billed_weight_kg - base_weight_kg) × additional_price_per_kg
  let baseCharge = new Decimal(input.activeRateCard.basePrice);
  const activeBaseWeight = new Decimal(input.activeRateCard.baseWeightKg);
  const activeAdditional = new Decimal(input.activeRateCard.additionalPricePerKg);

  if (billedWeightKg.greaterThan(activeBaseWeight)) {
    const extraWeight = billedWeightKg.minus(activeBaseWeight);
    const extraCharge = extraWeight.mul(activeAdditional);
    baseCharge = baseCharge.plus(extraCharge);
  }
  
  baseCharge = baseCharge.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

  // COD surcharge: flat or percentage of base_charge, per active cod_surcharge_config; 0 if prepaid
  let codSurcharge = new Decimal(0);
  if (input.paymentType === 'COD' && input.codSurchargeConfig) {
    const configValue = new Decimal(input.codSurchargeConfig.value);
    if (input.codSurchargeConfig.surchargeType === 'FLAT') {
      codSurcharge = configValue;
    } else if (input.codSurchargeConfig.surchargeType === 'PERCENTAGE') {
      codSurcharge = baseCharge.mul(configValue).div(100);
    }
  }
  
  codSurcharge = codSurcharge.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

  // Total: base_charge + cod_surcharge
  const totalCharge = baseCharge.plus(codSurcharge);

  return {
    volumetricWeightKg: volumetricWeightKg.toNumber(),
    billedWeightKg: billedWeightKg.toNumber(),
    baseCharge: baseCharge.toNumber(),
    codSurcharge: codSurcharge.toNumber(),
    totalCharge: totalCharge.toNumber(),
    rateCardId: input.activeRateCard.id
  };
}
