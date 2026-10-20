import { Prisma, PrismaClient } from '@prisma/client';

/**
 * Every Ledger/Wallet/Transactions method that touches the database accepts this
 * type instead of hard-coding PrismaService, so callers can pass either the
 * top-level client OR the `tx` client Prisma hands you inside `$transaction(async (tx) => ...)`.
 * This is what lets WalletService.credit(), LedgerService.postEntry(), and
 * TransactionsService.transitionTo() all be composed into ONE atomic database
 * transaction by a calling module (e.g. the future TransfersService in Phase 4)
 * without any of them needing to know about each other's transaction boundaries.
 */
export type Db = PrismaClient | Prisma.TransactionClient;
