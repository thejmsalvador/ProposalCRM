import { notFound } from 'next/navigation'
import { createHmac } from 'crypto'
import type { Metadata } from 'next'
import { prisma } from '@/lib/prisma'
import { engagementLabel } from '@/lib/validations/catalog'
import { formatCurrency } from '@/lib/validations/proposals'

type Props = {
  params: { proposalId: string }
  searchParams: { token?: string }
}

function fmtDate(iso: string | Date): string {
  return new Date(iso).toLocaleDateString('en-PH', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const proposal = await prisma.proposal.findUnique({
    where: { id: params.proposalId },
    select: { number: true, projectTitle: true },
  })
  if (!proposal) return { title: 'Proposal' }
  return { title: `${proposal.number} — ${proposal.projectTitle}` }
}

export default async function PdfPage({ params, searchParams }: Props) {
  // ── Token verification ───────────────────────────────────────────────────────
  const secret = process.env.PDF_SECRET
  if (!secret) notFound()

  const expected = createHmac('sha256', secret)
    .update(params.proposalId)
    .digest('hex')

  if (searchParams.token !== expected) notFound()

  // ── Fetch data ───────────────────────────────────────────────────────────────
  const [proposal, settings] = await Promise.all([
    prisma.proposal.findUnique({
      where: { id: params.proposalId },
      include: {
        createdBy: { select: { name: true, jobTitle: true } },
        lineItems: { orderBy: { sortOrder: 'asc' } },
        paymentTemplate: { select: { bodyRichText: true } },
        tcTemplate: { select: { bodyRichText: true } },
      },
    }),
    prisma.systemSettings.findFirst(),
  ])

  if (!proposal) notFound()

  const accent = settings?.brandColorHex ?? '#214ADE'
  const agencyName = settings?.agencyName ?? 'Sunday Studio'
  const agencyLogoUrl = settings?.agencyLogoUrl ?? null

  const nonOptionalItems = proposal.lineItems.filter((li) => !li.isOptional)
  const optionalItems = proposal.lineItems.filter((li) => li.isOptional)

  const paymentHtml =
    proposal.paymentTermsOverride ||
    proposal.paymentTemplate?.bodyRichText ||
    ''
  const tcHtml = proposal.tcOverride || proposal.tcTemplate?.bodyRichText || ''

  const subtotal = parseFloat(proposal.subtotal.toString())
  const total = parseFloat(proposal.total.toString())
  const discountValue = proposal.discountValue
    ? parseFloat(proposal.discountValue.toString())
    : null
  const discountAmt =
    discountValue !== null && discountValue > 0
      ? proposal.discountType === 'percentage'
        ? (subtotal * discountValue) / 100
        : discountValue
      : 0
  const vatRate = proposal.vatRate
    ? parseFloat(proposal.vatRate.toString())
    : null
  const vatAmount = vatRate ? ((subtotal - discountAmt) * vatRate) / 100 : null

  // All amounts are stored in ₱; the client-facing document renders them in the
  // proposal currency, converted at the manual rate (₱ per 1 unit). Falls back
  // to ₱ if a non-PHP proposal somehow has no rate.
  const fxRate =
    proposal.currency !== 'PHP' && proposal.exchangeRate
      ? parseFloat(proposal.exchangeRate.toString())
      : null
  const displayCurrency = fxRate && fxRate > 0 ? proposal.currency : 'PHP'
  const money = (value: string | number | null | undefined): string => {
    const n = parseFloat(String(value ?? '0'))
    const safe = isNaN(n) ? 0 : n
    return formatCurrency(fxRate && fxRate > 0 ? safe / fxRate : safe, displayCurrency)
  }

  const css = `
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    #pdf-root {
      font-family: var(--font-sans, 'Inter', sans-serif);
      font-size: 11pt;
      color: #1e293b;
      background: #ffffff;
      line-height: 1.5;
      position: relative;
    }

    ${proposal.confidentialWatermark ? `
    #pdf-root::before {
      content: 'CONFIDENTIAL';
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%) rotate(-45deg);
      font-size: 80pt;
      font-weight: 800;
      color: rgba(0,0,0,0.04);
      letter-spacing: 0.12em;
      white-space: nowrap;
      pointer-events: none;
      z-index: 0;
    }` : ''}

    .pdf-page {
      position: relative;
      z-index: 1;
      padding: 15mm;
      min-height: 100vh;
    }

    .page-break { page-break-after: always; }

    /* Footer */
    .pdf-footer {
      position: fixed;
      bottom: 0; left: 0; right: 0;
      padding: 6mm 15mm;
      border-top: 1px solid #e2e8f0;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 8pt;
      color: #94a3b8;
      background: #fff;
    }

    /* Cover */
    .cover { display: flex; flex-direction: column; min-height: calc(100vh - 30mm); }
    .cover-top {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      padding-bottom: 24mm;
      border-bottom: 2px solid ${accent};
      margin-bottom: 20mm;
    }
    .agency-logo { max-height: 48px; max-width: 160px; object-fit: contain; }
    .agency-name-text { font-size: 18pt; font-weight: 700; color: ${accent}; }
    .cover-body { flex: 1; display: flex; flex-direction: column; justify-content: center; gap: 10mm; }
    .cover-label { font-size: 8pt; font-weight: 600; letter-spacing: 0.12em; text-transform: uppercase; color: #94a3b8; margin-bottom: 2mm; }
    .cover-client { font-size: 22pt; font-weight: 700; color: #1e293b; }
    .cover-project { font-size: 14pt; font-weight: 500; color: #475569; margin-top: 2mm; }
    .cover-contact { font-size: 12pt; font-weight: 500; color: #475569; margin-top: 1mm; }
    .cover-number { font-size: 28pt; font-weight: 800; color: ${accent}; letter-spacing: -0.02em; text-align: right; }
    .cover-meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6mm; margin-top: 10mm; }
    .cover-meta-item .label { font-size: 8pt; font-weight: 600; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.08em; }
    .cover-meta-item .value { font-size: 10pt; font-weight: 500; color: #1e293b; margin-top: 1mm; }
    .cover-total-value { font-size: 10pt; font-weight: 700; color: ${accent}; margin-top: 1mm; }
    .cover-salesperson { margin-top: auto; padding-top: 10mm; border-top: 1px solid #e2e8f0; }
    .salesperson-name { font-weight: 600; font-size: 11pt; margin-top: 1mm; }
    .salesperson-title { color: #64748b; font-size: 10pt; }

    /* Section */
    .section { margin-bottom: 12mm; }
    .section-title {
      font-size: 14pt; font-weight: 700; color: ${accent};
      border-bottom: 2px solid ${accent};
      padding-bottom: 3mm; margin-bottom: 6mm;
    }

    /* Scope */
    .scope-item { margin-bottom: 8mm; page-break-inside: avoid; }
    .scope-item h3 { font-size: 11pt; font-weight: 600; color: ${accent}; margin-bottom: 2mm; }
    .scope-html { font-size: 10pt; color: #1e293b; }
    .scope-html ul, .scope-html ol { padding-left: 5mm; }

    /* Tables */
    table { width: 100%; border-collapse: collapse; font-size: 10pt; }
    thead tr { background: ${accent}; color: #ffffff; }
    thead th { padding: 3mm 4mm; text-align: left; font-weight: 600; font-size: 9pt; letter-spacing: 0.04em; }
    thead th.right { text-align: right; }
    tbody tr:nth-child(even) { background: #f8fafc; }
    tbody tr { border-bottom: 1px solid #e2e8f0; }
    td { padding: 3mm 4mm; vertical-align: top; color: #334155; }
    td.right { text-align: right; }

    .totals-block { margin-top: 4mm; margin-left: auto; width: 240px; }
    .totals-block table { font-size: 10pt; }
    .totals-block td { padding: 1.5mm 3mm; border: none; }
    .totals-block td.right { text-align: right; font-weight: 500; }
    .totals-grand td { font-size: 12pt; font-weight: 700; color: ${accent}; border-top: 2px solid ${accent}; padding-top: 2mm; }

    /* Rich text */
    .rich-text { font-size: 10pt; color: #334155; }
    .rich-text p { margin-bottom: 2mm; }
    .rich-text ul, .rich-text ol { padding-left: 5mm; margin-bottom: 2mm; }
    .rich-text strong { font-weight: 600; color: #1e293b; }

    @media print {
      table { page-break-inside: avoid; }
      .scope-item { page-break-inside: avoid; }
    }
  `

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: css }} />

      <div id="pdf-root">
        {/* Footer — fixed, appears on every page */}
        <div className="pdf-footer">
          <span>{proposal.number}</span>
          <span>{agencyName} · Confidential — For Addressee Only</span>
          <span>&nbsp;</span>
        </div>

        {/* 1. COVER PAGE */}
        <div className="pdf-page">
          <div className="cover">
            <div className="cover-top">
              {agencyLogoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={agencyLogoUrl} alt={agencyName} className="agency-logo" />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src="/sunday-studio-logo.svg" alt="Sunday Studio" className="agency-logo" />
              )}
              <div>
                <div className="cover-label">Proposal</div>
                <div className="cover-number">{proposal.number}</div>
              </div>
            </div>

            <div className="cover-body">
              <div>
                <div className="cover-label">Prepared for</div>
                <div className="cover-client">{proposal.clientName}</div>
                {proposal.department && (
                  <div className="cover-contact">{proposal.department}</div>
                )}
                {proposal.contactName && (
                  <div className="cover-contact">
                    {proposal.contactName}
                    {proposal.contactTitle ? `, ${proposal.contactTitle}` : ''}
                  </div>
                )}
                {(proposal.contactEmail || proposal.contactPhone) && (
                  <div className="cover-contact">
                    {[proposal.contactEmail, proposal.contactPhone]
                      .filter(Boolean)
                      .join(' · ')}
                  </div>
                )}
              </div>

              <div>
                <div className="cover-label">Project</div>
                <div className="cover-project">{proposal.projectTitle}</div>
                {proposal.brandName && (
                  <div className="cover-contact">Brand: {proposal.brandName}</div>
                )}
              </div>

              <div className="cover-meta-grid">
                <div className="cover-meta-item">
                  <div className="label">Date</div>
                  <div className="value">{fmtDate(proposal.date)}</div>
                </div>
                <div className="cover-meta-item">
                  <div className="label">Valid Until</div>
                  <div className="value">{fmtDate(proposal.validUntil)}</div>
                </div>
                <div className="cover-meta-item">
                  <div className="label">Currency</div>
                  <div className="value">{displayCurrency}</div>
                </div>
                <div className="cover-meta-item">
                  <div className="label">Total Investment</div>
                  <div className="cover-total-value">{money(total)}</div>
                </div>
              </div>
            </div>

            <div className="cover-salesperson">
              <div className="cover-label">Prepared by</div>
              <div className="salesperson-name">{proposal.createdBy.name}</div>
              {proposal.createdBy.jobTitle && (
                <div className="salesperson-title">{proposal.createdBy.jobTitle}</div>
              )}
            </div>
          </div>
        </div>

        {/* 2. EXECUTIVE SUMMARY */}
        {proposal.introText && (
          <>
            <div className="page-break" />
            <div className="pdf-page">
              <div className="section">
                <div className="section-title">Executive Summary</div>
                <div className="rich-text" dangerouslySetInnerHTML={{ __html: proposal.introText }} />
              </div>
            </div>
          </>
        )}

        {/* 3. SCOPE OF WORK */}
        {nonOptionalItems.length > 0 && (
          <>
            <div className="page-break" />
            <div className="pdf-page">
              <div className="section">
                <div className="section-title">Scope of Work</div>
                {nonOptionalItems.map((li) => (
                  <div key={li.id} className="scope-item">
                    <h3>{li.description}</h3>
                    {li.scopeOfWork && (
                      <div className="scope-html" dangerouslySetInnerHTML={{ __html: li.scopeOfWork }} />
                    )}
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {/* 4. INVESTMENT SUMMARY */}
        <div className="page-break" />
        <div className="pdf-page">
          <div className="section">
            <div className="section-title">Investment Summary</div>
            <table>
              <thead>
                <tr>
                  <th style={{ width: '40%' }}>Service</th>
                  <th className="right">Engagement</th>
                  <th className="right">Term</th>
                  <th className="right">Item Cost</th>
                  <th className="right">Item Total</th>
                </tr>
              </thead>
              <tbody>
                {nonOptionalItems.map((li) => (
                  <tr key={li.id}>
                    <td><strong>{li.description}</strong></td>
                    <td className="right">{engagementLabel(li.unit)}</td>
                    <td className="right">{li.quantity.toString()}</td>
                    <td className="right">{money(li.unitRate.toString())}</td>
                    <td className="right">{money(li.lineTotal.toString())}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="totals-block">
              <table>
                <tbody>
                  <tr>
                    <td style={{ color: '#64748b' }}>Subtotal</td>
                    <td className="right">{money(subtotal)}</td>
                  </tr>
                  {discountAmt > 0 && (
                    <tr>
                      <td style={{ color: '#64748b' }}>
                        Discount{proposal.discountType === 'percentage' ? ` (${proposal.discountValue}%)` : ''}
                      </td>
                      <td className="right" style={{ color: '#dc2626' }}>−{money(discountAmt)}</td>
                    </tr>
                  )}
                  {vatRate !== null && vatAmount !== null && (
                    <tr>
                      <td style={{ color: '#64748b' }}>VAT ({vatRate}%)</td>
                      <td className="right">{money(vatAmount)}</td>
                    </tr>
                  )}
                  <tr className="totals-grand">
                    <td>Grand Total ({displayCurrency})</td>
                    <td className="right">{money(total)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* 5. OPTIONAL ADD-ONS */}
          {optionalItems.length > 0 && (
            <div className="section" style={{ marginTop: '10mm' }}>
              <div className="section-title">Optional Add-ons</div>
              <table>
                <thead>
                  <tr>
                    <th style={{ width: '40%' }}>Service</th>
                    <th className="right">Engagement</th>
                    <th className="right">Term</th>
                    <th className="right">Item Cost</th>
                    <th className="right">Item Total</th>
                  </tr>
                </thead>
                <tbody>
                  {optionalItems.map((li) => (
                    <tr key={li.id}>
                      <td><strong>{li.description}</strong></td>
                      <td className="right">{engagementLabel(li.unit)}</td>
                      <td className="right">{li.quantity.toString()}</td>
                      <td className="right">{money(li.unitRate.toString())}</td>
                      <td className="right">{money(li.lineTotal.toString())}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* 6. PAYMENT TERMS */}
        {paymentHtml && (
          <>
            <div className="page-break" />
            <div className="pdf-page">
              <div className="section">
                <div className="section-title">Payment Terms</div>
                <div className="rich-text" dangerouslySetInnerHTML={{ __html: paymentHtml }} />
              </div>
            </div>
          </>
        )}

        {/* 7. TERMS & CONDITIONS */}
        {tcHtml && (
          <>
            <div className="page-break" />
            <div className="pdf-page">
              <div className="section">
                <div className="section-title">Terms &amp; Conditions</div>
                <div className="rich-text" dangerouslySetInnerHTML={{ __html: tcHtml }} />
              </div>
            </div>
          </>
        )}
      </div>
    </>
  )
}
