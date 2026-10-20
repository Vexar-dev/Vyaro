import { NotFoundException } from '@nestjs/common';
import { DepositAddressesService } from '../../../src/modules/deposit-addresses/deposit-addresses.service';

function makeFakeDb() {
  const networks = new Map<bigint, any>([[1n, { id: 1n, code: 'BEP20', isActive: true, nextDerivationIndex: 0 }]]);
  const depositAddresses = new Map<string, any>(); // key: `${userId}:${networkId}`
  let nextId = 1n;

  const db: any = {
    network: {
      findUnique: jest.fn(async ({ where }: any) => [...networks.values()].find((n) => n.code === where.code) ?? null),
      update: jest.fn(async ({ where, data }: any) => {
        const n = networks.get(where.id);
        Object.assign(n, data);
        return n;
      }),
    },
    depositAddress: {
      findUnique: jest.fn(async ({ where }: any) => {
        const { userId, networkId } = where.userId_networkId;
        return depositAddresses.get(`${userId}:${networkId}`) ?? null;
      }),
      create: jest.fn(async ({ data }: any) => {
        const row = { id: nextId++, createdAt: new Date(), ...data };
        depositAddresses.set(`${data.userId}:${data.networkId}`, row);
        return row;
      }),
      findMany: jest.fn(async ({ where }: any) =>
        [...depositAddresses.values()].filter((a) => a.userId === where.userId),
      ),
    },
    $queryRaw: jest.fn(async (_strings: TemplateStringsArray, ...values: any[]) => {
      const id = values[0];
      const n = networks.get(id);
      return [{ id: n.id, next_derivation_index: n.nextDerivationIndex }];
    }),
    $transaction: jest.fn(async (fn: any) => fn(db)),
  };

  return { db, networks, depositAddresses };
}

describe('DepositAddressesService', () => {
  it('creates a new address on first call, claiming index 0, lowercased (BEP20 addresses are stored lowercase — see EVM collation note)', async () => {
    const { db } = makeFakeDb();
    const custody = { deriveAddress: jest.fn().mockResolvedValue('0xAAA...') };
    const service = new DepositAddressesService(db, custody as any, { emit: jest.fn() } as any);

    const address = await service.getOrCreateDepositAddress(42n, 'BEP20');
    expect(address.address).toBe('0xaaa...');
    expect(address.derivationIndex).toBe(0);
    expect(custody.deriveAddress).toHaveBeenCalledWith('BEP20', 0);
  });

  it('is idempotent: a second call for the same (user, network) returns the SAME row without deriving again', async () => {
    const { db } = makeFakeDb();
    const custody = { deriveAddress: jest.fn().mockResolvedValue('0xAAA...') };
    const events = { emit: jest.fn() };
    const service = new DepositAddressesService(db, custody as any, events as any);

    const first = await service.getOrCreateDepositAddress(42n, 'BEP20');
    const second = await service.getOrCreateDepositAddress(42n, 'BEP20');

    expect(second.id).toBe(first.id);
    expect(custody.deriveAddress).toHaveBeenCalledTimes(1); // NOT called again
    expect(events.emit).toHaveBeenCalledTimes(1); // 'deposit-address.created' fires only on genuine creation
    expect(events.emit).toHaveBeenCalledWith('deposit-address.created', expect.objectContaining({ address: '0xaaa...' }));
  });

  it('claims a DIFFERENT (incrementing) index for a different user on the same network', async () => {
    const { db } = makeFakeDb();
    const custody = { deriveAddress: jest.fn().mockImplementation(async (_n: string, i: number) => `addr-${i}`) };
    const service = new DepositAddressesService(db, custody as any, { emit: jest.fn() } as any);

    const userA = await service.getOrCreateDepositAddress(1n, 'BEP20');
    const userB = await service.getOrCreateDepositAddress(2n, 'BEP20');

    expect(userA.derivationIndex).toBe(0);
    expect(userB.derivationIndex).toBe(1);
    expect(userA.address).not.toBe(userB.address);
  });

  it('throws NOT_FOUND / NETWORK_UNAVAILABLE for an unknown or inactive network', async () => {
    const { db } = makeFakeDb();
    const custody = { deriveAddress: jest.fn() };
    const service = new DepositAddressesService(db, custody as any, { emit: jest.fn() } as any);

    await expect(service.getOrCreateDepositAddress(1n, 'TRC20' as any)).rejects.toThrow(NotFoundException);
    expect(custody.deriveAddress).not.toHaveBeenCalled();
  });

  it('listMyDepositAddresses returns only the caller\'s own rows', async () => {
    const { db } = makeFakeDb();
    const custody = { deriveAddress: jest.fn().mockResolvedValue('0xAAA...') };
    const service = new DepositAddressesService(db, custody as any, { emit: jest.fn() } as any);

    await service.getOrCreateDepositAddress(1n, 'BEP20');
    await service.getOrCreateDepositAddress(2n, 'BEP20');

    const mine = await service.listMyDepositAddresses(1n);
    expect(mine).toHaveLength(1);
    expect(mine[0].userId).toBe(1n);
  });
});
