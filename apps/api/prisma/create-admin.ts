/**
 * Creates (or promotes) the FIRST SUPER_ADMIN in any environment, including production.
 * Credentials come ONLY from environment variables at run time — nothing is stored in the repo:
 *   ADMIN_EMAIL=... ADMIN_USERNAME=... ADMIN_PASSWORD='...' ADMIN_PHONE=+9639xxxxxxxx ADMIN_SHAMCASH=... npm run create-admin
 * Run `npx prisma db seed` first (roles/permissions must exist).
 */
import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';
import { normalizePhone } from '../src/common/phone/phone';

const prisma = new PrismaClient();

async function main() {
  const { ADMIN_EMAIL, ADMIN_USERNAME, ADMIN_PASSWORD, ADMIN_PHONE, ADMIN_SHAMCASH } = process.env;
  const phone = normalizePhone(ADMIN_PHONE ?? '');
  if (!ADMIN_EMAIL || !ADMIN_USERNAME || !ADMIN_PASSWORD || !phone || !ADMIN_SHAMCASH) {
    throw new Error('Set ADMIN_EMAIL, ADMIN_USERNAME, ADMIN_PASSWORD, ADMIN_PHONE and ADMIN_SHAMCASH');
  }
  if (ADMIN_PASSWORD.length < 14) throw new Error('ADMIN_PASSWORD must be at least 14 characters');
  const role = await prisma.role.findUnique({ where: { code: 'SUPER_ADMIN' } });
  if (!role) throw new Error('Run `npx prisma db seed` first');

  const exists = await prisma.user.findFirst({ where: { OR: [{ usernameLower: ADMIN_USERNAME.toLowerCase() }, { email: ADMIN_EMAIL.toLowerCase() }] } });
  if (exists) {
    console.log(`Admin ${exists.username} already exists — nothing to do.`);
    return;
  }

  const passwordHash = await argon2.hash(ADMIN_PASSWORD, { type: argon2.argon2id });
  const user = await prisma.user.create({
    data: {
      username: ADMIN_USERNAME,
      usernameLower: ADMIN_USERNAME.toLowerCase(),
      email: ADMIN_EMAIL.toLowerCase(),
      phone,
      shamcashAddress: ADMIN_SHAMCASH,
      passwordHash,
      status: 'ACTIVE',
      profile: { create: {} },
      roles: { create: { roleId: role.id } },
    },
  });
  console.log(`Created SUPER_ADMIN ${user.username} <${user.email}>`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
