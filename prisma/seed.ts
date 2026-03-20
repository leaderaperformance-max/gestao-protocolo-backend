import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcrypt';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL environment variable is not set');
}

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('Seeding database...');
  console.warn('⚠️  SEGURANÇA: Senha padrão do admin é "Admin@2026!" — ALTERE IMEDIATAMENTE após o primeiro login!');

  // 1. Create sectors
  const sectorsData = [
    { name: 'Protocolo', code: 'PROT' },
    { name: 'Recursos Humanos', code: 'RH' },
    { name: 'Jurídico', code: 'JUR' },
    { name: 'Gabinete', code: 'GAB' },
    { name: 'Administrativo', code: 'ADM' },
  ];

  const sectors: Record<string, { id: string }> = {};
  for (const s of sectorsData) {
    const sector = await prisma.sector.upsert({
      where: { code: s.code },
      update: { name: s.name },
      create: { name: s.name, code: s.code },
    });
    sectors[s.code] = sector;
    console.log(`Sector upserted: ${s.code}`);
  }

  // 2. Create admin role (isSuperadmin: true, all permissions true)
  const adminRole = await prisma.role.upsert({
    where: { slug: 'admin' },
    update: {},
    create: {
      name: 'Administrador',
      slug: 'admin',
      isSuperadmin: true,
      permissions: {
        view: true,
        edit: true,
        send: true,
        receive: true,
        approve: true,
        reject: true,
      },
    },
  });
  console.log('Role upserted: admin');

  // 3. Create other roles
  await prisma.role.upsert({
    where: { slug: 'protocolo' },
    update: {},
    create: {
      name: 'Protocolo',
      slug: 'protocolo',
      isSuperadmin: false,
      permissions: {
        view: true,
        edit: true,
        send: true,
        receive: true,
        approve: false,
        reject: false,
      },
    },
  });
  console.log('Role upserted: protocolo');

  await prisma.role.upsert({
    where: { slug: 'servidor' },
    update: {},
    create: {
      name: 'Servidor',
      slug: 'servidor',
      isSuperadmin: false,
      permissions: {
        view: true,
        edit: false,
        send: false,
        receive: false,
        approve: false,
        reject: false,
      },
    },
  });
  console.log('Role upserted: servidor');

  await prisma.role.upsert({
    where: { slug: 'secretario' },
    update: {},
    create: {
      name: 'Secretário',
      slug: 'secretario',
      isSuperadmin: false,
      permissions: {
        view: true,
        edit: true,
        send: true,
        receive: true,
        approve: true,
        reject: true,
      },
    },
  });
  console.log('Role upserted: secretario');

  // 4. Create admin user
  // SECURITY: Default password — MUST be changed after first login
  const passwordHash = await bcrypt.hash('Admin@2026!', 12);
  const adminUser = await prisma.user.upsert({
    where: { email: 'admin@semed.prainha.pa.gov.br' },
    update: {},
    create: {
      name: 'Administrador do Sistema',
      email: 'admin@semed.prainha.pa.gov.br',
      passwordHash,
      registrationNumber: '000001',
      sectorId: sectors['PROT'].id,
      roleId: adminRole.id,
      isActive: true,
    },
  });
  console.log(`Admin user upserted: ${adminUser.email}`);

  // 5. Create request types using admin user's ID as createdByUserId
  // flow is a plain string[] of sector codes that the request traverses.
  // tramitations.service.ts casts flow as string[] and uses indexOf(sector.code).
  const requestTypes = [
    {
      name: 'Licença Prêmio',
      slaDays: 30,
      flow: ['PROT', 'RH', 'GAB'],
    },
    {
      name: 'Licença Sem Vencimento',
      slaDays: 45,
      flow: ['PROT', 'RH', 'JUR', 'GAB'],
    },
    {
      name: 'Entrega de Documentos',
      slaDays: 5,
      flow: ['PROT', 'ADM'],
    },
    {
      name: 'Requerimentos Diversos',
      slaDays: 15,
      flow: ['PROT', 'RH'],
    },
  ];

  for (const rt of requestTypes) {
    const existing = await prisma.requestType.findFirst({
      where: { name: rt.name },
    });
    await prisma.requestType.upsert({
      where: {
        id: existing?.id ?? '00000000-0000-0000-0000-000000000000',
      },
      update: { flow: rt.flow, slaDays: rt.slaDays },
      create: {
        name: rt.name,
        slaDays: rt.slaDays,
        flow: rt.flow,
        isActive: true,
        createdByUserId: adminUser.id,
      },
    });
    console.log(`RequestType upserted: ${rt.name}`);
  }

  console.log('Seeding complete!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
