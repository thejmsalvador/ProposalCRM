-- Rebrand: the default agency accent moves from the legacy indigo (#4F46E5)
-- to the Sunday Studio brand blue (#214ADE). Affects only newly-created
-- SystemSettings rows; existing rows keep their admin-set value.
ALTER TABLE "SystemSettings" ALTER COLUMN "brandColorHex" SET DEFAULT '#214ADE';
