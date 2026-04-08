import { notFound } from 'next/navigation'
import { createHmac } from 'crypto'
import { prisma } from '@/lib/prisma'

type Props = {
  params: { proposalId: string }
  searchParams: { token?: string }
}

function fmt(value: string | number | null | undefined): string {
  const n = parseFloat(String(value ?? '0'))
  if (isNaN(n)) return '₱0.00'
  return '₱' + n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtDate(iso: string | Date): string {
  return new Date(iso).toLocaleDateString('en-PH', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
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

  const accent = settings?.brandColorHex ?? '#4F46E5'
  const agencyName = settings?.agencyName ?? 'The Agency'
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
  const vatRate = proposal.vatRate
    ? parseFloat(proposal.vatRate.toString())
    : null
  const vatAmount =
    vatRate && subtotal ? (subtotal * vatRate) / 100 : null

  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{proposal.number} — {proposal.projectTitle}</title>
        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');

          *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

          :root {
            --accent: ${accent};
            --accent-light: ${accent}18;
          }

          body {
            font-family: 'Inter', sans-serif;
            font-size: 11pt;
            color: #1e293b;
            background: #ffffff;
            line-height: 1.5;
          }

          /* ── Confidential watermark ─────────────────────────────────── */
          ${
            proposal.confidentialWatermark
              ? `
          body::before {
            content: 'CONFIDENTIAL';
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%) rotate(-45deg);
            font-size: 80pt;
            font-weight: 800;
            color: rgba(0, 0, 0, 0.04);
            letter-spacing: 0.12em;
            white-space: nowrap;
            pointer-events: none;
            z-index: 0;
          }`
              : ''
          }

          /* ── Page ───────────────────────────────────────────────────── */
          .page {
            position: relative;
            z-index: 1;
            min-height: 100vh;
            padding: 15mm;
          }

          .page-break { page-break-after: always; }

          /* ── Footer ─────────────────────────────────────────────────── */
          .footer {
            position: fixed;
            bottom: 0;
            left: 0;
            right: 0;
            padding: 6mm 15mm;
            border-top: 1px solid #e2e8f0;
            display: flex;
            justify-content: space-between;
            align-items: center;
            font-size: 8pt;
            color: #94a3b8;
          }

          .footer-center { text-align: center; }

          /* ── Cover ──────────────────────────────────────────────────── */
          .cover {
            display: flex;
            flex-direction: column;
            min-height: calc(100vh - 30mm);
            padding: 0;
          }

          .cover-top {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            padding-bottom: 24mm;
            border-bottom: 2px solid var(--accent);
            margin-bottom: 20mm;
          }

          .agency-logo { max-height: 48px; max-width: 160px; object-fit: contain; }
          .agency-name-text { font-size: 18pt; font-weight: 700; color: var(--accent); }

          .cover-body { flex: 1; display: flex; flex-direction: column; justify-content: center; gap: 10mm; }

          .cover-label {
            font-size: 8pt;
            font-weight: 600;
            letter-spacing: 0.12em;
            text-transform: uppercase;
            color: #94a3b8;
            margin-bottom: 2mm;
          }

          .cover-client { font-size: 22pt; font-weight: 700; color: #1e293b; }
          .cover-project { font-size: 14pt; font-weight: 500; color: #475569; margin-top: 2mm; }

          .cover-number {
            font-size: 28pt;
            font-weight: 800;
            color: var(--accent);
            letter-spacing: -0.02em;
          }

          .cover-meta-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 6mm;
            margin-top: 10mm;
          }

          .cover-meta-item .label { font-size: 8pt; font-weight: 600; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.08em; }
          .cover-meta-item .value { font-size: 10pt; font-weight: 500; color: #1e293b; margin-top: 1mm; }

          .cover-salesperson {
            margin-top: auto;
            padding-top: 10mm;
            border-top: 1px solid #e2e8f0;
          }

          /* ── Section ────────────────────────────────────────────────── */
          .section { margin-bottom: 12mm; }
          .section-title {
            font-size: 14pt;
            font-weight: 700;
            color: var(--accent);
            border-bottom: 2px solid var(--accent);
            padding-bottom: 3mm;
            margin-bottom: 6mm;
          }

          /* ── Scope items ─────────────────────────────────────────────── */
          .scope-item { margin-bottom: 8mm; }
          .scope-item h3 {
            font-size: 11pt;
            font-weight: 600;
            color: var(--accent);
            margin-bottom: 2mm;
          }
          .scope-item p { color: #475569; margin-bottom: 2mm; font-size: 10pt; }
          .scope-html { font-size: 10pt; color: #1e293b; }
          .scope-html ul, .scope-html ol { padding-left: 5mm; }

          /* ── Tables ──────────────────────────────────────────────────── */
          table {
            width: 100%;
            border-collapse: collapse;
            font-size: 10pt;
          }

          thead tr {
            background: var(--accent);
            color: #ffffff;
          }

          thead th {
            padding: 3mm 4mm;
            text-align: left;
            font-weight: 600;
            font-size: 9pt;
            letter-spacing: 0.04em;
          }

          thead th:not(:first-child) { text-align: right; }

          tbody tr:nth-child(even) { background: #f8fafc; }
          tbody tr { border-bottom: 1px solid #e2e8f0; }

          td {
            padding: 3mm 4mm;
            vertical-align: top;
            color: #334155;
          }

          td:not(:first-child) { text-align: right; }

          .totals-table { margin-top: 4mm; margin-left: auto; width: 240px; }
          .totals-table td { padding: 1.5mm 3mm; border: none; }
          .totals-table td:last-child { text-align: right; font-weight: 500; }
          .totals-row-grand td {
            font-size: 12pt;
            font-weight: 700;
            color: var(--accent);
            border-top: 2px solid var(--accent);
            padding-top: 2mm;
          }

          /* ── Rich text ───────────────────────────────────────────────── */
          .rich-text { font-size: 10pt; color: #334155; }
          .rich-text p { margin-bottom: 2mm; }
          .rich-text ul, .rich-text ol { padding-left: 5mm; margin-bottom: 2mm; }
          .rich-text strong { font-weight: 600; color: #1e293b; }

          /* ── Print ────────────────────────────────────────────────────── */
          @media print {
            table { page-break-inside: avoid; }
            .scope-item { page-break-inside: avoid; }
            .section { page-break-inside: avoid; }
          }
        `}</style>
      </head>

      <body>
        {/* ── Footer (fixed, shows on every page) ──────────────────────────── */}
        <div className="footer">
          <span>{proposal.number}</span>
          <span className="footer-center">
            {agencyName} · Confidential — For Addressee Only
          </span>
          <span>Page <span className="page-num" /></span>
        </div>

        {/* ── 1. COVER PAGE ─────────────────────────────────────────────────── */}
        <div className="page">
          <div className="cover">
            <div className="cover-top">
              {agencyLogoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={agencyLogoUrl} alt={agencyName} className="agency-logo" />
              ) : (
                <span className="agency-name-text">{agencyName}</span>
              )}
              <div style={{ textAlign: 'right' }}>
                <div className="cover-label">Proposal</div>
                <div className="cover-number">{proposal.number}</div>
              </div>
            </div>

            <div className="cover-body">
              <div>
                <div className="cover-label">Prepared for</div>
                <div className="cover-client">{proposal.clientName}</div>
                {proposal.contactName && (
                  <div className="cover-project" style={{ fontSize: '12pt', marginTop: '1mm' }}>
                    {proposal.contactName}{proposal.contactTitle ? `, ${proposal.contactTitle}` : ''}
                  </div>
                )}
              </div>

              <div>
                <div className="cover-label">Project</div>
                <div className="cover-project">{proposal.projectTitle}</div>
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
                  <div className="value">{proposal.currency}</div>
                </div>
                <div className="cover-meta-item">
                  <div className="label">Total Investment</div>
                  <div className="value" style={{ fontWeight: 700, color: accent }}>{fmt(proposal.total.toString())}</div>
                </div>
              </div>
            </div>

            <div className="cover-salesperson">
              <div className="cover-label">Prepared by</div>
              <div style={{ fontWeight: 600, fontSize: '11pt', marginTop: '1mm' }}>
                {proposal.createdBy.name}
              </div>
              {proposal.createdBy.jobTitle && (
                <div style={{ color: '#64748b', fontSize: '10pt' }}>
                  {proposal.createdBy.jobTitle}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── 2. EXECUTIVE SUMMARY ──────────────────────────────────────────── */}
        {proposal.introText && (
          <>
            <div className="page-break" />
            <div className="page">
              <div className="section">
                <div className="section-title">Executive Summary</div>
                <div
                  className="rich-text"
                  dangerouslySetInnerHTML={{ __html: proposal.introText }}
                />
              </div>
            </div>
          </>
        )}

        {/* ── 3. SCOPE OF WORK ──────────────────────────────────────────────── */}
        {nonOptionalItems.length > 0 && (
          <>
            <div className="page-break" />
            <div className="page">
              <div className="section">
                <div className="section-title">Scope of Work</div>
                {nonOptionalItems.map((li) => (
                  <div key={li.id} className="scope-item">
                    <h3>{li.description}</h3>
                    {li.scopeOfWork && (
                      <div
                        className="scope-html"
                        dangerouslySetInnerHTML={{ __html: li.scopeOfWork }}
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {/* ── 4. INVESTMENT SUMMARY ─────────────────────────────────────────── */}
        <div className="page-break" />
        <div className="page">
          <div className="section">
            <div className="section-title">Investment Summary</div>
            <table>
              <thead>
                <tr>
                  <th style={{ width: '40%' }}>Service</th>
                  <th>Unit</th>
                  <th>Qty</th>
                  <th>Unit Rate</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {nonOptionalItems.map((li) => (
                  <tr key={li.id}>
                    <td><strong>{li.description}</strong></td>
                    <td style={{ textAlign: 'right' }}>{li.unit}</td>
                    <td style={{ textAlign: 'right' }}>{li.quantity.toString()}</td>
                    <td style={{ textAlign: 'right' }}>{fmt(li.unitRate.toString())}</td>
                    <td style={{ textAlign: 'right' }}>{fmt(li.lineTotal.toString())}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Totals */}
            <table className="totals-table">
              <tbody>
                <tr>
                  <td style={{ color: '#64748b' }}>Subtotal</td>
                  <td>{fmt(subtotal.toString())}</td>
                </tr>
                {discountValue !== null && discountValue > 0 && (
                  <tr>
                    <td style={{ color: '#64748b' }}>
                      Discount{proposal.discountType === 'PERCENTAGE' ? ` (${proposal.discountValue}%)` : ''}
                    </td>
                    <td style={{ color: '#dc2626' }}>−{fmt(discountValue.toString())}</td>
                  </tr>
                )}
                {vatRate !== null && vatAmount !== null && (
                  <tr>
                    <td style={{ color: '#64748b' }}>VAT ({vatRate}%)</td>
                    <td>{fmt(vatAmount.toString())}</td>
                  </tr>
                )}
                <tr className="totals-row-grand">
                  <td>Grand Total</td>
                  <td>{fmt(total.toString())}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* ── 5. OPTIONAL ADD-ONS ──────────────────────────────────────────── */}
          {optionalItems.length > 0 && (
            <div className="section" style={{ marginTop: '10mm' }}>
              <div className="section-title">Optional Add-ons</div>
              <table>
                <thead>
                  <tr>
                    <th style={{ width: '40%' }}>Service</th>
                    <th>Unit</th>
                    <th>Qty</th>
                    <th>Unit Rate</th>
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {optionalItems.map((li) => (
                    <tr key={li.id}>
                      <td><strong>{li.description}</strong></td>
                      <td style={{ textAlign: 'right' }}>{li.unit}</td>
                      <td style={{ textAlign: 'right' }}>{li.quantity.toString()}</td>
                      <td style={{ textAlign: 'right' }}>{fmt(li.unitRate.toString())}</td>
                      <td style={{ textAlign: 'right' }}>{fmt(li.lineTotal.toString())}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ── 6. PAYMENT TERMS ──────────────────────────────────────────────── */}
        {paymentHtml && (
          <>
            <div className="page-break" />
            <div className="page">
              <div className="section">
                <div className="section-title">Payment Terms</div>
                <div
                  className="rich-text"
                  dangerouslySetInnerHTML={{ __html: paymentHtml }}
                />
              </div>
            </div>
          </>
        )}

        {/* ── 7. TERMS & CONDITIONS ─────────────────────────────────────────── */}
        {tcHtml && (
          <>
            <div className="page-break" />
            <div className="page">
              <div className="section">
                <div className="section-title">Terms &amp; Conditions</div>
                <div
                  className="rich-text"
                  dangerouslySetInnerHTML={{ __html: tcHtml }}
                />
              </div>
            </div>
          </>
        )}
      </body>
    </html>
  )
}
