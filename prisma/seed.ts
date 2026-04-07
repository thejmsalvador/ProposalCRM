import { PrismaClient, Role, ProposalStatus } from '../lib/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import * as dotenv from 'dotenv'

dotenv.config()

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter })

async function main() {
  // Users
  const admin = await prisma.user.upsert({
    where: { email: 'admin@agency.com' },
    update: {},
    create: {
      name: 'Admin User',
      email: 'admin@agency.com',
      role: Role.SUPER_ADMIN,
    },
  })

  const juan = await prisma.user.upsert({
    where: { email: 'juan@agency.com' },
    update: {},
    create: {
      name: 'Juan Sales',
      email: 'juan@agency.com',
      role: Role.SALES_EXEC,
    },
  })

  // Payment Template
  const paymentTemplate = await prisma.paymentTemplate.upsert({
    where: { id: 'seed-payment-1' },
    update: {},
    create: {
      id: 'seed-payment-1',
      name: '50/50 Standard',
      bodyRichText: '<p>50% upon signing, 50% upon final delivery.</p>',
      isDefault: true,
    },
  })

  // TC Template
  const tcTemplate = await prisma.tCTemplate.upsert({
    where: { id: 'seed-tc-1' },
    update: {},
    create: {
      id: 'seed-tc-1',
      name: 'Standard Agency T&C',
      bodyRichText: `<h2>Standard Terms &amp; Conditions</h2>
<p>1. <strong>Acceptance.</strong> By signing this proposal, the client agrees to these terms.</p>
<p>2. <strong>Scope.</strong> Work is limited to what is described in this proposal. Changes require a written amendment.</p>
<p>3. <strong>Payment.</strong> Invoices are due within 15 days of issuance. Late payments incur a 2% monthly fee.</p>
<p>4. <strong>Intellectual Property.</strong> Full ownership transfers to the client upon receipt of final payment.</p>
<p>5. <strong>Confidentiality.</strong> Both parties agree to keep project details confidential.</p>
<p>6. <strong>Termination.</strong> Either party may terminate with 14 days written notice. Work completed to date is billable.</p>`,
      categories: ['Strategy', 'Digital'],
    },
  })

  // Services
  const brandStrategy = await prisma.service.upsert({
    where: { id: 'seed-service-1' },
    update: {},
    create: {
      id: 'seed-service-1',
      name: 'Brand Strategy',
      category: 'Strategy',
      description: 'Comprehensive brand strategy development including positioning, messaging, and visual identity direction.',
      defaultScope: 'Discovery workshop, competitive analysis, brand positioning document, messaging framework, and presentation.',
      unit: 'project',
      defaultRate: 80000,
      tcTemplateId: tcTemplate.id,
      paymentTplId: paymentTemplate.id,
    },
  })

  const socialMedia = await prisma.service.upsert({
    where: { id: 'seed-service-2' },
    update: {},
    create: {
      id: 'seed-service-2',
      name: 'Social Media Management',
      category: 'Digital',
      description: 'Full-service social media management including content creation, scheduling, and community management.',
      defaultScope: 'Monthly content calendar, 12 posts per month, community management, and monthly performance report.',
      unit: 'month',
      defaultRate: 35000,
      tcTemplateId: tcTemplate.id,
      paymentTplId: paymentTemplate.id,
    },
  })

  // System Settings
  await prisma.systemSettings.upsert({
    where: { id: 'seed-settings-1' },
    update: {},
    create: {
      id: 'seed-settings-1',
      agencyName: 'The Agency',
    },
  })

  // Draft Proposal
  const proposal = await prisma.proposal.upsert({
    where: { number: 'PROP-2026-03-0001' },
    update: {},
    create: {
      number: 'PROP-2026-03-0001',
      clientName: 'Acme Corp',
      projectTitle: 'Brand Refresh 2026',
      date: new Date('2026-03-01'),
      validUntil: new Date('2026-03-31'),
      status: ProposalStatus.DRAFT,
      createdById: juan.id,
      subtotal: 115000,
      total: 128800,
      vatRate: 12,
      paymentTemplateId: paymentTemplate.id,
      tcTemplateId: tcTemplate.id,
      lineItems: {
        create: [
          {
            serviceId: brandStrategy.id,
            description: 'Brand Strategy',
            scopeOfWork: brandStrategy.defaultScope,
            unit: 'project',
            quantity: 1,
            unitRate: 80000,
            lineTotal: 80000,
            sortOrder: 1,
          },
          {
            serviceId: socialMedia.id,
            description: 'Social Media Management',
            scopeOfWork: socialMedia.defaultScope,
            unit: 'month',
            quantity: 1,
            unitRate: 35000,
            lineTotal: 35000,
            sortOrder: 2,
          },
        ],
      },
    },
  })

  console.log('Seed complete:', {
    users: [admin.email, juan.email],
    services: [brandStrategy.name, socialMedia.name],
    paymentTemplate: paymentTemplate.name,
    tcTemplate: tcTemplate.name,
    proposal: proposal.number,
  })
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
