import { PrismaClient, CustomerCategory } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const pwd = await bcrypt.hash('Password123!', 10);

  // --- Users: Super Admin + one Department Admin per department ---
  const superAdmin = await prisma.user.upsert({
    where: { email: 'owner@foodstuffs.local' },
    update: {},
    create: {
      name: 'Owner / Management',
      email: 'owner@foodstuffs.local',
      passwordHash: pwd,
      role: 'STAFF',
      department: 'MANAGEMENT',
      accessLevel: 'SUPER_ADMIN',
    },
  });

  const departments = [
    'SALES',
    'CUSTOMER_SERVICE',
    'FINANCE',
    'PURCHASE',
    'WAREHOUSE',
    'DELIVERY',
    'HR',
  ] as const;

  for (const dept of departments) {
    await prisma.user.upsert({
      where: { email: `${dept.toLowerCase()}.admin@foodstuffs.local` },
      update: {},
      create: {
        name: `${dept} Admin`,
        email: `${dept.toLowerCase()}.admin@foodstuffs.local`,
        passwordHash: pwd,
        role: 'STAFF',
        department: dept,
        accessLevel: 'DEPARTMENT_ADMIN',
      },
    });
  }

  // --- Chart of Accounts (minimal) ---
  const accounts = [
    { accountCode: '1000', accountName: 'Cash', accountType: 'ASSET' as const },
    { accountCode: '1100', accountName: 'Accounts Receivable', accountType: 'ASSET' as const },
    { accountCode: '2000', accountName: 'Accounts Payable', accountType: 'LIABILITY' as const },
    { accountCode: '4000', accountName: 'Sales Revenue', accountType: 'INCOME' as const },
    { accountCode: '5000', accountName: 'Cost of Goods Sold', accountType: 'EXPENSE' as const },
  ];
  for (const a of accounts) {
    await prisma.chartOfAccounts.upsert({
      where: { accountCode: a.accountCode },
      update: {},
      create: a,
    });
  }

  // --- Warehouse ---
  const warehouse = await prisma.warehouse.upsert({
    where: { id: 'seed-wh-1' },
    update: {},
    create: { id: 'seed-wh-1', name: 'Main Warehouse', location: 'HQ' },
  });

  // --- Delivery zone + driver ---
  const driverUser = await prisma.user.upsert({
    where: { email: 'driver1@foodstuffs.local' },
    update: {},
    create: {
      name: 'Driver One',
      email: 'driver1@foodstuffs.local',
      passwordHash: pwd,
      role: 'DRIVER',
    },
  });
  const driver = await prisma.driver.upsert({
    where: { userId: driverUser.id },
    update: {},
    create: { userId: driverUser.id, status: 'AVAILABLE' },
  });
  const zone = await prisma.deliveryZone.upsert({
    where: { id: 'seed-zone-1' },
    update: { assignedDriverId: driver.id },
    create: { id: 'seed-zone-1', name: 'Central Zone', assignedDriverId: driver.id },
  });
  await prisma.driver.update({ where: { id: driver.id }, data: { assignedZoneId: zone.id } });

  // --- Products with per-category pricing ---
  const cats = Object.values(CustomerCategory);
  const products = [
    { name: 'Basmati Rice 25kg', category: 'Grains', unit: 'bag', base: 60 },
    { name: 'Sunflower Oil 5L', category: 'Oils', unit: 'case', base: 18 },
    { name: 'Tomato Paste 800g', category: 'Canned', unit: 'box', base: 12 },
  ];
  for (const p of products) {
    const existing = await prisma.product.findFirst({ where: { name: p.name } });
    if (existing) continue;
    await prisma.product.create({
      data: {
        name: p.name,
        category: p.category,
        unit: p.unit,
        stockQty: 100,
        prices: {
          create: cats.map((c, i) => ({ category: c, price: p.base + i })),
        },
      },
    });
  }

  // --- Sample customer (approved) ---
  const customerUser = await prisma.user.upsert({
    where: { email: 'shop@customer.local' },
    update: {},
    create: {
      name: 'Corner Shop',
      email: 'shop@customer.local',
      passwordHash: pwd,
      role: 'CUSTOMER',
      status: 'ACTIVE',
      customerProfile: {
        create: {
          businessName: 'Corner Shop Ltd',
          category: 'RETAIL',
          creditLimit: 5000,
          approved: true,
          addresses: { create: { line: '12 Market St', lat: 25.2, lng: 55.27, zoneId: zone.id, isDefault: true } },
        },
      },
    },
  });

  // eslint-disable-next-line no-console
  console.log('Seed complete:', {
    superAdmin: superAdmin.email,
    departmentAdmins: departments.length,
    driver: driverUser.email,
    customer: customerUser.email,
    password: 'Password123!',
  });
}

main()
  .catch((e) => {
    // eslint-disable-next-line no-console
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
