-- Captain and Major became Deputy Commander (DCDR) and Commander (CDR).
-- Rank abbreviations are stored as keys, so carry existing data across.

UPDATE "User" SET "rank" = 'DCDR' WHERE "rank" = 'CPT';
UPDATE "User" SET "rank" = 'CDR' WHERE "rank" = 'MAJ';

-- The Admin page's role mapping keys rank roles by abbreviation.
UPDATE "Setting"
SET "value" = jsonb_set(
      "value",
      '{ranks}',
      (("value"->'ranks') - 'CPT' - 'MAJ')
        || jsonb_strip_nulls(jsonb_build_object('DCDR', "value"->'ranks'->'CPT', 'CDR', "value"->'ranks'->'MAJ'))
    ),
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "key" = 'roles' AND jsonb_typeof("value"->'ranks') = 'object';
