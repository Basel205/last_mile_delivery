import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

// Pre-hashed value of "demo1234" (10 rounds) — generated at seed time
const DEMO_PASSWORD = 'demo1234';

async function main() {
  // Create btree_gist extension and rate card exclusion constraint
  try {
    await prisma.$executeRawUnsafe(`CREATE EXTENSION IF NOT EXISTS btree_gist;`);
    console.log('Created btree_gist extension');
  } catch (e) {
    console.log('Skipped btree_gist extension creation (might already exist or lack permissions)');
  }

  try {
    await prisma.$executeRawUnsafe(`
      ALTER TABLE rate_cards ADD CONSTRAINT no_overlapping_rate_cards
      EXCLUDE USING gist (
        order_type WITH =, rate_type WITH =,
        tstzrange(effective_from, COALESCE(effective_to, 'infinity')) WITH &&
      );
    `);
    console.log('Created no_overlapping_rate_cards constraint');
  } catch (e) {
    console.log('Skipped no_overlapping_rate_cards constraint creation (might already exist)');
  }

  // Create order sequence
  try {
    await prisma.$executeRawUnsafe(`CREATE SEQUENCE order_number_seq START 1;`);
    console.log('Created order_number_seq sequence');
  } catch (e) {
    console.log('Skipped order_number_seq sequence creation (might already exist)');
  }

  // Seed sample data
  console.log('Seeding data...');

  // Generate real bcrypt hash for demo accounts
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);

  // Add initial zones
  const zone = await prisma.zone.upsert({
    where: { code: 'SOUTH' },
    update: {},
    create: {
      name: 'South Zone',
      code: 'SOUTH',
      isActive: true,
      pincodes: {
        create: [
          { pincode: '560001' },
          { pincode: '560002' }
        ]
      }
    }
  });

  const zone2 = await prisma.zone.upsert({
    where: { code: 'NORTH' },
    update: {},
    create: {
      name: 'North Zone',
      code: 'NORTH',
      isActive: true,
      pincodes: {
        create: [
          { pincode: '110001' },
          { pincode: '110002' }
        ]
      }
    }
  });

  // Add initial users
  const admin = await prisma.user.upsert({
    where: { email: 'admin@lmd.test' },
    update: { passwordHash },
    create: {
      name: 'Admin User',
      email: 'admin@lmd.test',
      phone: '+919999999999',
      role: 'ADMIN',
      passwordHash,
    }
  });

  const customer = await prisma.user.upsert({
    where: { email: 'customer@lmd.test' },
    update: { passwordHash },
    create: {
      name: 'Demo Customer',
      email: 'customer@lmd.test',
      phone: '+919999999998',
      role: 'CUSTOMER',
      passwordHash,
    }
  });

  const agentUser = await prisma.user.upsert({
    where: { email: 'agent1@lmd.test' },
    update: { passwordHash },
    create: {
      name: 'Agent One',
      email: 'agent1@lmd.test',
      phone: '+919999999997',
      role: 'AGENT',
      passwordHash,
      agent: {
        create: {
          zoneId: zone.id,
          status: 'AVAILABLE',
          maxConcurrentOrders: 3,
        }
      }
    }
  });

  // Rate Cards
  try {
    await prisma.rateCard.create({
      data: {
        orderType: 'B2C',
        rateType: 'INTRA_ZONE',
        basePrice: 50,
        baseWeightKg: 2,
        additionalPricePerKg: 20,
        effectiveFrom: new Date(),
        createdBy: admin.id
      }
    });
    console.log('Created B2C INTRA_ZONE rate card');
  } catch(e) {
    console.log('Skipped creating B2C INTRA_ZONE rate card (likely already exists)');
  }

  try {
    await prisma.rateCard.create({
      data: {
        orderType: 'B2C',
        rateType: 'INTER_ZONE',
        basePrice: 100,
        baseWeightKg: 2,
        additionalPricePerKg: 40,
        effectiveFrom: new Date(),
        createdBy: admin.id
      }
    });
    console.log('Created B2C INTER_ZONE rate card');
  } catch(e) {
    console.log('Skipped creating B2C INTER_ZONE rate card (likely already exists)');
  }

  try {
    await prisma.codSurchargeConfig.create({
      data: {
        orderType: 'B2C',
        surchargeType: 'FLAT',
        value: 50,
        effectiveFrom: new Date()
      }
    });
    console.log('Created B2C COD Surcharge Config');
  } catch(e) {
    console.log('Skipped creating COD Surcharge Config');
  }

  console.log('Seeding complete.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
