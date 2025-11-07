import prisma from '../lib/prisma';

const DEFAULT_CONFIG = {
  currency: 'EUR' as const,
  paymentProvider: 'mobilepay' as const
};

export async function getKioskConfig() {
  const setting = await prisma.kioskSetting.findUnique({ where: { id: 'default' } });

  if (!setting) {
    const created = await prisma.kioskSetting.create({ data: { id: 'default', inventoryEnabled: true } });
    return {
      ...DEFAULT_CONFIG,
      inventoryEnabled: created.inventoryEnabled
    };
  }

  return {
    ...DEFAULT_CONFIG,
    inventoryEnabled: setting.inventoryEnabled
  };
}

export async function setInventoryEnabled(inventoryEnabled: boolean) {
  const updated = await prisma.kioskSetting.upsert({
    where: { id: 'default' },
    update: { inventoryEnabled },
    create: { id: 'default', inventoryEnabled }
  });

  return {
    ...DEFAULT_CONFIG,
    inventoryEnabled: updated.inventoryEnabled
  };
}
