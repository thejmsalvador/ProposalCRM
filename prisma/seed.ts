import { PrismaClient, Role, ProposalStatus, ActivityType } from '../lib/generated/prisma/client'
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

  // Full Payment — the standard terms for collaterals and strategy engagements.
  const paymentTemplate = await prisma.paymentTemplate.upsert({
    where: { id: 'seed-payment-1' },
    update: {
      name: 'Full Payment — 100% on Kick-Off',
      bodyRichText: `<p><strong>100% Full Payment</strong> &mdash; due upon project kick-off, based on the VAT-inclusive contract amount.</p>
<p>Once the contract is signed, the Billings Team will issue a Statement of Account (SOA) containing the Studio's bank details via email. An official sales invoice is provided upon settlement of the balance. For documentation purposes, please send proof of payment to finance@sunday.ph upon settlement.</p>`,
      isDefault: true,
    },
    create: {
      id: 'seed-payment-1',
      name: 'Full Payment — 100% on Kick-Off',
      bodyRichText: `<p><strong>100% Full Payment</strong> &mdash; due upon project kick-off, based on the VAT-inclusive contract amount.</p>
<p>Once the contract is signed, the Billings Team will issue a Statement of Account (SOA) containing the Studio's bank details via email. An official sales invoice is provided upon settlement of the balance. For documentation purposes, please send proof of payment to finance@sunday.ph upon settlement.</p>`,
      isDefault: true,
    },
  })

  // Milestone schedule used for Brand Identity Development engagements.
  const paymentTemplate2 = await prisma.paymentTemplate.upsert({
    where: { id: 'seed-payment-2' },
    update: {
      name: 'Milestone — 50% / 30% / 20%',
      bodyRichText: `<p>Payable in three (3) milestones based on the VAT-inclusive contract amount:</p>
<ul>
<li><strong>50% Downpayment</strong> &mdash; due upon project kick-off.</li>
<li><strong>30% Progress Payment</strong> &mdash; due upon submission of the Visual Identity.</li>
<li><strong>20% Final Payment</strong> &mdash; due before turnover of final files.</li>
</ul>
<p>Once the contract is signed, the Billings Team will issue a Statement of Account (SOA) containing the Studio's bank details via email. An official sales invoice is provided upon settlement of each milestone. For documentation purposes, please send proof of payment to finance@sunday.ph upon settlement.</p>`,
      isDefault: false,
    },
    create: {
      id: 'seed-payment-2',
      name: 'Milestone — 50% / 30% / 20%',
      bodyRichText: `<p>Payable in three (3) milestones based on the VAT-inclusive contract amount:</p>
<ul>
<li><strong>50% Downpayment</strong> &mdash; due upon project kick-off.</li>
<li><strong>30% Progress Payment</strong> &mdash; due upon submission of the Visual Identity.</li>
<li><strong>20% Final Payment</strong> &mdash; due before turnover of final files.</li>
</ul>
<p>Once the contract is signed, the Billings Team will issue a Statement of Account (SOA) containing the Studio's bank details via email. An official sales invoice is provided upon settlement of each milestone. For documentation purposes, please send proof of payment to finance@sunday.ph upon settlement.</p>`,
      isDefault: false,
    },
  })

  const paymentTemplate3 = await prisma.paymentTemplate.upsert({
    where: { id: 'seed-payment-3' },
    update: {
      name: 'Monthly Retainer',
      bodyRichText:
        '<p>Billed monthly on the 1st of each month. Net 15 payment terms. A 2% monthly late fee applies to overdue invoices.</p>',
      isDefault: false,
    },
    create: {
      id: 'seed-payment-3',
      name: 'Monthly Retainer',
      bodyRichText:
        '<p>Billed monthly on the 1st of each month. Net 15 payment terms. A 2% monthly late fee applies to overdue invoices.</p>',
      isDefault: false,
    },
  })

  const paymentTemplate4 = await prisma.paymentTemplate.upsert({
    where: { id: 'seed-payment-4' },
    update: {
      name: 'Retainer — 20% Downpayment',
      bodyRichText:
        '<p>A 20% downpayment of the total contract value is due upon signing, collected together with the first month of the retainer. The remaining balance is billed monthly across the engagement. Net 15 payment terms.</p>',
      isDefault: false,
    },
    create: {
      id: 'seed-payment-4',
      name: 'Retainer — 20% Downpayment',
      bodyRichText:
        '<p>A 20% downpayment of the total contract value is due upon signing, collected together with the first month of the retainer. The remaining balance is billed monthly across the engagement. Net 15 payment terms.</p>',
      isDefault: false,
    },
  })

  // ─── Mode of Payment (company bank accounts) ─────────────────────────────────

  // Selectable per proposal; rendered with the payment terms on the PDF.
  const modesOfPayment: {
    id: string
    label: string
    bankName: string
    accountName: string
    accountNumber: string
    branch: string | null
    swiftCode: string | null
    sortOrder: number
  }[] = [
    {
      id: 'seed-mop-bdo',
      label: 'Foreign Clients (BDO)',
      bankName: 'BDO',
      accountName: 'Sunday Elephant Creatives Inc.',
      accountNumber: '4170269821',
      branch: 'Reposo, Makati',
      swiftCode: 'BNORPHMM',
      sortOrder: 0,
    },
    {
      id: 'seed-mop-unionbank',
      label: 'Local Clients (Union Bank)',
      bankName: 'Union Bank',
      accountName: 'Sunday Elephant Creatives Inc.',
      accountNumber: '0001-3001-9033',
      branch: 'JP Rizal, Makati',
      swiftCode: null,
      sortOrder: 1,
    },
    {
      id: 'seed-mop-eastwest',
      label: 'Filinvest (EastWest)',
      bankName: 'EastWest Bank',
      accountName: 'Sunday Elephant Creatives, Inc.',
      accountNumber: '2000-4370-8286',
      branch: null,
      swiftCode: null,
      sortOrder: 2,
    },
    {
      id: 'seed-mop-robinsons',
      label: 'URC (Robinsons Bank)',
      bankName: 'Robinsons Bank',
      accountName: 'Sunday Elephant Creatives, Inc.',
      accountNumber: '1059-3010-0001-949',
      branch: '1059 JP Rizal Makati',
      swiftCode: null,
      sortOrder: 3,
    },
  ]
  for (const mop of modesOfPayment) {
    const { id, ...data } = mop
    await prisma.modeOfPayment.upsert({
      where: { id },
      update: data,
      create: { id, ...data },
    })
  }

  // ─── T&C Template ────────────────────────────────────────────────────────────

  // Service catalog categories. Kept in one place so Services and T&C templates stay in sync.
  const CATEGORIES = {
    BRANDING: 'Branding',
    STRATEGY: 'Strategy',
    PROPERTY_APPS: 'Property Brand Applications',
    SALES_MATERIALS: 'Sales Materials',
  } as const

  // ─── Terms & Conditions ──────────────────────────────────────────────────────
  //
  // The source proposals all reuse one monolithic 7-clause T&C. We segregate that
  // into a single locked "General" master (the universal clauses, applicable to
  // every engagement) plus three category-tagged supplements that layer on the
  // terms specific to that kind of work. Each stored template is self-contained
  // (master clauses + its supplement) so it can be dropped into a proposal as-is.

  const UNIVERSAL_TC = `<h2>Terms &amp; Conditions</h2>
<h3>1. Acceptance and Use of the Service</h3>
<ul>
<li>Affixing of the Client's handwritten and/or electronic signature(s) onto the Contract certifies that the Client agrees to all provisions found under these Terms and Conditions.</li>
<li>After signing by both the Client and the Studio, the Project shall formally commence and be considered an on-going transaction until Project Closure or its premature termination.</li>
<li>The Studio shall be permitted to use the Project and the Client's name as part of the Studio's portfolio.</li>
<li>The Client shall not transfer the rights of this agreement to another person or party without the prior consent of the Studio.</li>
</ul>
<h3>2. Project Payment &amp; Penalties</h3>
<ul>
<li>The Client shall pay the Studio the Project Cost as indicated in the Payment Terms section of the Contract. Amounts settled by the Client are non-refundable and cannot be transferred to other projects the Client intends to engage the Studio for.</li>
<li>The Studio reserves the right to withhold project deliverables where the Client fails to settle the project balance by its due date.</li>
<li><strong>For Clients requesting an invoice:</strong> the balance due must be settled within thirty (30) calendar days of the Studio's issuance of the invoice. Failure to settle within this grace period incurs a monthly penalty of 12% of the invoice cost until the balance is settled in full.</li>
<li><strong>For Clients who did not request an invoice:</strong> the balance due must be settled within thirty (30) calendar days of the Studio's issuance of the Statement of Account (SOA). Failure to settle within this grace period incurs a monthly penalty of 5% of the billing milestone cost until the balance is settled in full.</li>
<li>Penalty fees are automatically reflected in the Statement of Account, sent at the end of each monthly penalty cycle. The SOA requires no signature from the Client and serves as official notice of penalty.</li>
<li>Penalty fees cannot be waived and must be settled in full within thirty (30) calendar days of issuance.</li>
<li>Failure to settle the remaining balance in full after three (3) monthly penalty charges may result in legal action to recover the outstanding amount.</li>
<li>The Client must provide the Studio with a copy of BIR Form 2307 within thirty (30) days of receiving the invoice. Should the Client be exempt from declaring Withholding Tax, a BIR document detailing this exemption must be presented to the Studio.</li>
</ul>
<h3>3. Project Timeline Extension</h3>
<ul>
<li>The Client may extend the project duration by up to a total of six (6) weeks due to unforeseen circumstances such as delays in feedback, dependency on management decisions, or data gathering. The Studio will note extension requests and accommodate them only within this period.</li>
<li>The Client may request to hold the project beyond six (6) weeks and up to a 12-month period only with justifiable cause and upon settlement of the total project balance. Once the balance is settled, the Studio will hold the project and commit to fulfilling all pending items within the Scope once the Client is ready to continue. The project is considered void once the extension exceeds 12 months, after which a new contract will be provided.</li>
<li>Justifiable cause may include: a change in the Client's organizational structure, a change in business strategy, or a delay in the Client's product/service launch that affects the Project.</li>
<li>The Studio reserves the right to reasonably extend the Project deadline where delay is caused by fortuitous events, acts of God, or other analogous circumstances.</li>
</ul>
<h3>4. Project Cancellation &amp; Penalties</h3>
<ul>
<li>Should the Client pre-terminate or cancel the Project before Project End without justifiable cause, the Client shall pay an early termination fee equal to the next milestone payment due, whether or not that milestone has been completed.</li>
<li>Where the Client has been non-responsive to the contact person for four (4) weeks across email, call, and text, the Studio reserves the right to pre-terminate or cancel the Contract.</li>
</ul>
<h3>5. Other Fees</h3>
<ul>
<li><strong>Revision Fees.</strong> Two (2) major revisions are allocated per major milestone. Once output has been accepted and signed off it is considered final; additional major revisions, or revisions after sign-off, are subject to additional remuneration of 20% of the cost of each material.</li>
<li><strong>Raw or Layered File Fees.</strong> The Studio will not turn over editable or layered files unless specified in the scope of inclusions. Requests for editable source files (.aep, .ai, .psd) are subject to additional remuneration of 20% of the total project cost.</li>
<li><strong>Production Expenses.</strong> Any expenses not covered in the scope of inclusions will be charged to the Client at the end of the project via a separate contract.</li>
</ul>
<h3>6. Privacy, Intellectual Property and Content Ownership</h3>
<ul>
<li>The Studio shall not disclose the Client's personal information to any third party, nor use it for any purpose other than those related to the Project and the Contract, except upon the Client's instructions.</li>
<li>The Studio shall not be held liable for any issue regarding Content, including but not limited to misinterpretation, copyright infringement, and violations of intellectual property laws and statutes.</li>
<li>The Studio shall not be associated with the Client and/or the ultimate owner of the Project, nor with the Content and ideologies it espouses, aside from the professional relationship bound by the Contract.</li>
</ul>
<h3>7. Others</h3>
<ul>
<li>Any third-party software or platform included in the Project shall follow its respective warranties, terms of use, and general policies.</li>
</ul>`

  const BRANDING_SUPPLEMENT = `<h3>8. Brand Assets, Ownership &amp; Licensing</h3>
<ul>
<li>Upon full settlement of the Project Cost, ownership of the approved final brand assets (primary logo, approved logo variations, and the finalized visual and verbal identity) transfers to the Client.</li>
<li>High-resolution rendered files (e.g., PNG, JPEG, PDF) are included in the final turnover. Raw or layered/editable source files (e.g., .ai, .psd, .aep) are NOT included unless explicitly listed under the approved Brand Applications; requests for them are subject to additional remuneration of 20% of the total project cost.</li>
<li>Brand Book visualizations are provided for reference purposes only. Layered/editable files of these visualizations are not included in the final turnover unless explicitly stated.</li>
<li>Third-party or licensed typefaces specified in the visual identity are subject to their respective foundry licenses; procurement of commercial font licenses is the responsibility of the Client unless otherwise stated.</li>
<li>The Client is responsible for any trademark registration of the final logo and brand name. The Studio does not perform trademark clearance or registration as part of this engagement.</li>
</ul>`

  const STRATEGY_SUPPLEMENT = `<h3>8. Strategic Deliverables &amp; Advisory</h3>
<ul>
<li>Strategy deliverables (research, audits, positioning, and roadmaps) are advisory in nature. The Studio does not warrant or guarantee specific business outcomes, sales figures, engagement, or other performance metrics resulting from implementation of the strategy.</li>
<li>The Client is responsible for the accuracy and completeness of any data, technical information, and market inputs provided to the Studio. The Studio shall not be liable for conclusions drawn from inaccurate or incomplete Client-supplied information.</li>
<li>Research findings, frameworks, and proprietary methodologies developed by the Studio remain the intellectual property of the Studio; the Client is granted a license to use the delivered strategy for its own business purposes.</li>
<li>Strategy presentations are delivered in the staged sequence defined in the Scope of Work. Consolidated feedback must be provided within the agreed review windows to keep the timeline on track.</li>
</ul>`

  const COLLATERALS_SUPPLEMENT = `<h3>8. Production, Output Files &amp; Printing</h3>
<ul>
<li>Deliverables are provided as print-ready, high-resolution, production-grade digital files. Unless explicitly stated in the Scope, the Studio's engagement covers design and layout only &mdash; not physical printing, fabrication, installation, or media placement.</li>
<li>Physical production, printing, fabrication, and on-site installation of any collateral (e.g., banners, billboards, signage, hoardings, booths) are the responsibility of the Client and/or its appointed third-party suppliers.</li>
<li>Final dimensions, specifications, and site measurements must be provided by the Client. The Studio is not liable for output that does not fit due to incorrect specifications supplied by the Client.</li>
<li>Colors may vary between on-screen previews and physical print output due to differences in substrate, printer calibration, and production processes. The Studio is not liable for such variances; a physical proof from the printer is recommended prior to mass production.</li>
<li>Source files (e.g., .ai, .psd, .pdf) are turned over only where explicitly listed in the Scope. Any third-party stock photography, illustrations, or licensed assets remain subject to their respective licenses and are procured at the Client's cost unless otherwise stated.</li>
</ul>`

  // General master — the universal clauses, applicable to every engagement. Locked.
  const tcTemplate = await prisma.tCTemplate.upsert({
    where: { id: 'seed-tc-1' },
    update: {
      name: 'General Terms & Conditions',
      bodyRichText: UNIVERSAL_TC,
      categories: [
        CATEGORIES.BRANDING,
        CATEGORIES.STRATEGY,
        CATEGORIES.PROPERTY_APPS,
        CATEGORIES.SALES_MATERIALS,
      ],
      isLocked: true,
    },
    create: {
      id: 'seed-tc-1',
      name: 'General Terms & Conditions',
      bodyRichText: UNIVERSAL_TC,
      categories: [
        CATEGORIES.BRANDING,
        CATEGORIES.STRATEGY,
        CATEGORIES.PROPERTY_APPS,
        CATEGORIES.SALES_MATERIALS,
      ],
      isLocked: true,
    },
  })

  const tcBranding = await prisma.tCTemplate.upsert({
    where: { id: 'seed-tc-branding' },
    update: {
      name: 'Brand Identity & Development Terms',
      bodyRichText: `${UNIVERSAL_TC}\n${BRANDING_SUPPLEMENT}`,
      categories: [CATEGORIES.BRANDING],
    },
    create: {
      id: 'seed-tc-branding',
      name: 'Brand Identity & Development Terms',
      bodyRichText: `${UNIVERSAL_TC}\n${BRANDING_SUPPLEMENT}`,
      categories: [CATEGORIES.BRANDING],
    },
  })

  const tcStrategy = await prisma.tCTemplate.upsert({
    where: { id: 'seed-tc-strategy' },
    update: {
      name: 'Strategy & Consulting Terms',
      bodyRichText: `${UNIVERSAL_TC}\n${STRATEGY_SUPPLEMENT}`,
      categories: [CATEGORIES.STRATEGY],
    },
    create: {
      id: 'seed-tc-strategy',
      name: 'Strategy & Consulting Terms',
      bodyRichText: `${UNIVERSAL_TC}\n${STRATEGY_SUPPLEMENT}`,
      categories: [CATEGORIES.STRATEGY],
    },
  })

  const tcCollaterals = await prisma.tCTemplate.upsert({
    where: { id: 'seed-tc-collaterals' },
    update: {
      name: 'Collaterals & Production Terms',
      bodyRichText: `${UNIVERSAL_TC}\n${COLLATERALS_SUPPLEMENT}`,
      categories: [CATEGORIES.PROPERTY_APPS, CATEGORIES.SALES_MATERIALS],
    },
    create: {
      id: 'seed-tc-collaterals',
      name: 'Collaterals & Production Terms',
      bodyRichText: `${UNIVERSAL_TC}\n${COLLATERALS_SUPPLEMENT}`,
      categories: [CATEGORIES.PROPERTY_APPS, CATEGORIES.SALES_MATERIALS],
    },
  })

  // ─── Services ────────────────────────────────────────────────────────────────

  // Small helper to keep the 14 service upserts readable and consistent.
  type ServiceSeed = {
    id: string
    name: string
    category: string
    description: string
    defaultScope: string
    unit: string
    defaultRate: number
    minRate: number
    maxRate: number
    tcTemplateId: string
    paymentTplId: string
    internalNotes?: string
  }

  const seedService = (s: ServiceSeed) =>
    prisma.service.upsert({
      where: { id: s.id },
      update: {
        name: s.name,
        category: s.category,
        description: s.description,
        defaultScope: s.defaultScope,
        unit: s.unit,
        defaultRate: s.defaultRate,
        minRate: s.minRate,
        maxRate: s.maxRate,
        tcTemplateId: s.tcTemplateId,
        paymentTplId: s.paymentTplId,
        internalNotes: s.internalNotes ?? null,
      },
      create: {
        id: s.id,
        name: s.name,
        category: s.category,
        description: s.description,
        defaultScope: s.defaultScope,
        unit: s.unit,
        defaultRate: s.defaultRate,
        minRate: s.minRate,
        maxRate: s.maxRate,
        tcTemplateId: s.tcTemplateId,
        paymentTplId: s.paymentTplId,
        internalNotes: s.internalNotes ?? null,
      },
    })

  // ── Branding ──
  const brandIdentity = await seedService({
    id: 'seed-service-brand-identity',
    name: 'Brand Identity Development',
    category: CATEGORIES.BRANDING,
    description:
      'End-to-end brand identity system — strategy, logo, visual and verbal identity, brand applications, and a full brand guidelines book.',
    defaultScope:
      'Brand Discovery Workshop; Brand Strategy/DNA (industry scan, competitive scan, target market profiles, positioning & value proposition, brand narrative); Logo Development (main logo, variations, usage guidelines, high-resolution renders); Tagline Development; Visual Identity (creative direction, primary & secondary color system, typography, graphic elements, image style & art direction, layout samples); Verbal Identity (brand narrative, persona & voice with guardrails, brand vocabulary); Standard Brand Applications (presentation masterslide, email signature, and corporate stationery: ID, business card, letterhead, folder, envelope, lanyard); and a complete Brand Book covering logo, visual, and verbal identity guidelines. Includes two (2) rounds of revisions per phase.',
    unit: 'project',
    defaultRate: 350000,
    minRate: 280000,
    maxRate: 525000,
    tcTemplateId: tcBranding.id,
    paymentTplId: paymentTemplate2.id,
    internalNotes: 'Ref CE_OTE261475 / CE_OTE261517. 12-week timeline from kick-off. High-res renders only; raw/layered files billed at +20%.',
  })

  // ── Strategy ──
  const socialStrategy = await seedService({
    id: 'seed-service-social-strategy',
    name: 'Social Media Strategy',
    category: CATEGORIES.STRATEGY,
    description:
      "Research-and-planning engagement that establishes the brand's digital foundation and go-to-market strategy.",
    defaultScope:
      'Discovery & Strategy Workshop (one alignment session with the marketing team); Market Intelligence (industry study, competitive study); Brand Audit & Situation Review (challenges & opportunities, objectives, brand positioning, target market profile); Strategic Roadmap Development (big idea, communications strategy, channel strategy, content strategy); and a two-part strategy delivery — Research & Positioning presentation followed by a Campaign Strategy & Creatives presentation, plus a feedback presentation. Includes two (2) rounds of revisions.',
    unit: 'project',
    defaultRate: 250000,
    minRate: 200000,
    maxRate: 375000,
    tcTemplateId: tcStrategy.id,
    paymentTplId: paymentTemplate.id,
    internalNotes: 'Ref CE_OTE261500. 45-day timeline from kick-off. Billed 100% on kick-off.',
  })

  // ── Property Brand Applications ──
  const keyVisualPoster = await seedService({
    id: 'seed-service-key-visual',
    name: 'Key Visual / Omnibus Poster',
    category: CATEGORIES.PROPERTY_APPS,
    description: 'One key visual / omnibus poster design with a facade mockup and print-ready output.',
    defaultScope:
      'One (1) unique key visual / omnibus poster design; graphic design and layout based on provided brand guidelines; 2D digital facade mockup; print-ready high-resolution files plus editable source files (.AI/.PSD/.PDF).',
    unit: 'design',
    defaultRate: 50000,
    minRate: 40000,
    maxRate: 75000,
    tcTemplateId: tcCollaterals.id,
    paymentTplId: paymentTemplate.id,
  })

  const lamppostBanners = await seedService({
    id: 'seed-service-lamppost',
    name: 'Lamppost Banners',
    category: CATEGORIES.PROPERTY_APPS,
    description: 'Set of four lamppost banner designs adapted to client-provided dimensions.',
    defaultScope:
      'Four (4) unique lamppost banner designs; graphic design and layout based on provided brand guidelines; format adaptation to client-provided dimensions; print-ready high-resolution files plus editable source files (.AI/.PSD/.PDF).',
    unit: 'set',
    defaultRate: 96000,
    minRate: 76800,
    maxRate: 144000,
    tcTemplateId: tcCollaterals.id,
    paymentTplId: paymentTemplate.id,
  })

  const billboardDesign = await seedService({
    id: 'seed-service-billboard',
    name: 'Billboard Design',
    category: CATEGORIES.PROPERTY_APPS,
    description: 'One billboard design with a facade mockup and print-ready output.',
    defaultScope:
      'One (1) unique billboard design; graphic design and layout based on provided brand guidelines; 2D digital mockup; print-ready high-resolution files plus editable source files (.AI/.PSD/.PDF).',
    unit: 'design',
    defaultRate: 96000,
    minRate: 76800,
    maxRate: 144000,
    tcTemplateId: tcCollaterals.id,
    paymentTplId: paymentTemplate.id,
  })

  const signageFacade = await seedService({
    id: 'seed-service-signage',
    name: 'Signage & Facade',
    category: CATEGORIES.PROPERTY_APPS,
    description: 'Primary signage / facade design with a property mockup.',
    defaultScope:
      'One (1) unique signage/facade design; graphic design and layout based on provided brand guidelines; 2D digital mockup applied to the actual property facade; print-ready high-resolution files plus editable source files (.AI/.PSD/.PDF).',
    unit: 'design',
    defaultRate: 30000,
    minRate: 24000,
    maxRate: 45000,
    tcTemplateId: tcCollaterals.id,
    paymentTplId: paymentTemplate.id,
  })

  const hoardings = await seedService({
    id: 'seed-service-hoardings',
    name: 'Hoardings / Board-Ups',
    category: CATEGORIES.PROPERTY_APPS,
    description: 'Set of four hoarding / board-up designs for the site perimeter.',
    defaultScope:
      'Four (4) unique hoarding/board-up designs; graphic design and layout based on provided brand guidelines; format adaptation to client-provided dimensions; print-ready high-resolution files plus editable source files (.AI/.PSD/.PDF).',
    unit: 'set',
    defaultRate: 120000,
    minRate: 96000,
    maxRate: 180000,
    tcTemplateId: tcCollaterals.id,
    paymentTplId: paymentTemplate.id,
  })

  const wayfinding = await seedService({
    id: 'seed-service-wayfinding',
    name: 'Wayfinding / Environmental Graphic Design',
    category: CATEGORIES.PROPERTY_APPS,
    description: 'Cohesive wayfinding and environmental graphic system across ten sign types.',
    defaultScope:
      'Wayfinding system design across ten (10) sign types — unit & floor identification, room & amenity labeling, directional & wayfinding signage, and parking & regulatory signs; 2D digital mockups applied to site photos or architectural elevations to demonstrate scale and visibility; print-ready high-resolution files plus editable source files (.AI/.PSD/.PDF).',
    unit: 'project',
    defaultRate: 110000,
    minRate: 88000,
    maxRate: 165000,
    tcTemplateId: tcCollaterals.id,
    paymentTplId: paymentTemplate.id,
  })

  // ── Sales Materials ──
  const companyProfile = await seedService({
    id: 'seed-service-company-profile',
    name: 'Digital Company Profile / Property Overview',
    category: CATEGORIES.SALES_MATERIALS,
    description: 'Digital company / property overview presentation (up to 25 pages, 16:9).',
    defaultScope:
      'Graphic design and layout based on brand identity; basic animation for transitions; information architecture; content development (all technical information provided by the client); 16:9 standard presentation format; maximum 25 pages; delivered as a static PDF plus Google Slides source (exportable to PPTX/Keynote).',
    unit: 'project',
    defaultRate: 80000,
    minRate: 64000,
    maxRate: 120000,
    tcTemplateId: tcCollaterals.id,
    paymentTplId: paymentTemplate.id,
  })

  const brochure = await seedService({
    id: 'seed-service-brochure',
    name: 'Brochure Design',
    category: CATEGORIES.SALES_MATERIALS,
    description: 'A4 trifold brochure, back-to-back (6 panels).',
    defaultScope:
      'Graphic design and layout based on brand identity; information architecture; content development (all technical information provided by the client); A4 trifold, back-to-back, 6 panels; print-ready high-resolution files plus editable source files (.AI/.PSD/.PDF).',
    unit: 'design',
    defaultRate: 30000,
    minRate: 24000,
    maxRate: 45000,
    tcTemplateId: tcCollaterals.id,
    paymentTplId: paymentTemplate.id,
  })

  const flyer = await seedService({
    id: 'seed-service-flyer',
    name: 'One-Page Flyer',
    category: CATEGORIES.SALES_MATERIALS,
    description: 'Single-page A4/A5 marketing flyer (visual-led).',
    defaultScope:
      'Graphic design and layout based on brand identity; content development (visual-led, not text-heavy); A4/A5 standard flyer; single side (not back-to-back); print-ready high-resolution files plus editable source files (.AI/.PSD/.PDF).',
    unit: 'design',
    defaultRate: 12000,
    minRate: 9600,
    maxRate: 18000,
    tcTemplateId: tcCollaterals.id,
    paymentTplId: paymentTemplate.id,
  })

  const pullUpBanner = await seedService({
    id: 'seed-service-pullup',
    name: 'Pull-Up Banner',
    category: CATEGORIES.SALES_MATERIALS,
    description: 'Standard pull-up banner (2.5 x 6 ft).',
    defaultScope:
      'Graphic design and layout based on brand identity; standard pull-up banner (2.5 x 6 ft); single panel (not back-to-back); print-ready high-resolution files plus editable source files (.AI/.PSD/.PDF).',
    unit: 'design',
    defaultRate: 12000,
    minRate: 9600,
    maxRate: 18000,
    tcTemplateId: tcCollaterals.id,
    paymentTplId: paymentTemplate.id,
  })

  const boothDesign = await seedService({
    id: 'seed-service-booth',
    name: 'Collapsible Booth Design',
    category: CATEGORIES.SALES_MATERIALS,
    description: 'Collapsible exhibition booth design (front, header, two sides).',
    defaultScope:
      'Graphic design and layout based on brand identity; standard collapsible booth — front 32" x 32", side panels 31" x 16", header 31.5" x 12"; up to 5 components (1 front, 1 header, 2 sides); print-ready high-resolution files plus editable source files (.AI/.PSD/.PDF).',
    unit: 'project',
    defaultRate: 25000,
    minRate: 20000,
    maxRate: 37500,
    tcTemplateId: tcCollaterals.id,
    paymentTplId: paymentTemplate.id,
  })

  const newsletter = await seedService({
    id: 'seed-service-newsletter',
    name: 'Newsletter Design',
    category: CATEGORIES.SALES_MATERIALS,
    description: 'Omnibus property newsletter design with copywriting (up to 500 words).',
    defaultScope:
      'Omnibus newsletter focused on property overview and USPs; graphic design and layout (dimensions provided by the client, width up to 2000px); content writing up to five hundred (500) words covering header, about the property, value proposition, unit overview, call-to-action, and footer; up to two (2) revisions. Excludes raw file turnover, emailer integration, client database, and development.',
    unit: 'design',
    defaultRate: 40000,
    minRate: 32000,
    maxRate: 60000,
    tcTemplateId: tcCollaterals.id,
    paymentTplId: paymentTemplate.id,
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
      projectTitle: 'Brand Identity & Launch Strategy',
      date: new Date('2026-03-01'),
      validUntil: new Date('2026-03-31'),
      status: ProposalStatus.DRAFT,
      createdById: juan.id,
      assignedApproverId: manager.id,
      subtotal: 600000,
      vatRate: 12,
      total: 672000,
      paymentTemplateId: paymentTemplate2.id,
      tcTemplateId: tcBranding.id,
      lineItems: {
        create: [
          {
            serviceId: brandIdentity.id,
            description: 'Brand Identity Development',
            scopeOfWork: brandIdentity.defaultScope,
            unit: 'project',
            quantity: 1,
            unitRate: 350000,
            lineTotal: 350000,
            sortOrder: 1,
          },
          {
            serviceId: socialStrategy.id,
            description: 'Social Media Strategy',
            scopeOfWork: socialStrategy.defaultScope,
            unit: 'project',
            quantity: 1,
            unitRate: 250000,
            lineTotal: 250000,
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
      projectTitle: 'Sales Collateral Suite',
      date: new Date('2026-03-05'),
      validUntil: new Date('2026-04-04'),
      status: ProposalStatus.PENDING_APPROVAL,
      createdById: juan.id,
      assignedApproverId: manager.id,
      subtotal: 122000,
      vatRate: 12,
      total: 136640,
      paymentTemplateId: paymentTemplate.id,
      tcTemplateId: tcCollaterals.id,
      lineItems: {
        create: [
          {
            serviceId: companyProfile.id,
            description: 'Digital Company Profile / Property Overview',
            scopeOfWork: companyProfile.defaultScope,
            unit: 'project',
            quantity: 1,
            unitRate: 80000,
            lineTotal: 80000,
            sortOrder: 1,
          },
          {
            serviceId: brochure.id,
            description: 'Brochure Design',
            scopeOfWork: brochure.defaultScope,
            unit: 'design',
            quantity: 1,
            unitRate: 30000,
            lineTotal: 30000,
            sortOrder: 2,
          },
          {
            serviceId: flyer.id,
            description: 'One-Page Flyer',
            scopeOfWork: flyer.defaultScope,
            unit: 'design',
            quantity: 1,
            unitRate: 12000,
            lineTotal: 12000,
            sortOrder: 3,
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
      projectTitle: 'Property Brand Applications Rollout',
      date: new Date('2026-03-10'),
      validUntil: new Date('2026-04-09'),
      status: ProposalStatus.APPROVED,
      createdById: juan.id,
      assignedApproverId: manager.id,
      subtotal: 352000,
      vatRate: 12,
      total: 394240,
      paymentTemplateId: paymentTemplate.id,
      tcTemplateId: tcCollaterals.id,
      // New multi-select model: two sections compiled in order, the second
      // overridden for this proposal. Demonstrates the compiled-PDF flow.
      tcSections: [
        { tcTemplateId: tcCollaterals.id, override: null },
        {
          tcTemplateId: tcStrategy.id,
          override: `${UNIVERSAL_TC}\n<p><strong>Note for Acme Corp:</strong> Strategy deliverables for this rollout are limited to the on-site application plan.</p>`,
        },
      ],
      lineItems: {
        create: [
          {
            serviceId: keyVisualPoster.id,
            description: 'Key Visual / Omnibus Poster',
            scopeOfWork: keyVisualPoster.defaultScope,
            unit: 'design',
            quantity: 1,
            unitRate: 50000,
            lineTotal: 50000,
            sortOrder: 1,
          },
          {
            serviceId: billboardDesign.id,
            description: 'Billboard Design',
            scopeOfWork: billboardDesign.defaultScope,
            unit: 'design',
            quantity: 1,
            unitRate: 96000,
            lineTotal: 96000,
            sortOrder: 2,
          },
          {
            serviceId: wayfinding.id,
            description: 'Wayfinding / Environmental Graphic Design',
            scopeOfWork: wayfinding.defaultScope,
            unit: 'project',
            quantity: 1,
            unitRate: 110000,
            lineTotal: 110000,
            sortOrder: 3,
          },
          {
            serviceId: lamppostBanners.id,
            description: 'Lamppost Banners',
            scopeOfWork: lamppostBanners.defaultScope,
            unit: 'set',
            quantity: 1,
            unitRate: 96000,
            lineTotal: 96000,
            isOptional: true,
            sortOrder: 4,
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
        proposal: { clientName: 'Acme Corp', projectTitle: 'Property Brand Applications Rollout', subtotal: '256000', total: '286720', currency: 'PHP' },
        lineItems: [
          { description: 'Key Visual / Omnibus Poster', quantity: '1', unitRate: '50000', lineTotal: '50000', unit: 'design', isOptional: false },
          { description: 'Billboard Design', quantity: '1', unitRate: '96000', lineTotal: '96000', unit: 'design', isOptional: false },
          { description: 'Wayfinding / Environmental Graphic Design', quantity: '1', unitRate: '110000', lineTotal: '110000', unit: 'project', isOptional: false },
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
      changeSummary: 'Added optional Lamppost Banners line item. Subtotal increased from ₱256,000 to ₱352,000.',
      snapshotJson: {
        proposal: { clientName: 'Acme Corp', projectTitle: 'Property Brand Applications Rollout', subtotal: '352000', total: '394240', currency: 'PHP' },
        lineItems: [
          { description: 'Key Visual / Omnibus Poster', quantity: '1', unitRate: '50000', lineTotal: '50000', unit: 'design', isOptional: false },
          { description: 'Billboard Design', quantity: '1', unitRate: '96000', lineTotal: '96000', unit: 'design', isOptional: false },
          { description: 'Wayfinding / Environmental Graphic Design', quantity: '1', unitRate: '110000', lineTotal: '110000', unit: 'project', isOptional: false },
          { description: 'Lamppost Banners', quantity: '1', unitRate: '96000', lineTotal: '96000', unit: 'set', isOptional: true },
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

  // Activity feed items for the APPROVED proposal (tasks / note / link).
  // One open task is due yesterday to exercise the overdue treatment and the
  // dashboard "My Tasks" widget. No FILE row — there is no storage object to
  // back it, and the download action would 404.
  const yesterday = new Date(Date.now() - 86_400_000)
  yesterday.setUTCHours(0, 0, 0, 0)
  await prisma.proposalActivity.upsert({
    where: { id: 'seed-activity-task-open' },
    update: {},
    create: {
      id: 'seed-activity-task-open',
      proposalId: approvedProposal.id,
      type: ActivityType.TASK,
      title: 'Send the signed conforme copy to accounting',
      body: 'Client promised to courier the signed printout — chase if not received.',
      dueDate: yesterday,
      assigneeId: juan.id,
      createdById: manager.id,
    },
  })
  await prisma.proposalActivity.upsert({
    where: { id: 'seed-activity-task-done' },
    update: {},
    create: {
      id: 'seed-activity-task-done',
      proposalId: approvedProposal.id,
      type: ActivityType.TASK,
      title: 'Book kick-off call with Acme marketing team',
      assigneeId: manager.id,
      createdById: juan.id,
      completedAt: new Date(),
      completedById: manager.id,
    },
  })
  await prisma.proposalActivity.upsert({
    where: { id: 'seed-activity-note' },
    update: {},
    create: {
      id: 'seed-activity-note',
      proposalId: approvedProposal.id,
      type: ActivityType.NOTE,
      body: '<p>Client confirmed the <strong>rollout starts in Q3</strong>. Billboard sites are still being finalised with the mall operator — expect the final list next week.</p>',
      createdById: juan.id,
    },
  })
  await prisma.proposalActivity.upsert({
    where: { id: 'seed-activity-link' },
    update: {},
    create: {
      id: 'seed-activity-link',
      proposalId: approvedProposal.id,
      type: ActivityType.LINK,
      url: 'https://drive.google.com/drive/folders/acme-brand-assets',
      title: 'Acme brand asset folder',
      body: 'Logos, fonts and photography shared by the client.',
      createdById: manager.id,
    },
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
      projectTitle: 'Social Media Strategy',
      date: new Date('2026-02-01'),
      validUntil: new Date('2026-03-01'),
      status: ProposalStatus.WON,
      createdById: juan.id,
      assignedApproverId: manager.id,
      subtotal: 250000,
      vatRate: 12,
      total: 280000,
      paymentTemplateId: paymentTemplate.id,
      tcTemplateId: tcStrategy.id,
      lineItems: {
        create: [
          {
            serviceId: socialStrategy.id,
            description: 'Social Media Strategy',
            scopeOfWork: socialStrategy.defaultScope,
            unit: 'project',
            quantity: 1,
            unitRate: 250000,
            lineTotal: 250000,
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
      projectTitle: 'Sales Collaterals Package',
      date: new Date('2026-02-10'),
      validUntil: new Date('2026-03-10'),
      status: ProposalStatus.LOST,
      lostReason: 'Budget',
      createdById: juan.id,
      assignedApproverId: manager.id,
      subtotal: 70000,
      vatRate: 12,
      total: 78400,
      paymentTemplateId: paymentTemplate.id,
      tcTemplateId: tcCollaterals.id,
      lineItems: {
        create: [
          {
            serviceId: newsletter.id,
            description: 'Newsletter Design',
            scopeOfWork: newsletter.defaultScope,
            unit: 'design',
            quantity: 1,
            unitRate: 40000,
            lineTotal: 40000,
            sortOrder: 1,
          },
          {
            serviceId: brochure.id,
            description: 'Brochure Design',
            scopeOfWork: brochure.defaultScope,
            unit: 'design',
            quantity: 1,
            unitRate: 30000,
            lineTotal: 30000,
            sortOrder: 2,
          },
        ],
      },
    },
  })

  // ─── Payment-schedule demo proposals ──────────────────────────────────────────
  // Exercise the PDF payment-schedule breakdown. Percentage milestones are already
  // demoed by PROP-2026-03-0001 (uses the "Milestone — 50/30/20" template); these
  // two cover the monthly and downpayment paths. Line-item `unit: 'monthly'` drives
  // the engagement length regardless of the underlying service's default unit.

  // A. One-time fee + monthly retainer (fee billed upfront in Month 1).
  const psMonthly = await prisma.proposal.upsert({
    where: { number: 'PROP-2026-03-0010' },
    update: {},
    create: {
      number: 'PROP-2026-03-0010',
      clientId: acme.id,
      clientName: 'Acme Corp',
      contactName: 'Maria Santos',
      contactTitle: 'CEO',
      projectTitle: 'Brand Launch & Always-On Social',
      date: new Date('2026-03-18'),
      validUntil: new Date('2026-04-17'),
      status: ProposalStatus.APPROVED,
      createdById: juan.id,
      assignedApproverId: manager.id,
      subtotal: 900000,
      total: 900000,
      paymentTemplateId: paymentTemplate3.id, // Monthly Retainer
      tcTemplateId: tcTemplate.id,
      lineItems: {
        create: [
          {
            serviceId: brandIdentity.id,
            description: 'Brand Identity Development',
            scopeOfWork: brandIdentity.defaultScope,
            unit: 'one-time',
            quantity: 1,
            unitRate: 300000,
            lineTotal: 300000,
            sortOrder: 1,
          },
          {
            serviceId: socialStrategy.id,
            description: 'Always-On Social Media Retainer',
            scopeOfWork: socialStrategy.defaultScope,
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
    where: { id: 'seed-event-ps-1' },
    update: {},
    create: { id: 'seed-event-ps-1', proposalId: psMonthly.id, action: 'submitted', actorId: juan.id },
  })
  await prisma.approvalEvent.upsert({
    where: { id: 'seed-event-ps-2' },
    update: {},
    create: { id: 'seed-event-ps-2', proposalId: psMonthly.id, action: 'approved', actorId: manager.id, comment: 'Approved.' },
  })

  // B. Pure retainer with a 20% downpayment (downpayment + Month 1 upfront).
  const psDownpayment = await prisma.proposal.upsert({
    where: { number: 'PROP-2026-03-0011' },
    update: {},
    create: {
      number: 'PROP-2026-03-0011',
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
      paymentTemplateId: paymentTemplate4.id, // Retainer — 20% Downpayment
      tcTemplateId: tcTemplate.id,
      lineItems: {
        create: [
          {
            serviceId: socialStrategy.id,
            description: 'Always-On Social Media Retainer',
            scopeOfWork: socialStrategy.defaultScope,
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
    where: { id: 'seed-event-ps-3' },
    update: {},
    create: { id: 'seed-event-ps-3', proposalId: psDownpayment.id, action: 'submitted', actorId: juan.id },
  })
  await prisma.approvalEvent.upsert({
    where: { id: 'seed-event-ps-4' },
    update: {},
    create: { id: 'seed-event-ps-4', proposalId: psDownpayment.id, action: 'approved', actorId: manager.id, comment: 'Approved.' },
  })

  console.log('Seed complete:', {
    users: [admin.email, manager.email, juan.email, coo.email, ceo.email],
    team: team.name,
    clients: ['Acme Corp', 'BuildRight Construction', 'FreshBite Food Group'],
    services: [
      brandIdentity.name,
      socialStrategy.name,
      keyVisualPoster.name,
      lamppostBanners.name,
      billboardDesign.name,
      signageFacade.name,
      hoardings.name,
      wayfinding.name,
      companyProfile.name,
      brochure.name,
      flyer.name,
      pullUpBanner.name,
      boothDesign.name,
      newsletter.name,
    ],
    paymentTemplates: [
      paymentTemplate.name,
      paymentTemplate2.name,
      paymentTemplate3.name,
      paymentTemplate4.name,
    ],
    tcTemplates: [tcTemplate.name, tcBranding.name, tcStrategy.name, tcCollaterals.name],
    proposals: 7,
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
