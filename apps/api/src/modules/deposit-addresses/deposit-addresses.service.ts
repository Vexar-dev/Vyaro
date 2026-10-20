import { Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../database/prisma.service';
import { CustodyKeyService, NetworkCode } from '../custody/custody-key.service';

/**
 * DepositAddressesService — never touches a private key itself; delegates all
 * derivation to CustodyKeyService and only ever persists PUBLIC addresses +
 * the (network, index) pair used to derive them.
 */
@Injectable()
export class DepositAddressesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly custody: CustodyKeyService,
    private readonly events: EventEmitter2,
  ) {}

  /**
   * Idempotent: returns the user's existing address for this network if one
   * already exists. Otherwise atomically claims the next derivation index
   * (row-locked on `networks`) and derives+persists a new one. One address per
   * (user, network) for the lifetime of the account — never rotated, never
   * reused for a different user.
   */
  async getOrCreateDepositAddress(userId: bigint, networkCode: NetworkCode) {
    const network = await this.prisma.network.findUnique({ where: { code: networkCode } });
    if (!network || !network.isActive) {
      throw new NotFoundException({ code: 'NETWORK_UNAVAILABLE', message: 'الشبكة غير متاحة حاليًا' });
    }

    const existing = await this.prisma.depositAddress.findUnique({
      where: { userId_networkId: { userId, networkId: network.id } },
    });
    if (existing) return existing;

    let wasNewlyCreated = false;
    const created = await this.prisma.$transaction(async (tx) => {
      // Locks the networks row so two concurrent requests can never claim
      // (and derive an address for) the same index — the actual guarantee
      // against a duplicate/wasted derivation, not just an app-level check.
      const locked = await tx.$queryRaw<{ id: bigint; next_derivation_index: number }[]>`
        SELECT id, next_derivation_index FROM networks WHERE id = ${network.id} FOR UPDATE
      `;
      const currentIndex = locked[0].next_derivation_index;

      // Someone else may have just created this while we were waiting for the lock.
      const raceCheck = await tx.depositAddress.findUnique({
        where: { userId_networkId: { userId, networkId: network.id } },
      });
      if (raceCheck) return raceCheck;

      const address = await this.custody.deriveAddress(networkCode, currentIndex);
      // BEP20/EVM addresses carry an EIP-55 mixed-case checksum that's cosmetic,
      // not canonical — MySQL's case-sensitivity for VARCHAR equality depends on
      // column collation, which we don't want this system's correctness to rely
      // on. Store EVM addresses lowercased so lookups (here and in
      // DepositMonitoringService, matching a webhook's reported address) are
      // unambiguous regardless of collation. Tron (case-sensitive Base58) and
      // Litecoin (bech32, already lowercase by construction) are left as-is.
      const storedAddress = networkCode === 'BEP20' ? address.toLowerCase() : address;

      await tx.network.update({ where: { id: network.id }, data: { nextDerivationIndex: currentIndex + 1 } });

      const row = await tx.depositAddress.create({
        data: { userId, networkId: network.id, derivationIndex: currentIndex, address: storedAddress },
      });
      wasNewlyCreated = true;
      return row;
    });

    // Emitted AFTER the transaction commits, and ONLY when a row was actually
    // newly created (never on the race-check-found-existing path above). A
    // listener (DepositMonitoringService) needs to read/write this exact row
    // (e.g. to store the Tatum subscription id back onto it), which would race
    // against an uncommitted transaction if fired any earlier, and would be a
    // spurious duplicate subscription attempt if fired for an address that
    // already existed. Decoupled from Tatum entirely — same "emit and let
    // another module react" pattern already used for Auth → Wallet (see
    // wallet.service.ts @OnEvent('user.registered')). This module never
    // imports DepositMonitoringModule.
    if (wasNewlyCreated) {
      this.events.emit('deposit-address.created', {
        depositAddressId: created.id,
        networkId: network.id,
        networkCode,
        address: created.address,
      });
    }

    return created;
  }

  async listMyDepositAddresses(userId: bigint) {
    return this.prisma.depositAddress.findMany({
      where: { userId },
      include: { network: true },
      orderBy: { createdAt: 'asc' },
    });
  }
}
