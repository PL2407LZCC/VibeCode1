import type { PrismaClient } from '@prisma/client';

type SeedPurchaseItem = {
  productId: string;
  quantity: number;
};

type SeedPurchase = {
  daysAgo: number;
  hoursAgo?: number;
  notes?: string;
  items: SeedPurchaseItem[];
};

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
  const DAY_MS = 1000 * 60 * 60 * 24;
  const HOUR_MS = 1000 * 60 * 60;
  const timestampFor = (daysAgo: number, hoursAgo = 0) =>
    new Date(now.getTime() - daysAgo * DAY_MS - hoursAgo * HOUR_MS);

  const productCatalog = [
    {
      id: 'demo-coffee',
      title: 'House Blend Coffee',
      description: 'Rich medium-roast coffee served hot or iced.',
      price: '2.50',
      inventoryCount: 54,
      imageUrl: '/placeholder/coffee.png'
    },
    {
      id: 'demo-energy',
      title: 'Lightning Energy Shot',
      description: 'High-caffeine energy shot for late-night study sessions.',
      price: '3.00',
      inventoryCount: 40,
      imageUrl: '/placeholder/energy.png'
    },
    {
      id: 'demo-sparkling',
      title: 'Citrus Sparkling Water',
      description: 'Refreshing sparkling water with natural citrus flavors.',
      price: '1.80',
      inventoryCount: 48,
      imageUrl: '/placeholder/sparkling.png'
    },
    {
      id: 'demo-protein',
      title: 'Chocolate Protein Shake',
      description: 'Ready-to-drink protein shake packed with 20g of protein.',
      price: '2.80',
      inventoryCount: 33,
      imageUrl: '/placeholder/protein.png'
    },
    {
      id: 'demo-trailmix',
      title: 'Trail Mix Snack Pack',
      description: 'Roasted nuts, dried fruit, and dark chocolate chunks.',
      price: '2.20',
      inventoryCount: 49,
      imageUrl: '/placeholder/trailmix.png'
    },
    {
      id: 'demo-sandwich',
      title: 'Turkey Club Sandwich',
      description: 'Grab-and-go sandwich with roasted turkey and fresh veggies.',
      price: '4.50',
      inventoryCount: 13,
      imageUrl: '/placeholder/sandwich.png'
    }
  ];

  const priceByProduct = Object.fromEntries(
    productCatalog.map((product) => [product.id, product.price])
  );

  const inventoryAdjustments = [
    {
      productId: 'demo-coffee',
      quantity: 60,
      reason: 'Initial delivery',
      recordedBy: 'system',
      createdAt: timestampFor(12)
    },
    {
      productId: 'demo-coffee',
      quantity: 20,
      reason: 'Weekly restock',
      recordedBy: 'manager.julia',
      createdAt: timestampFor(4, 3)
    },
    {
      productId: 'demo-coffee',
      quantity: -4,
      reason: 'Spillage adjustment',
      recordedBy: 'manager.julia',
      createdAt: timestampFor(2)
    },
    {
      productId: 'demo-energy',
      quantity: 40,
      reason: 'Initial delivery',
      recordedBy: 'system',
      createdAt: timestampFor(12)
    },
    {
      productId: 'demo-energy',
      quantity: 15,
      reason: 'Restock for event',
      recordedBy: 'manager.julia',
      createdAt: timestampFor(5, 6)
    },
    {
      productId: 'demo-sparkling',
      quantity: 70,
      reason: 'Initial delivery',
      recordedBy: 'system',
      createdAt: timestampFor(11)
    },
    {
      productId: 'demo-sparkling',
      quantity: -5,
      reason: 'Damaged cases',
      recordedBy: 'associate.lee',
      createdAt: timestampFor(3)
    },
    {
      productId: 'demo-protein',
      quantity: 30,
      reason: 'Initial delivery',
      recordedBy: 'system',
      createdAt: timestampFor(11)
    },
    {
      productId: 'demo-protein',
      quantity: 10,
      reason: 'Morning restock',
      recordedBy: 'associate.lee',
      createdAt: timestampFor(6, 2)
    },
    {
      productId: 'demo-trailmix',
      quantity: 45,
      reason: 'Initial delivery',
      recordedBy: 'system',
      createdAt: timestampFor(10)
    },
    {
      productId: 'demo-trailmix',
      quantity: 15,
      reason: 'Bulk restock',
      recordedBy: 'associate.lee',
      createdAt: timestampFor(3, 5)
    },
    {
      productId: 'demo-sandwich',
      quantity: 25,
      reason: 'Initial delivery',
      recordedBy: 'system',
      createdAt: timestampFor(8)
    },
    {
      productId: 'demo-sandwich',
      quantity: -3,
      reason: 'Expired inventory',
      recordedBy: 'manager.julia',
      createdAt: timestampFor(1, 4)
    }
  ];

  const purchaseTemplates: SeedPurchase[] = [
    {
      daysAgo: 10,
      notes: 'Morning rush order from dorm lobby.',
      items: [
        { productId: 'demo-coffee', quantity: 4 },
        { productId: 'demo-sparkling', quantity: 3 }
      ]
    },
    {
      daysAgo: 9,
      hoursAgo: 2,
      notes: 'Study group grabbed a caffeine bundle.',
      items: [
        { productId: 'demo-energy', quantity: 2 },
        { productId: 'demo-protein', quantity: 2 },
        { productId: 'demo-coffee', quantity: 2 }
      ]
    },
    {
      daysAgo: 7,
      hoursAgo: 5,
      notes: 'Outdoor club stocked up before trip.',
      items: [
        { productId: 'demo-sparkling', quantity: 5 },
        { productId: 'demo-trailmix', quantity: 4 }
      ]
    },
    {
      daysAgo: 6,
      notes: 'Lunch rush sandwich combo.',
      items: [
        { productId: 'demo-sandwich', quantity: 3 },
        { productId: 'demo-coffee', quantity: 2 }
      ]
    },
    {
      daysAgo: 5,
      hoursAgo: 4,
      notes: 'Athletics team pre-practice boost.',
      items: [
        { productId: 'demo-energy', quantity: 5 },
        { productId: 'demo-protein', quantity: 3 }
      ]
    },
    {
      daysAgo: 4,
      hoursAgo: 1,
      notes: 'Faculty meeting refreshments.',
      items: [
        { productId: 'demo-coffee', quantity: 6 },
        { productId: 'demo-trailmix', quantity: 2 },
        { productId: 'demo-sparkling', quantity: 2 }
      ]
    },
    {
      daysAgo: 3,
      notes: 'Evening commuters.',
      items: [
        { productId: 'demo-sparkling', quantity: 4 },
        { productId: 'demo-sandwich', quantity: 2 },
        { productId: 'demo-energy', quantity: 2 }
      ]
    },
    {
      daysAgo: 2,
      hoursAgo: 3,
      notes: 'Late-night study snacks.',
      items: [
        { productId: 'demo-energy', quantity: 4 },
        { productId: 'demo-coffee', quantity: 3 },
        { productId: 'demo-protein', quantity: 2 }
      ]
    },
    {
      daysAgo: 1,
      hoursAgo: 6,
      notes: 'Hackathon participants stocked up.',
      items: [
        { productId: 'demo-coffee', quantity: 5 },
        { productId: 'demo-trailmix', quantity: 3 },
        { productId: 'demo-sparkling', quantity: 3 }
      ]
    },
    {
      daysAgo: 0,
      hoursAgo: 2,
      notes: 'Morning commuters grabbed breakfast.',
      items: [
        { productId: 'demo-sandwich', quantity: 4 },
        { productId: 'demo-energy', quantity: 2 },
        { productId: 'demo-trailmix', quantity: 2 }
      ]
    }
  ];

  const { count: createdProducts } = await prisma.product.createMany({
    data: productCatalog
  });

  await prisma.inventoryAdjustment.createMany({
    data: inventoryAdjustments
  });

  const baseReference = now.getTime();
  let purchasesCreated = 0;

  for (const [index, purchaseTemplate] of purchaseTemplates.entries()) {
    const createdAt = timestampFor(purchaseTemplate.daysAgo, purchaseTemplate.hoursAgo ?? 0);

    const items = purchaseTemplate.items.map((item) => ({
      productId: item.productId,
      quantity: item.quantity,
      unitPrice: priceByProduct[item.productId]
    }));

    const totalAmount = items
      .reduce((sum, item) => sum + Number(item.unitPrice) * item.quantity, 0)
      .toFixed(2);

    await prisma.purchase.create({
      data: {
        reference: `SEED-${baseReference}-${index}`,
        status: 'PAID',
        totalAmount,
        notes: purchaseTemplate.notes,
        createdAt,
        items: {
          create: items
        }
      }
    });
    purchasesCreated += 1;
  }

  return {
    createdProducts,
    adjustmentsCreated: inventoryAdjustments.length,
    purchasesCreated
  };
}
