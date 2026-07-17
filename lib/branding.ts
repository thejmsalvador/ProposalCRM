// Single source of truth for the agency-name fallback used when
// SystemSettings.agencyName is unset. Prefer settings?.agencyName ?? DEFAULT_AGENCY_NAME
// everywhere (wizard, PDF template, PDF footer) so the name is consistent.
export const DEFAULT_AGENCY_NAME = 'Sunday Studio'

// The registered legal entity behind the "Sunday Studio" trade name — distinct
// from DEFAULT_AGENCY_NAME/SystemSettings.agencyName, which is the brand shown
// in-app and on the PDF cover. Used only in the PDF running footer's legal line.
export const LEGAL_ENTITY_NAME = 'Sunday Elephant Creatives Inc.'

// Registered mailing address / contact block shown in the top-right of the PDF
// cover page. Static company info (not stored per-proposal).
export const COMPANY_ADDRESS_LINES = [
  'Sunday Elephant Creatives, Inc',
  'Suite 31 Parc House Building',
  '227 EDSA Greenhills Mandaluyong',
  'www.sunday.ph',
]
