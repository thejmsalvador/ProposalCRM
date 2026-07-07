// Single source of truth for the agency-name fallback used when
// SystemSettings.agencyName is unset. Prefer settings?.agencyName ?? DEFAULT_AGENCY_NAME
// everywhere (wizard, PDF template, PDF footer) so the name is consistent.
export const DEFAULT_AGENCY_NAME = 'Sunday Studio'
