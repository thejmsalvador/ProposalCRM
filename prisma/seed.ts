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

  // First-stage approver in the COO → CEO chain
  const coo = await prisma.user.upsert({
    where: { email: 'coo@agency.com' },
    update: { role: Role.COO, isActive: true },
    create: {
      name: 'Olivia Operations',
      email: 'coo@agency.com',
      role: Role.COO,
      jobTitle: 'Chief Operating Officer',
    },
  })

  // Second-stage (final) approver in the COO → CEO chain
  const ceo = await prisma.user.upsert({
    where: { email: 'ceo@agency.com' },
    update: { role: Role.CEO, isActive: true },
    create: {
      name: 'Ethan Executive',
      email: 'ceo@agency.com',
      role: Role.CEO,
      jobTitle: 'Chief Executive Officer',
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

  const paymentTemplate3 = await prisma.paymentTemplate.upsert({
    where: { id: 'seed-payment-3' },
    update: {},
    create: {
      id: 'seed-payment-3',
      name: 'Retainer — 20% Downpayment',
      bodyRichText:
        '<p>A 20% downpayment of the total contract value is due upon signing, collected together with the first month of the retainer. The remaining balance is billed monthly across the engagement. Net 15 payment terms.</p>',
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

  // Note: seed-service-1 was repurposed in the live DB into a "Social Media" service.
  // This is the canonical Brand Strategy service used by the showcase proposal.
  const brandStrategySvc = await prisma.service.upsert({
    where: { id: 'seed-service-6' },
    update: {},
    create: {
      id: 'seed-service-6',
      name: 'Brand Strategy',
      category: 'Strategy',
      description:
        'Comprehensive brand strategy development including positioning, messaging, and visual identity direction.',
      defaultScope:
        'Discovery workshop, competitive analysis, brand positioning document, messaging framework, and presentation.',
      unit: 'one-time',
      defaultRate: 200000,
      minRate: 150000,
      maxRate: 300000,
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
      agencyName: 'Sunday Studio',
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

  // 6. APPROVED — FreshBite (one-time setup fee + monthly retainer)
  // Demonstrates the mixed-billing payment schedule: the ₱300,000 one-time setup is
  // billed upfront in Month 1, while the ₱600,000 retainer is spread evenly across
  // the 6-month engagement (₱100,000/mo). Uses the "Monthly Retainer" payment
  // template so the terms read "Billed monthly…".
  const retainerProposal = await prisma.proposal.upsert({
    where: { number: 'PROP-2026-03-0004' },
    update: {},
    create: {
      number: 'PROP-2026-03-0004',
      clientId: freshbite.id,
      clientName: 'FreshBite Food Group',
      contactName: 'Ana Villanueva',
      contactTitle: 'Brand Manager',
      projectTitle: 'Brand Launch & Always-On Social',
      date: new Date('2026-03-15'),
      validUntil: new Date('2026-04-14'),
      status: ProposalStatus.APPROVED,
      createdById: juan.id,
      assignedApproverId: manager.id,
      subtotal: 900000,
      total: 900000,
      introText:
        '<p>A one-time brand foundation sprint followed by a six-month always-on social media retainer.</p>',
      paymentTemplateId: paymentTemplate2.id, // "Monthly Retainer"
      tcTemplateId: tcTemplate.id,
      lineItems: {
        create: [
          {
            serviceId: brandStrategy.id,
            description: 'Brand Strategy & Launch Setup',
            scopeOfWork: brandStrategy.defaultScope,
            unit: 'one-time',
            quantity: 1,
            unitRate: 300000,
            lineTotal: 300000,
            sortOrder: 1,
          },
          {
            serviceId: socialMedia.id,
            description: 'Always-On Social Media Retainer',
            scopeOfWork: socialMedia.defaultScope,
            unit: 'monthly',
            quantity: 6,
            unitRate: 100000,
            lineTotal: 600000,
            sortOrder: 2,
          },
        ],
      },
    },
  })

  await prisma.approvalEvent.upsert({
    where: { id: 'seed-event-3' },
    update: {},
    create: { id: 'seed-event-3', proposalId: retainerProposal.id, action: 'submitted', actorId: juan.id },
  })
  await prisma.approvalEvent.upsert({
    where: { id: 'seed-event-4' },
    update: {},
    create: { id: 'seed-event-4', proposalId: retainerProposal.id, action: 'approved', actorId: manager.id, comment: 'Approved — retainer terms confirmed.' },
  })

  // 7. APPROVED — Acme Corp (pure retainer with 20% downpayment)
  // Demonstrates the downpayment payment schedule: 20% of the ₱600,000 grand total
  // (₱120,000) is collected upfront with Month 1, and the remaining ₱480,000 is
  // billed evenly across the 6-month engagement (₱80,000/mo). Month 1 = ₱200,000.
  const downpaymentProposal = await prisma.proposal.upsert({
    where: { number: 'PROP-2026-03-0005' },
    update: {},
    create: {
      number: 'PROP-2026-03-0005',
      clientId: acme.id,
      clientName: 'Acme Corp',
      contactName: 'Maria Santos',
      contactTitle: 'CEO',
      projectTitle: 'Always-On Social Retainer 2026',
      date: new Date('2026-03-20'),
      validUntil: new Date('2026-04-19'),
      status: ProposalStatus.APPROVED,
      createdById: juan.id,
      assignedApproverId: manager.id,
      subtotal: 600000,
      total: 600000,
      introText:
        '<p>A six-month always-on social media retainer with a standard 20% downpayment.</p>',
      paymentTemplateId: paymentTemplate3.id, // "Retainer — 20% Downpayment"
      tcTemplateId: tcTemplate.id,
      lineItems: {
        create: [
          {
            serviceId: socialMedia.id,
            description: 'Always-On Social Media Retainer',
            scopeOfWork: socialMedia.defaultScope,
            unit: 'monthly',
            quantity: 6,
            unitRate: 100000,
            lineTotal: 600000,
            sortOrder: 1,
          },
        ],
      },
    },
  })

  await prisma.approvalEvent.upsert({
    where: { id: 'seed-event-5' },
    update: {},
    create: { id: 'seed-event-5', proposalId: downpaymentProposal.id, action: 'submitted', actorId: juan.id },
  })
  await prisma.approvalEvent.upsert({
    where: { id: 'seed-event-6' },
    update: {},
    create: { id: 'seed-event-6', proposalId: downpaymentProposal.id, action: 'approved', actorId: manager.id, comment: 'Approved — standard retainer downpayment.' },
  })

  // 8. APPROVED — BuildRight (full showcase: all 5 services, discount + VAT, T&C, 50/50 terms)
  // A complete, presentation-ready proposal that exercises every seeded catalog item:
  // all five services (four billed + one optional add-on), the Standard Agency T&C,
  // the 50/50 payment template, an executive summary, plus a discount and VAT line.
  const showcaseProposal = await prisma.proposal.upsert({
    where: { number: 'PROP-2026-03-0006' },
    update: {},
    create: {
      number: 'PROP-2026-03-0006',
      clientId: buildright.id,
      clientName: 'BuildRight Construction',
      contactName: 'Carlo Mendoza',
      contactTitle: 'Owner',
      projectTitle: 'Integrated Marketing Program 2026',
      date: new Date('2026-03-25'),
      validUntil: new Date('2026-04-24'),
      status: ProposalStatus.APPROVED,
      createdById: juan.id,
      assignedApproverId: manager.id,
      subtotal: 1200000,
      discountType: 'percentage',
      discountValue: 10,
      vatRate: 12,
      total: 1209600, // (1,200,000 − 10%) × 1.12 = 1,080,000 × 1.12
      introText:
        '<p>BuildRight Construction is entering a pivotal growth year, and this integrated program brings brand, content, video, and performance under one roof. The plan below pairs a foundational brand sprint and flagship video production with an always-on social retainer and a measurement-driven SEO baseline.</p><p>Our goal is a coherent market presence that compounds over the engagement — from launch through sustained monthly execution.</p>',
      paymentTemplateId: paymentTemplate.id, // "50/50 Standard"
      tcTemplateId: tcTemplate.id, // "Standard Agency T&C"
      lineItems: {
        create: [
          {
            serviceId: brandStrategySvc.id,
            description: 'Brand Strategy & Positioning',
            scopeOfWork: brandStrategySvc.defaultScope,
            unit: 'one-time',
            quantity: 1,
            unitRate: 200000,
            lineTotal: 200000,
            sortOrder: 1,
          },
          {
            serviceId: videoProduction.id,
            description: 'Flagship TVC / Video Production',
            scopeOfWork: videoProduction.defaultScope,
            unit: 'one-time',
            quantity: 1,
            unitRate: 250000,
            lineTotal: 250000,
            sortOrder: 2,
          },
          {
            serviceId: influencerMarketing.id,
            description: 'Influencer Marketing Campaign',
            scopeOfWork: influencerMarketing.defaultScope,
            unit: 'one-time',
            quantity: 1,
            unitRate: 150000,
            lineTotal: 150000,
            sortOrder: 3,
          },
          {
            serviceId: socialMedia.id,
            description: 'Always-On Social Media Retainer',
            scopeOfWork: socialMedia.defaultScope,
            unit: 'monthly',
            quantity: 6,
            unitRate: 100000,
            lineTotal: 600000,
            sortOrder: 4,
          },
          {
            serviceId: seoAudit.id,
            description: 'SEO Audit & Strategy',
            scopeOfWork: seoAudit.defaultScope,
            unit: 'one-time',
            quantity: 1,
            unitRate: 80000,
            lineTotal: 80000,
            isOptional: true,
            sortOrder: 5,
          },
        ],
      },
    },
  })

  await prisma.approvalEvent.upsert({
    where: { id: 'seed-event-7' },
    update: {},
    create: { id: 'seed-event-7', proposalId: showcaseProposal.id, action: 'submitted', actorId: juan.id },
  })
  await prisma.approvalEvent.upsert({
    where: { id: 'seed-event-8' },
    update: {},
    create: { id: 'seed-event-8', proposalId: showcaseProposal.id, action: 'approved', actorId: manager.id, comment: 'Approved — full integrated program.' },
  })

  console.log('Seed complete:', {
    users: [admin.email, manager.email, juan.email, coo.email, ceo.email],
    team: team.name,
    clients: ['Acme Corp', 'BuildRight Construction', 'FreshBite Food Group'],
    services: [brandStrategy.name, socialMedia.name, videoProduction.name, influencerMarketing.name, seoAudit.name],
    paymentTemplates: [paymentTemplate.name, paymentTemplate2.name, paymentTemplate3.name],
    tcTemplate: tcTemplate.name,
    proposals: 8,
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
