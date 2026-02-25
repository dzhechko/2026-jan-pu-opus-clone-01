import { PrismaClient, PlanId } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // Plans are enum-based, no need to seed separate table
  // Create a test user
  await prisma.user.upsert({
    where: { email: 'test@clipmaker.ru' },
    update: {},
    create: {
      email: 'test@clipmaker.ru',
      name: 'Тест Пользователь',
      emailVerified: true,
      planId: PlanId.free,
      minutesLimit: 30,
    },
  });

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
