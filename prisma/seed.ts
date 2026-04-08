import { PrismaClient, Role, ProposalStatus } from '../lib/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import * as dotenv from 'dotenv'

dotenv.config()

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter })

async function main() {
  // ─── Users ──────────────────────────────────────────────────────────────────

  const admin = await prisma.user.upsert({
    where: { email: 'admin@agency.com' },
    update: {},
    create: {
      name: 'Admin User',
      email: 'admin@agency.com',
      role: Role.SUPER_ADMIN,
    },
  })

  const manager = await prisma.user.upsert({
    where: { email: 'manager@agency.com' },
    update: {},
    create: {
      name: 'Maria Manager',
      email: 'manager@agency.com',
      role: Role.SALES_MANAGER,
      jobTitle: 'Sales Manager',
    },
  })

  const juan = await prisma.user.upsert({
    where: { email: 'juan@agency.com' },
    update: {},
    create: {
      name: 'Juan Sales',
      email: 'juan@agency.com',
      role: Role.SALES_EXEC,
      jobTitle: 'Account Executive',
      teamId: null,
      defaultApproverId: manager.id,
    },
  })

  // ─── Team ────────────────────────────────────────────────────────────────────

  const team = await prisma.team.upsert({
    where: { id: 'seed-team-1' },
    update: { managerId: manager.id },
    create: {
      id: 'seed-team-1',
      name: 'Sales Team',
      managerId: manager.id,
    },
  })

  // Assign users to team
  await prisma.user.update({ where: { id: manager.id }, data: { teamId: team.id } })
  await prisma.user.update({ where: { id: juan.id }, data: { teamId: team.id } })

  // ─── Payment Templates ───────────────────────────────────────────────────────

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

  const paymentTemplate2 = await prisma.paymentTemplate.upsert({
    where: { id: 'seed-payment-2' },
    update: {},
    create: {
      id: 'seed-payment-2',
      name: 'Monthly Retainer',
      bodyRichText:
        '<p>Billed monthly on the 1st of each month. Net 15 payment terms. A 2% monthly late fee applies to overdue invoices.</p>',
      isDefault: false,
    },
  })

  // ─── T&C Template ────────────────────────────────────────────────────────────

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

  // ─── Services ────────────────────────────────────────────────────────────────

  const brandStrategy = await prisma.service.upsert({
    where: { id: 'seed-service-1' },
    update: {},
    create: {
      id: 'seed-service-1',
      name: 'Brand Strategy',
      category: 'Strategy',
      description:
        'Comprehensive brand strategy development including positioning, messaging, and visual identity direction.',
      defaultScope:
        'Discovery workshop, competitive analysis, brand positioning document, messaging framework, and presentation.',
      unit: 'project',
      defaultRate: 80000,
      minRate: 60000,
      maxRate: 120000,
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
      description:
        'Full-service social media management including content creation, scheduling, and community management.',
      defaultScope:
        'Monthly content calendar, 12 posts per month, community management, and monthly performance report.',
      unit: 'month',
      defaultRate: 35000,
      minRate: 25000,
      maxRate: 60000,
      tcTemplateId: tcTemplate.id,
      paymentTplId: paymentTemplate2.id,
    },
  })

  const videoProduction = await prisma.service.upsert({
    where: { id: 'seed-service-3' },
    update: {},
    create: {
      id: 'seed-service-3',
      name: 'Video Production',
      category: 'Creative',
      description:
        'End-to-end video production for TVC, digital ads, and corporate films.',
      defaultScope:
        'Pre-production planning, filming (2-day shoot), post-production editing, color grading, and final delivery in web and broadcast formats.',
      unit: 'project',
      defaultRate: 200000,
      minRate: 150000,
      maxRate: 500000,
      tcTemplateId: tcTemplate.id,
      paymentTplId: paymentTemplate.id,
    },
  })

  const influencerMarketing = await prisma.service.upsert({
    where: { id: 'seed-service-4' },
    update: {},
    create: {
      id: 'seed-service-4',
      name: 'Influencer Marketing',
      category: 'Digital',
      description:
        'Influencer identification, outreach, campaign management, and performance reporting.',
      defaultScope:
        'Influencer shortlisting (10 profiles), negotiation, content brief, campaign execution, and post-campaign report.',
      unit: 'campaign',
      defaultRate: 75000,
      minRate: 50000,
      maxRate: 200000,
      tcTemplateId: tcTemplate.id,
      paymentTplId: paymentTemplate.id,
    },
  })

  const seoAudit = await prisma.service.upsert({
    where: { id: 'seed-service-5' },
    update: {},
    create: {
      id: 'seed-service-5',
      name: 'SEO Audit & Strategy',
      category: 'Strategy',
      description:
        'Technical SEO audit, keyword gap analysis, and a 90-day content and link strategy.',
      defaultScope:
        'Full technical audit, competitor keyword analysis, content gap report, on-page recommendations, and a prioritised 90-day roadmap.',
      unit: 'project',
      defaultRate: 45000,
      minRate: 30000,
      maxRate: 80000,
      tcTemplateId: tcTemplate.id,
      paymentTplId: paymentTemplate.id,
    },
  })

  // ─── System Settings ─────────────────────────────────────────────────────────

  await prisma.systemSettings.upsert({
    where: { id: 'seed-settings-1' },
    update: {},
    create: {
      id: 'seed-settings-1',
      agencyName: 'The Agency',
    },
  })

  // ─── Clients ─────────────────────────────────────────────────────────────────

  // 1. Acme Corp — Retail
  const acme = await prisma.client.upsert({
    where: { id: 'seed-client-acme' },
    update: {},
    create: {
      id: 'seed-client-acme',
      companyName: 'Acme Corp',
      industry: 'Retail',
      website: 'https://acmecorp.ph',
      createdById: juan.id,
    },
  })

  await prisma.clientContact.upsert({
    where: { id: 'seed-contact-acme-1' },
    update: {},
    create: {
      id: 'seed-contact-acme-1',
      clientId: acme.id,
      contactName: 'Maria Santos',
      contactTitle: 'CEO',
      email: 'maria@acmecorp.ph',
      isPrimary: true,
      createdById: juan.id,
    },
  })

  await prisma.clientContact.upsert({
    where: { id: 'seed-contact-acme-2' },
    update: {},
    create: {
      id: 'seed-contact-acme-2',
      clientId: acme.id,
      contactName: 'Jose Reyes',
      contactTitle: 'Marketing Manager',
      email: 'jose@acmecorp.ph',
      isPrimary: false,
      createdById: juan.id,
    },
  })

  // 2. BuildRight Construction — Real Estate
  const buildright = await prisma.client.upsert({
    where: { id: 'seed-client-buildright' },
    update: {},
    create: {
      id: 'seed-client-buildright',
      companyName: 'BuildRight Construction',
      industry: 'Real Estate',
      createdById: juan.id,
    },
  })

  await prisma.clientContact.upsert({
    where: { id: 'seed-contact-buildright-1' },
    update: {},
    create: {
      id: 'seed-contact-buildright-1',
      clientId: buildright.id,
      contactName: 'Carlo Mendoza',
      contactTitle: 'Owner',
      email: 'carlo@buildright.ph',
      isPrimary: true,
      createdById: juan.id,
    },
  })

  // 3. FreshBite Food Group — Food & Beverage (no proposals)
  const freshbite = await prisma.client.upsert({
    where: { id: 'seed-client-freshbite' },
    update: {},
    create: {
      id: 'seed-client-freshbite',
      companyName: 'FreshBite Food Group',
      industry: 'Food & Beverage',
      createdById: manager.id,
    },
  })

  await prisma.clientContact.upsert({
    where: { id: 'seed-contact-freshbite-1' },
    update: {},
    create: {
      id: 'seed-contact-freshbite-1',
      clientId: freshbite.id,
      contactName: 'Ana Villanueva',
      contactTitle: 'Brand Manager',
      email: 'ana@freshbite.ph',
      isPrimary: true,
      createdById: manager.id,
    },
  })

  // ─── Proposals ───────────────────────────────────────────────────────────────

  // 1. DRAFT — Acme Corp
  await prisma.proposal.upsert({
    where: { number: 'PROP-2026-03-0001' },
    update: {},
    create: {
      number: 'PROP-2026-03-0001',
      clientId: acme.id,
      clientName: 'Acme Corp',
      contactName: 'Maria Santos',
      contactTitle: 'CEO',
      projectTitle: 'Brand Refresh 2026',
      date: new Date('2026-03-01'),
      validUntil: new Date('2026-03-31'),
      status: ProposalStatus.DRAFT,
      createdById: juan.id,
      assignedApproverId: manager.id,
      subtotal: 115000,
      vatRate: 12,
      total: 128800,
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

  // 2. PENDING_APPROVAL — BuildRight
  await prisma.proposal.upsert({
    where: { number: 'PROP-2026-03-0002' },
    update: {},
    create: {
      number: 'PROP-2026-03-0002',
      clientId: buildright.id,
      clientName: 'BuildRight Construction',
      contactName: 'Carlo Mendoza',
      contactTitle: 'Owner',
      projectTitle: 'Q2 Digital Campaign',
      date: new Date('2026-03-05'),
      validUntil: new Date('2026-04-04'),
      status: ProposalStatus.PENDING_APPROVAL,
      createdById: juan.id,
      assignedApproverId: manager.id,
      subtotal: 110000,
      vatRate: 12,
      total: 123200,
      paymentTemplateId: paymentTemplate.id,
      tcTemplateId: tcTemplate.id,
      lineItems: {
        create: [
          {
            serviceId: socialMedia.id,
            description: 'Social Media Management',
            scopeOfWork: socialMedia.defaultScope,
            unit: 'month',
            quantity: 2,
            unitRate: 35000,
            lineTotal: 70000,
            sortOrder: 1,
          },
          {
            serviceId: influencerMarketing.id,
            description: 'Influencer Marketing Campaign',
            scopeOfWork: influencerMarketing.defaultScope,
            unit: 'campaign',
            quantity: 1,
            unitRate: 40000,
            lineTotal: 40000,
            sortOrder: 2,
          },
        ],
      },
    },
  })

  // 3. APPROVED — Acme Corp, with version history
  const approvedProposal = await prisma.proposal.upsert({
    where: { number: 'PROP-2026-03-0003' },
    update: {},
    create: {
      number: 'PROP-2026-03-0003',
      version: 2,
      clientId: acme.id,
      clientName: 'Acme Corp',
      contactName: 'Maria Santos',
      contactTitle: 'CEO',
      projectTitle: 'Digital Transformation Campaign',
      date: new Date('2026-03-10'),
      validUntil: new Date('2026-04-09'),
      status: ProposalStatus.APPROVED,
      createdById: juan.id,
      assignedApproverId: manager.id,
      subtotal: 320000,
      vatRate: 12,
      total: 358400,
      introText:
        '<p>Thank you for the opportunity to partner with Acme Corp on this landmark digital transformation initiative.</p>',
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
            serviceId: videoProduction.id,
            description: 'TVC Production',
            scopeOfWork: videoProduction.defaultScope,
            unit: 'project',
            quantity: 1,
            unitRate: 200000,
            lineTotal: 200000,
            sortOrder: 2,
          },
          {
            serviceId: socialMedia.id,
            description: 'Social Media Management',
            scopeOfWork: socialMedia.defaultScope,
            unit: 'month',
            quantity: 2,
            unitRate: 20000,
            lineTotal: 40000,
            isOptional: true,
            sortOrder: 3,
          },
        ],
      },
    },
  })

  // Version history for the APPROVED proposal
  await prisma.proposalVersion.upsert({
    where: { id: 'seed-version-1' },
    update: {},
    create: {
      id: 'seed-version-1',
      proposalId: approvedProposal.id,
      versionNumber: 1,
      status: ProposalStatus.DRAFT,
      createdById: juan.id,
      changeSummary: 'Initial proposal draft.',
      snapshotJson: {
        proposal: { clientName: 'Acme Corp', projectTitle: 'Digital Transformation Campaign', subtotal: '280000', total: '313600', currency: 'PHP' },
        lineItems: [
          { description: 'Brand Strategy', quantity: '1', unitRate: '80000', lineTotal: '80000', unit: 'project', isOptional: false },
          { description: 'TVC Production', quantity: '1', unitRate: '200000', lineTotal: '200000', unit: 'project', isOptional: false },
        ],
      },
    },
  })

  await prisma.proposalVersion.upsert({
    where: { id: 'seed-version-2' },
    update: {},
    create: {
      id: 'seed-version-2',
      proposalId: approvedProposal.id,
      versionNumber: 2,
      status: ProposalStatus.APPROVED,
      createdById: juan.id,
      changeSummary: 'Added optional Social Media Management line item. Subtotal increased from ₱280,000 to ₱320,000.',
      snapshotJson: {
        proposal: { clientName: 'Acme Corp', projectTitle: 'Digital Transformation Campaign', subtotal: '320000', total: '358400', currency: 'PHP' },
        lineItems: [
          { description: 'Brand Strategy', quantity: '1', unitRate: '80000', lineTotal: '80000', unit: 'project', isOptional: false },
          { description: 'TVC Production', quantity: '1', unitRate: '200000', lineTotal: '200000', unit: 'project', isOptional: false },
          { description: 'Social Media Management', quantity: '2', unitRate: '20000', lineTotal: '40000', unit: 'month', isOptional: true },
        ],
      },
    },
  })

  // Approval events
  await prisma.approvalEvent.upsert({
    where: { id: 'seed-event-1' },
    update: {},
    create: { id: 'seed-event-1', proposalId: approvedProposal.id, action: 'submitted', actorId: juan.id },
  })
  await prisma.approvalEvent.upsert({
    where: { id: 'seed-event-2' },
    update: {},
    create: { id: 'seed-event-2', proposalId: approvedProposal.id, action: 'approved', actorId: manager.id, comment: 'Looks great! Approved.' },
  })

  // 4. WON — Acme Corp (contributes to lifetime value)
  await prisma.proposal.upsert({
    where: { number: 'PROP-2026-02-0001' },
    update: {},
    create: {
      number: 'PROP-2026-02-0001',
      clientId: acme.id,
      clientName: 'Acme Corp',
      contactName: 'Maria Santos',
      contactTitle: 'CEO',
      projectTitle: 'Summer Campaign 2026',
      date: new Date('2026-02-01'),
      validUntil: new Date('2026-03-01'),
      status: ProposalStatus.WON,
      createdById: juan.id,
      assignedApproverId: manager.id,
      subtotal: 75000,
      vatRate: 12,
      total: 84000,
      paymentTemplateId: paymentTemplate.id,
      tcTemplateId: tcTemplate.id,
      lineItems: {
        create: [
          {
            serviceId: influencerMarketing.id,
            description: 'Influencer Marketing Campaign',
            scopeOfWork: influencerMarketing.defaultScope,
            unit: 'campaign',
            quantity: 1,
            unitRate: 75000,
            lineTotal: 75000,
            sortOrder: 1,
          },
        ],
      },
    },
  })

  // 5. LOST — Acme Corp
  await prisma.proposal.upsert({
    where: { number: 'PROP-2026-02-0002' },
    update: {},
    create: {
      number: 'PROP-2026-02-0002',
      clientId: acme.id,
      clientName: 'Acme Corp',
      contactName: 'Maria Santos',
      contactTitle: 'CEO',
      projectTitle: 'SEO & Content Strategy',
      date: new Date('2026-02-10'),
      validUntil: new Date('2026-03-10'),
      status: ProposalStatus.LOST,
      lostReason: 'Budget',
      createdById: juan.id,
      assignedApproverId: manager.id,
      subtotal: 45000,
      vatRate: 12,
      total: 50400,
      paymentTemplateId: paymentTemplate.id,
      tcTemplateId: tcTemplate.id,
      lineItems: {
        create: [
          {
            serviceId: seoAudit.id,
            description: 'SEO Audit & Strategy',
            scopeOfWork: seoAudit.defaultScope,
            unit: 'project',
            quantity: 1,
            unitRate: 45000,
            lineTotal: 45000,
            sortOrder: 1,
          },
        ],
      },
    },
  })

  console.log('Seed complete:', {
    users: [admin.email, manager.email, juan.email],
    team: team.name,
    clients: ['Acme Corp', 'BuildRight Construction', 'FreshBite Food Group'],
    services: [brandStrategy.name, socialMedia.name, videoProduction.name, influencerMarketing.name, seoAudit.name],
    paymentTemplates: [paymentTemplate.name, paymentTemplate2.name],
    tcTemplate: tcTemplate.name,
    proposals: 5,
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
