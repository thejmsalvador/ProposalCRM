# CLAUDE.md — ProposalCRM

This file is the single source of truth for building ProposalCRM. Read it at the start of every session. When in doubt about a field name, route, behavior, or rule — check here first.

---

## What We Are Building

**ProposalCRM** — an internal web app for a creative advertising agency's sales team. It lets sales staff build, approve, and deliver polished client-facing proposals as PDFs. The goal is to cut proposal turnaround from hours to minutes and eliminate pricing errors.

**Users are internal only.** No client-facing portal. Access is invite-only — no public sign-up.

---

## Tech Stack

Do not deviate from this stack.

| Layer | Choice |
|---|---|
| Framework | Next.js 14+ App Router |
| UI | shadcn/ui + Tailwind CSS |
| Database | PostgreSQL via Supabase |
| ORM | Prisma |
| Auth | Supabase Auth (email/password + optional Google SSO) |
| Rich text | Tiptap (`@tiptap/react`) |
| Forms | react-hook-form + zod |
| PDF | Puppeteer + `@sparticuz/chromium-min` (Vercel-compatible) |
| Charts | Recharts |
| File storage | Supabase Storage |
| Email | Resend |
| Drag-and-drop | @dnd-kit/core + @dnd-kit/sortable |
| Deployment | Vercel |

---

## Environment Variables

```env
DATABASE_URL=
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
NEXTAUTH_SECRET=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
RESEND_API_KEY=
NEXT_PUBLIC_APP_URL=
STORAGE_BUCKET_NAME=proposals
APPROVAL_SLA_HOURS=48
HIGH_VALUE_THRESHOLD=500000
CRON_SECRET=
```

---

## Folder Structure Conventions

```
app/
  (app)/              ← all authenticated pages live here
    layout.tsx        ← app shell with sidebar + header
    dashboard/
    proposals/
      new/            ← wizard
      [id]/           ← detail + activity + version history
    catalog/
    payment-terms/
    tc-templates/
    clients/
    users/
  login/
  auth/callback/
  pdf/[proposalId]/   ← PDF template route (no app shell)
  api/
    pdf/generate/     ← Puppeteer trigger
    pdf/bulk-download/
    cron/
      approval-sla/
      expire-proposals/

lib/
  auth.ts             ← getSession(), session helpers
  permissions.ts      ← can(user, action) helper
  prisma.ts           ← singleton Prisma client
  supabase.ts         ← Supabase client
  email.ts            ← Resend email sender
  types.ts            ← TypeScript interfaces mirroring Prisma schema
  queries/
    dashboard.ts      ← dashboard data queries

components/
  ui/                 ← shadcn/ui components
  ui/rich-text-editor.tsx  ← reusable Tiptap wrapper
  proposal/           ← wizard step components
  layout/             ← sidebar, header, bottom nav

prisma/
  schema.prisma
  seed.ts
```

---

## Database Schema

Use these exact model names and field names everywhere. Do not rename or abbreviate. This mirrors `prisma/schema.prisma` as it stands today — the schema has grown considerably beyond the original PRD (see notes after the block).

```prisma
enum Role {
  SALES_EXEC
  SALES_MANAGER
  ADMIN
  COO
  CEO
  SUPER_ADMIN
}

enum ProposalStatus {
  DRAFT
  PENDING_APPROVAL
  REVISION_REQUIRED
  APPROVED
  SENT
  WON
  LOST
  ON_HOLD
  EXPIRED
}

model User {
  id                String    @id @default(cuid())
  name              String
  email             String    @unique
  role              Role      @default(SALES_EXEC)
  jobTitle          String?
  avatarUrl         String?
  // Sign-off signature image (data URI) shown on approved proposal PDFs for
  // internal approvers (COO/CEO). Optional; uploaded in the Users admin.
  signatureImageUrl String?
  teamId            String?
  defaultApproverId String?
  isActive          Boolean   @default(true)
  createdAt         DateTime  @default(now())
  lastLoginAt       DateTime?

  team              Team?             @relation("TeamMembers", fields: [teamId], references: [id])
  managedTeams      Team[]            @relation("TeamManager")
  createdProposals  Proposal[]        @relation("ProposalCreatedBy")
  approvedProposals Proposal[]        @relation("ProposalApprover")
  proposalVersions  ProposalVersion[]
  approvalEvents    ApprovalEvent[]
  auditLogs         AuditLog[]
  notifications     Notification[]
}

model Team {
  id        String  @id @default(cuid())
  name      String
  managerId String?

  manager User?  @relation("TeamManager", fields: [managerId], references: [id])
  members User[] @relation("TeamMembers")
}

model Service {
  id              String    @id @default(cuid())
  name            String
  category        String
  description     String
  defaultScope    String    @db.Text
  unit            String
  defaultRate     Decimal   @db.Decimal(12, 2)
  minRate         Decimal?  @db.Decimal(12, 2)
  maxRate         Decimal?  @db.Decimal(12, 2)
  engagementTerm  Int       @default(1)
  currency        String    @default("PHP")
  exchangeRate    Decimal?  @db.Decimal(12, 6)
  estimatedExpenses Json?
  tcTemplateId    String?
  paymentTplId    String?
  isActive        Boolean   @default(true)
  internalNotes   String?
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt

  tcTemplate      TCTemplate?      @relation(fields: [tcTemplateId], references: [id])
  paymentTemplate PaymentTemplate? @relation(fields: [paymentTplId], references: [id])
  lineItems       ProposalLineItem[]
}

model PaymentTemplate {
  id           String    @id @default(cuid())
  name         String
  bodyRichText String    @db.Text
  milestones   Json?
  // How milestone percentages are calculated: 'total' (share of grand total) or
  // 'remaining' (upfront % of total, succeeding rows % of the leftover). Null = legacy 'total'.
  milestoneBasis String? @db.Text
  isDefault    Boolean   @default(false)
  isArchived   Boolean   @default(false)
  createdAt    DateTime  @default(now())
  updatedAt    DateTime  @updatedAt

  services  Service[]
  proposals Proposal[]
}

model TCTemplate {
  id           String    @id @default(cuid())
  name         String
  bodyRichText String    @db.Text
  categories   String[]
  isArchived   Boolean   @default(false)
  isLocked     Boolean   @default(false)
  createdAt    DateTime  @default(now())
  updatedAt    DateTime  @updatedAt

  services  Service[]
  proposals Proposal[]
}

// A reusable company bank account / "mode of payment". Multi-selected per
// proposal and stored as Proposal.modesOfPayment JSON (no FK, mirroring tcSections).
model ModeOfPayment {
  id            String   @id @default(cuid())
  label         String // category/label, e.g. "Foreign Clients (BDO)"
  bankName      String
  accountName   String
  accountNumber String
  branch        String?
  swiftCode     String?
  sortOrder     Int      @default(0)
  isArchived    Boolean  @default(false)
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
}

model Client {
  id          String   @id @default(cuid())
  companyName String
  // Short internal account code (e.g. "SUNB" for Sunrise Beverages). Free-form,
  // typically 3–5 letters; used for naming conventions. Not client-facing.
  accountCode String?
  industry    String?
  website     String?
  address     String?
  notes       String?  @db.Text
  createdById String
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  contacts  ClientContact[]
  proposals Proposal[]
}

model ClientContact {
  id           String   @id @default(cuid())
  clientId     String?
  contactName  String?
  contactTitle String?
  department   String?
  email        String?
  phone        String?
  isPrimary    Boolean  @default(false)
  notes        String?  @db.Text
  createdById  String
  createdAt    DateTime @default(now())

  client Client? @relation(fields: [clientId], references: [id], onDelete: SetNull)

  @@index([clientId])
}

model Proposal {
  id                    String         @id @default(cuid())
  number                String         @unique
  version               Int            @default(1)
  clientId              String?
  clientName            String
  // Snapshot of the client's account code at proposal time (see Client.accountCode).
  accountCode           String?
  contactName           String?
  contactTitle          String?
  department            String?
  contactEmail          String?
  contactPhone          String?
  businessAddress       String?
  tin                   String?
  brandName             String?
  projectTitle          String
  date                  DateTime
  validUntil            DateTime
  status                ProposalStatus @default(DRAFT)
  createdById           String
  assignedApproverId    String?
  cooApprovedAt         DateTime?
  cooApprovedById       String?
  ceoApprovedAt         DateTime?
  ceoApprovedById       String?
  currency              String         @default("PHP")
  exchangeRate          Decimal?       @db.Decimal(12, 6)
  subtotal              Decimal        @db.Decimal(12, 2)
  discountType          String?
  discountValue         Decimal?       @db.Decimal(12, 2)
  vatRate               Decimal?       @db.Decimal(5, 2)
  total                 Decimal        @db.Decimal(12, 2)
  pricingNotes          String?
  introText             String?        @db.Text
  paymentTemplateId     String?
  paymentTermsOverride  String?        @db.Text
  paymentMilestones     Json?
  // Calculation basis for this proposal's milestone override. Null = inherit the template's.
  milestoneBasis        String?        @db.Text
  tcTemplateId          String?
  tcOverride            String?        @db.Text
  // Ordered per-proposal T&C section selection: [{ tcTemplateId, override }].
  // Supersedes the single tcTemplateId/tcOverride above (kept for legacy fallback).
  tcSections            Json?
  // Ordered per-proposal Mode-of-Payment (bank account) selection: [{ modeOfPaymentId }].
  modesOfPayment        Json?
  // Client-side "Conforme" signatories rendered on the PDF: [{ name, position,
  // companyName }]. The client signs the printed PDF by hand (off-platform).
  signatories           Json?
  confidentialWatermark Boolean        @default(false)
  hasBelowFloorPricing  Boolean        @default(false)
  lostReason            String?
  internalNotes         String?
  createdAt             DateTime       @default(now())
  updatedAt             DateTime       @updatedAt

  client          Client?           @relation(fields: [clientId], references: [id])
  createdBy       User              @relation("ProposalCreatedBy", fields: [createdById], references: [id])
  assignedApprover User?            @relation("ProposalApprover", fields: [assignedApproverId], references: [id])
  paymentTemplate PaymentTemplate?  @relation(fields: [paymentTemplateId], references: [id])
  tcTemplate      TCTemplate?       @relation(fields: [tcTemplateId], references: [id])
  lineItems       ProposalLineItem[]
  versions        ProposalVersion[]
  approvalEvents  ApprovalEvent[]

  @@index([createdById])
  @@index([clientId])
  @@index([status])
  @@index([updatedAt])
}

model ProposalLineItem {
  id           String   @id @default(cuid())
  proposalId   String
  serviceId    String?
  customName   String?
  description  String
  scopeOfWork  String   @db.Text
  unit         String
  quantity     Decimal  @db.Decimal(12, 4)
  unitRate     Decimal  @db.Decimal(12, 2)
  lineTotal    Decimal  @db.Decimal(12, 2)
  isOptional   Boolean  @default(false)
  internalNote String?
  expenses     Json?
  sortOrder    Int

  proposal Proposal @relation(fields: [proposalId], references: [id], onDelete: Cascade)
  service  Service? @relation(fields: [serviceId], references: [id])

  @@index([proposalId])
}

model ProposalVersion {
  id            String         @id @default(cuid())
  proposalId    String
  versionNumber Int
  snapshotJson  Json
  pdfUrl        String?
  createdById   String
  changeSummary String?
  status        ProposalStatus
  createdAt     DateTime       @default(now())

  proposal  Proposal @relation(fields: [proposalId], references: [id])
  createdBy User     @relation(fields: [createdById], references: [id])

  @@index([proposalId])
}

model ApprovalEvent {
  id         String   @id @default(cuid())
  proposalId String
  action     String
  actorId    String
  comment    String?
  createdAt  DateTime @default(now())

  proposal Proposal @relation(fields: [proposalId], references: [id])
  actor    User     @relation(fields: [actorId], references: [id])

  @@index([proposalId])
}

model AuditLog {
  id         String   @id @default(cuid())
  entityType String
  entityId   String
  action     String
  actorId    String
  diffJson   Json?
  createdAt  DateTime @default(now())

  actor User @relation(fields: [actorId], references: [id])

  @@index([entityType, entityId])
}

model SystemSettings {
  id                  String   @id @default(cuid())
  agencyName          String
  agencyLogoUrl       String?
  brandColorHex       String   @default("#4F46E5")
  defaultValidityDays Int      @default(30)
  defaultCurrency     String   @default("PHP")
  defaultVatRate      Decimal  @default(12.00) @db.Decimal(5, 2)
  updatedAt           DateTime @updatedAt
}

model Notification {
  id        String   @id @default(cuid())
  userId    String
  message   String
  link      String?
  isRead    Boolean  @default(false)
  createdAt DateTime @default(now())

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId, isRead])
}

model ProposalTemplate {
  id           String   @id @default(cuid())
  name         String
  createdById  String
  isOrgWide    Boolean  @default(false)
  snapshotJson Json
  createdAt    DateTime @default(now())
}
```

**What changed vs. the original PRD:**
- **`Client`** is a new CRM model (`companyName`, `accountCode`, `industry`, `website`, `address`, `notes`) that owns a proposal's contacts and history. `ClientContact` was reworked to hang off `clientId` (not a flat company name) and gained `department`, `phone`, `isPrimary`, `notes`.
- **`ModeOfPayment`** is a new model — a library of company bank accounts, multi-selected per proposal via `Proposal.modesOfPayment` (JSON, no FK — same pattern as `tcSections`).
- **`Proposal`** gained roughly twenty fields since the PRD: `clientId` + snapshot `accountCode`; contact/business fields `department`, `contactEmail`, `contactPhone`, `businessAddress`, `tin`, `brandName`; approval-chain stamps `cooApprovedAt`/`cooApprovedById`, `ceoApprovedAt`/`ceoApprovedById`; FX `exchangeRate`; `paymentMilestones` + `milestoneBasis`; the multi-select `tcSections` and `modesOfPayment` JSON columns; and `signatories` (client-side Conforme signers).
- **`Service`** gained `engagementTerm`, `currency`, `exchangeRate`, `estimatedExpenses` (internal, never client-facing).
- **`PaymentTemplate`** gained `milestones` + `milestoneBasis`.
- **`ProposalLineItem`** gained `expenses` (Json) and `quantity` widened from `Decimal(10,2)` to `Decimal(12,4)`.
- **`User`** gained `signatureImageUrl` for rendering COO/CEO sign-off marks on the PDF.
- Indexes were added across `Proposal`, `ProposalLineItem`, `ProposalVersion`, `ApprovalEvent`, `AuditLog`, `Notification`, and `ClientContact` to support the larger data volume.

---

## Roles and Permissions

Use `lib/permissions.ts` — a `can(user, action)` function — for all permission checks. Apply at both the API route and UI layer (hide/disable, don't just block server-side).

Approval is a **fixed two-stage COO → CEO chain** (see Approval Workflow below), not a single manager approval. `COO` and `CEO` are dedicated roles with approval + oversight access but no catalog/template/user management.

| Action | SALES_EXEC | SALES_MANAGER | COO | CEO | ADMIN | SUPER_ADMIN |
|---|---|---|---|---|---|---|
| `create:proposal` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `edit:own_proposal` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `edit:any_proposal` | — | ✓ | ✓ | ✓ | ✓ | ✓ |
| `approve:proposal` | — | ✓ | ✓ | ✓ | ✓ | ✓ |
| `manage:catalog` | — | ✓ | — | — | ✓ | ✓ |
| `manage:templates` | — | — | — | — | ✓ | ✓ |
| `manage:users` | — | — | — | — | — | ✓ |
| `view:audit_log` | — | — | ✓ | ✓ | ✓ | ✓ |
| `force:status_override` | — | — | — | — | — | ✓ |
| `lock:tc_template` | — | — | — | — | — | ✓ |

**Proposal visibility:**
- `SALES_EXEC` → own proposals only (`createdById = currentUser.id`)
- `SALES_MANAGER` → all proposals in their team (`createdBy.teamId = currentUser.teamId`)
- `COO` / `CEO` / `ADMIN` / `SUPER_ADMIN` → all proposals

---

## Proposal Number Format

Generated server-side on first save. Format: `PROP-[YYYY]-[MM]-[NNNN]`

- Example: `PROP-2026-03-0042`
- NNNN is zero-padded, sequential per month, resets each month
- Revisions use the same root number with a version suffix in display only (the `version` field on Proposal increments)
- The number is immutable once assigned

```ts
// lib/proposals.ts
async function generateProposalNumber(): Promise<string> {
  const now = new Date()
  const yyyy = now.getFullYear()
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  const prefix = `PROP-${yyyy}-${mm}-`
  const latest = await prisma.proposal.findFirst({
    where: { number: { startsWith: prefix } },
    orderBy: { number: 'desc' },
  })
  const next = latest
    ? parseInt(latest.number.split('-')[3]) + 1
    : 1
  return `${prefix}${String(next).padStart(4, '0')}`
}
```

---

## Proposal Status Lifecycle

Valid transitions only — enforce in server actions, not just the UI.

`PENDING_APPROVAL` covers **two internal stages** — COO review, then CEO review — before a proposal reaches `APPROVED`. The status column doesn't change between stages; progress is tracked on the proposal via `cooApprovedAt`/`cooApprovedById` and `ceoApprovedAt`/`ceoApprovedById` (see Approval Workflow below).

| From | Action | To |
|---|---|---|
| DRAFT | Submit for approval | PENDING_APPROVAL (routes to COO) |
| PENDING_APPROVAL (COO stage) | COO approves | PENDING_APPROVAL (routes to CEO) |
| PENDING_APPROVAL (CEO stage) | CEO approves | APPROVED |
| PENDING_APPROVAL (either stage) | Approver requests revision | REVISION_REQUIRED |
| PENDING_APPROVAL (either stage) | Approver rejects | LOST |
| REVISION_REQUIRED | Re-submit | PENDING_APPROVAL (restarts at COO) |
| APPROVED | Mark as sent | SENT |
| SENT | Mark as won | WON |
| SENT or APPROVED | Mark as lost | LOST |
| Any active | Mark as on hold | ON_HOLD |
| APPROVED or SENT | `validUntil` passed (cron) | EXPIRED |

**Status badge colors — use exactly these:**

```ts
const STATUS_COLORS: Record<ProposalStatus, string> = {
  DRAFT:              'bg-slate-100 text-slate-600',
  PENDING_APPROVAL:   'bg-amber-100 text-amber-700',
  REVISION_REQUIRED:  'bg-orange-100 text-orange-700',
  APPROVED:           'bg-indigo-100 text-indigo-700',
  SENT:               'bg-purple-100 text-purple-700',
  WON:                'bg-green-100 text-green-700',
  LOST:               'bg-red-100 text-red-700',
  ON_HOLD:            'bg-slate-200 text-slate-600',
  EXPIRED:            'bg-gray-100 text-gray-500',
}
```

Status badges always include a text label AND color. Never color alone.

---

## Approval Workflow Rules

Approval is a **fixed two-stage COO → CEO chain**. Every non-SUPER_ADMIN submission routes to the COO first; only after the COO approves does it advance to the CEO. A proposal is not `APPROVED` — and PDF generation is not unlocked — until **both** stages have signed off.

- `resolveCOO()` / `resolveCEO()` (in `lib/actions/proposals.ts`) each look up the first active user with role `COO` / `CEO` (oldest `createdAt` wins if more than one exists). If no active COO (or, at the CEO stage, no active CEO) is configured, submission/approval is blocked with an error asking an admin to assign the role in Users.
- Stage progress lives on the `Proposal` record: `cooApprovedAt` / `cooApprovedById` are null while awaiting COO review; once the COO approves, they're stamped and `assignedApproverId` is switched to the CEO — the proposal stays `PENDING_APPROVAL` awaiting `ceoApprovedAt` / `ceoApprovedById`.

**SUPER_ADMIN self-submit shortcut:** when a `SUPER_ADMIN` submits their own proposal, both stages are stamped instantly — `cooApprovedAt/ById` and `ceoApprovedAt/ById` are all set to the submitting SUPER_ADMIN, the proposal goes straight to `APPROVED`, and a single `'approved'` `ApprovalEvent` (comment: `'Auto-approved on submission by Super Admin.'`) is logged alongside the `'submitted'` event. This bypasses the COO → CEO chain entirely — `resolveCOO()`/`resolveCEO()` are never called. `SUPER_ADMIN` is a test/power-user account by design (used for QA and admin convenience, not real sales submissions), so this shortcut is intentional and kept, not a bug.

1. **Submit** → validates all required fields, sets `PENDING_APPROVAL`, locks proposal from editing, creates `ApprovalEvent` (action: `'submitted'`), resolves the COO and sets `assignedApproverId` to them, sends notification + email to the COO — unless the submitter is a SUPER_ADMIN, in which case the self-submit shortcut above applies instead
2. **COO approves** (first stage) → stamps `cooApprovedAt`/`cooApprovedById`, resolves the CEO and re-points `assignedApproverId` to them, creates `ApprovalEvent` (action: `'coo_approved'`), status stays `PENDING_APPROVAL`, notifies the CEO (action needed) and the creator (progress update), emails the CEO
3. **CEO approves** (final stage) → stamps `ceoApprovedAt`/`ceoApprovedById`, sets status to `APPROVED`, creates `ApprovalEvent` (action: `'approved'`), notifies + emails the creator ("approved (COO + CEO)"), unlocks PDF generation
4. **Request Revision** → sets `REVISION_REQUIRED`, requires a comment, **resets both `cooApprovedAt/ById` and `ceoApprovedAt/ById` to null** so a re-submission restarts the chain at the COO stage, creates `ApprovalEvent` with comment, notifies + emails creator, unlocks editing
5. **Reject** → sets `LOST`, `lostReason = 'Rejected internally: ' + reason`, resets both stages' approval fields to null, creates `ApprovalEvent`
6. **SLA escalation** → if `PENDING_APPROVAL` and `updatedAt < now - APPROVAL_SLA_HOURS`, send reminder notification to the current `assignedApprover` (whichever stage is active) (cron: hourly)
7. **Force override** → SUPER_ADMIN only. A SUPER_ADMIN can approve at either stage in one action: it stamps both `cooApprovedAt/ById` (if not already set) and `ceoApprovedAt/ById`, and sets status straight to `APPROVED`. `forceOverrideStatus` (any status → any status) still requires a comment and writes to `AuditLog`.
8. **Below-floor pricing** → if any `lineItem.unitRate < service.minRate`, set `hasBelowFloorPricing = true`; the submission notification flags this to the approver, but routing still follows the standard COO → CEO chain (there is no separate SALES_MANAGER escalation path in the current implementation)

---

## Version Snapshot Rules

Create a `ProposalVersion` record on these events:
- First explicit save (not auto-save)
- Every `Submit for Approval`
- Every save after `REVISION_REQUIRED`
- After PDF generation (update `pdfUrl` on the version)

`snapshotJson` structure:
```ts
{
  proposal: { /* all Proposal fields */ },
  lineItems: [ /* all ProposalLineItem fields */ ]
}
```

`changeSummary` is a plain-English diff from the previous version:
- "Rate for Brand Strategy changed from ₱80,000 to ₱70,000."
- "Added line item: Social Media Management."
- "Payment terms overridden from template."
- If nothing changed: "No changes from previous version."

**Restore rule:** restoring a version creates a NEW draft version pre-filled with that snapshot's data. Never overwrite or delete historical `ProposalVersion` records.

---

## Auto-Save Behavior

- Auto-save fires every 30 seconds while the wizard is open
- Auto-save does NOT create a new `ProposalVersion` — it only updates the `Proposal` record
- Show save state in the header: `"Saving..."` → `"Saved just now"`
- A new `ProposalVersion` snapshot is only created on explicit user action (see Version Snapshot Rules above)
- On navigation away, warn if there are unsaved changes since the last save

---

## PDF Generation

Route: `POST /api/pdf/generate` → body: `{ proposalId: string }`

Flow:
1. Authenticate + check proposal status is `APPROVED`
2. Generate a signed token: `crypto.createHmac('sha256', process.env.PDF_SECRET).update(proposalId).digest('hex')`
3. Launch Puppeteer with `@sparticuz/chromium-min`
4. Navigate to `/pdf/[proposalId]?token=[token]`, wait for `networkidle0`
5. `page.pdf({ format: 'A4', margin: { top: '15mm', right: '15mm', bottom: '15mm', left: '15mm' }, printBackground: true })`
6. Upload buffer to Supabase Storage: `proposals/[proposalId]/v[version].pdf`
7. Get signed URL (24h expiry), update `ProposalVersion.pdfUrl`, return URL

PDF template at `app/pdf/[proposalId]/page.tsx` — server component, no app shell. Sections in order:
1. Cover page (logo, client, proposal number, dates, salesperson)
2. Scope of Work (one section per non-optional line item) — omitted if there are none
3. Investment Summary (itemized table + totals; includes the Optional Add-ons table inline when any `isOptional = true` items exist — not a separate top-level section)
4. Payment Terms (rich text, payment schedule/milestones, and Mode of Payment bank accounts)
5. Terms & Conditions
6. Signatories — client-side "Conforme" signatories (name, position, company; signed off-platform) plus, once the proposal is `APPROVED`, the internal COO + CEO who approved it (name, job title, and stored signature image if the approver has one on file)

There is no Executive Summary section (its retirement is tracked separately — see the PRD's Common Mistakes / prior "remove Executive Summary" work); do not reintroduce it here.

Every page: footer with proposal number, page X of Y, agency name, "Confidential — For Addressee Only".
If `confidentialWatermark = true`: diagonal "CONFIDENTIAL" watermark via CSS `::before` on `body`.

---

## Notification Triggers

Always call `createNotification(userId, message, link)` AND `sendEmail(email, subject, html)` where specified.

| Event | Recipient | In-app | Email |
|---|---|---|---|
| Proposal submitted | Assigned approver | ✓ | ✓ |
| Proposal approved | Creator | ✓ | ✓ |
| Revision requested | Creator | ✓ | ✓ |
| Proposal rejected | Creator | ✓ | — |
| SLA reminder (24h) | Approver | ✓ | ✓ |
| Proposal expired | Creator | ✓ | — |
| Won / Lost | Creator's manager | ✓ | — |

---

## Cron Jobs

Both routes are `GET` handlers protected by checking `Authorization: Bearer ${CRON_SECRET}`.

**`/api/cron/approval-sla`** — runs hourly
- Find proposals: `status = PENDING_APPROVAL` AND `updatedAt < now - APPROVAL_SLA_HOURS`
- Create notification + send email to `assignedApprover`

**`/api/cron/expire-proposals`** — runs daily at 02:00
- Find proposals: `validUntil < today` AND `status IN [APPROVED, SENT]`
- Set `status = EXPIRED`, create `ApprovalEvent` (`action: 'expired'`), notify creator

`vercel.json`:
```json
{
  "crons": [
    { "path": "/api/cron/approval-sla", "schedule": "0 * * * *" },
    { "path": "/api/cron/expire-proposals", "schedule": "0 2 * * *" }
  ]
}
```

---

## Design System

Apply globally via `tailwind.config.ts` and `globals.css`.

```css
:root {
  --color-primary:      #1A1A2E;
  --color-accent:       #4F46E5;
  --color-accent-light: #EEF2FF;
  --color-surface:      #F8FAFC;
  --color-border:       #E2E8F0;
  --color-muted:        #64748B;
  --color-success:      #16A34A;
  --color-warning:      #D97706;
  --color-danger:       #DC2626;
  --radius-sm:          8px;
  --radius-md:          12px;
}
```

Font: **Inter** via Google Fonts (`next/font/google`).

---

## Responsive Layout Rules

| Breakpoint | Layout |
|---|---|
| `< 640px` (mobile) | Single column, bottom tab nav (5 items), wizard steps as full-screen sheets, proposal list as cards |
| `640–1024px` (tablet) | Two-column form, collapsible sidebar |
| `> 1024px` (desktop) | Full sidebar, multi-column, inline preview on wizard Step 7 (Review) |

- Touch targets: minimum `44×44px` (`min-h-[44px] min-w-[44px]`)
- Modals/dialogs: use shadcn Sheet on mobile, Dialog on desktop
- Line item cards: collapsed by default on mobile (show name + total + expand button)

---

## Accessibility Rules (WCAG 2.1 AA)

Always enforce these — do not skip them in early passes:

- All icon-only buttons: `aria-label="Descriptive action"`
- All form inputs: `<label htmlFor="inputId">` — not just placeholder text
- Error messages: appear below the field, not only at top of form
- Status badges: always text label + color, never color alone
- Dialog focus: moves to first interactive element on open, returns to trigger on close
- Keyboard navigation: logical tab order through all interactive elements
- Skeleton loaders instead of spinners for data loading states
- Empty states: always include a primary CTA, never just blank

---

## Validation Rules (Zod)

Define schemas in `lib/validations/` and share between frontend (react-hook-form) and server actions.

```ts
// Proposal submission validation
const proposalSubmitSchema = z.object({
  clientName:    z.string().min(2, 'Client name required'),
  projectTitle:  z.string().min(3, 'Project title required'),
  date:          z.date(),
  validUntil:    z.date(),
  lineItems:     z.array(lineItemSchema).min(1, 'At least one service required'),
  total:         z.number().positive('Total must be greater than 0'),
  paymentTerms:  z.string().min(1, 'Payment terms required'),
  tcText:        z.string().min(1, 'Terms & conditions required'),
}).refine(d => d.validUntil > d.date, {
  message: 'Valid until must be after proposal date',
  path: ['validUntil'],
})

const lineItemSchema = z.object({
  description:  z.string().min(1),
  quantity:     z.number().positive(),
  unitRate:     z.number().min(0),
  lineTotal:    z.number().min(0),
})
```

`unitRate` below `service.minRate`: warn inline (amber banner on the line item card), but do not block saving. Do block submission if `hasBelowFloorPricing = true` and no SALES_MANAGER is assigned as approver.

---

## Key Shared Utilities

Always use these — do not re-implement inline.

**`lib/auth.ts`** — `getSession()` returns `{ user: User } | null`

**`lib/permissions.ts`** — `can(user: User, action: string): boolean`

**`lib/prisma.ts`** — singleton client:
```ts
import { PrismaClient } from '@prisma/client'
const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }
export const prisma = globalForPrisma.prisma ?? new PrismaClient()
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
```

**`lib/email.ts`** — `sendEmail(to: string, subject: string, html: string): Promise<void>` via Resend

**`lib/notifications.ts`** — `createNotification(userId: string, message: string, link?: string): Promise<void>`

**`lib/audit.ts`** — `logAudit(entityType, entityId, action, actorId, diff?): Promise<void>`

---

## Mutations: Server Actions vs API Routes

| Use | When |
|---|---|
| Next.js Server Actions | All form mutations (create/update/delete proposals, catalog, users, templates) |
| API Routes (`/api/`) | PDF generation, bulk download, cron jobs, anything needing streaming or long timeouts |

All server actions should:
1. Call `getSession()` and throw if unauthenticated
2. Call `can(user, action)` and throw `Unauthorized` if denied
3. Validate input with Zod before touching the database
4. Call `revalidatePath()` on success
5. Return `{ success: true, data }` or throw with a descriptive message

---

## Win / Loss Capture

When marking a proposal WON or LOST, show a required modal before executing the status change.

**WON modal:** optional "Signed Date" date picker.

**LOST modal:** required reason select:
- Budget
- Competitor Selected
- Timeline
- No Response
- Scope Mismatch
- Other (reveals free text field)

Save to `proposal.lostReason`. Create `ApprovalEvent` with `action: 'won'` or `'lost'`. Notify creator's manager.

---

## Seed Data (prisma/seed.ts)

Make seed idempotent using `upsert`. Include:

- 1 SUPER_ADMIN: `admin@agency.com` / `Admin1234!`
- 1 SALES_EXEC: `juan@agency.com` / `Sales1234!`
- 1 SALES_MANAGER: `manager@agency.com` / `Manager1234!`
- 1 COO: `coo@agency.com` / `Coo1234!` (first-stage approver in the COO → CEO chain)
- 1 CEO: `ceo@agency.com` / `Ceo1234!` (second-stage / final approver)
- 1 Team: "Sales Team", manager = manager user
- 3 Services across 2 categories (Strategy + Digital)
- 2 PaymentTemplates (one set as default)
- 1 TCTemplate with categories `['Strategy', 'Digital']`
- 1 SystemSettings row: `agencyName = 'The Agency'`
- 1 ClientContact: "Acme Corp"
- 5 Proposals in varying statuses: DRAFT, PENDING_APPROVAL, APPROVED, WON, LOST
- ProposalVersion history on the APPROVED proposal (at least v1 and v2)

Also create these users in **Supabase Auth Dashboard** manually (Auth is separate from Prisma):
`admin@agency.com`, `juan@agency.com`, `manager@agency.com`, `coo@agency.com`, `ceo@agency.com`

---

## Common Mistakes to Avoid

- **Do not** use `WidthType.PERCENTAGE` in any context — use explicit pixel/rem values
- **Do not** create Supabase Auth users via Prisma — they are separate; sync by email
- **Do not** generate a new `ProposalVersion` on every auto-save — only on explicit saves and status transitions
- **Do not** hard-delete any record that has proposal references — archive/soft-delete only
- **Do not** allow editing a proposal while status is `PENDING_APPROVAL` — enforce in server actions
- **Do not** use color as the only status indicator — always pair with a text label
- **Do not** use `<form>` HTML element in any component — use react-hook-form `handleSubmit` with a `<div>` wrapper

---

## Build Sequence Reference

Work through features in this order. Each must be verified working before moving to the next.

1. Project scaffold (Next.js, Tailwind, shadcn/ui, Prisma, Supabase connection)
2. Database schema + migration + seed
3. Authentication (Supabase Auth, middleware, role sync)
4. App shell (sidebar, bottom nav, header, notification bell placeholder)
5. User management (invite, list, edit, deactivate — SUPER_ADMIN only)
6. Service catalog (full CRUD, audit trail — ADMIN+)
7. Payment terms library (CRUD, rich text, default — ADMIN+)
8. T&C library (CRUD, rich text, lock, category association — ADMIN+)
9. Proposal creation wizard (Steps 1–7, auto-save, validation, line items, pricing) — 1 Client & Project, 2 Services, 3 Pricing, 4 Payment Terms, 5 T&C, 6 Signatories, 7 Review
10. Proposal repository (list, filters, sort, duplicate, detail page)
11. Approval workflow (submit, approve, revise, reject, SLA cron, force override)
12. Version history (snapshots, diff summary, timeline UI, restore)
13. PDF generation (template route, Puppeteer API, Supabase Storage, download)
14. Notifications + email (in-app bell, Resend triggers for all events)
15. Dashboard (role-personalized, Recharts, expiry cron)
16. Additional features (proposal templates, client contact book, bulk PDF download, pricing guardrails)
17. Polish (mobile audit, error boundaries, loading skeletons, empty states, a11y pass)
