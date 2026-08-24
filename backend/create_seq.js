const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  await prisma.$executeRawUnsafe(`CREATE SEQUENCE IF NOT EXISTS order_number_seq START 1;`);
  console.log('Sequence created');
}

main().catch(console.error).finally(() => prisma.$disconnect());
