import type { PrismaClient } from '@prisma/client';

export async function seedDatabase(prisma: PrismaClient) {
  await prisma.kioskSetting.upsert({
    where: { id: 'default' },
    update: {},
    create: {
      id: 'default',
      inventoryEnabled: true
    }
  });

  await prisma.purchaseItem.deleteMany();
  await prisma.purchase.deleteMany();
  await prisma.inventoryAdjustment.deleteMany();
  await prisma.product.deleteMany();

  const now = new Date();

  const products = await prisma.product.createMany({
    data: [
      {
        id: 'demo-coffee',
        title: 'Filter Coffee',
        description: 'Freshly brewed filter coffee',
        price: '2.5',
        inventoryCount: 18,
        imageUrl: '/placeholder/coffee.png'
      },
      {
        id: 'demo-energy',
        title: 'Energy Drink',
        description: 'Cold energy drink for late-night study sessions',
        price: '3',
        inventoryCount: 9,
        imageUrl: '/placeholder/energy.png'
      }
    ]
  });

  const coffeeAdjustments = await prisma.inventoryAdjustment.create({
    data: {
      productId: 'demo-coffee',
      quantity: 18,
      reason: 'Initial stock load',
      recordedBy: 'system'
    }
  });

  const energyAdjustments = await prisma.inventoryAdjustment.create({
    data: {
      productId: 'demo-energy',
      quantity: 9,
      reason: 'Initial stock load',
      recordedBy: 'system'
    }
  });

  const purchase = await prisma.purchase.create({
    data: {
      reference: `seed-ref-${now.getTime()}`,
      status: 'PAID',
      totalAmount: '5.5',
      notes: 'Seed purchase to verify relations',
      items: {
        create: [
          {
            productId: 'demo-coffee',
            quantity: 1,
            unitPrice: '2.5'
          },
          {
            productId: 'demo-energy',
            quantity: 1,
            unitPrice: '3'
          }
        ]
      }
    }
  });

  return { products, coffeeAdjustments, energyAdjustments, purchase };
}
