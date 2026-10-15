-- Approved applicants also get role 1558706949581832212 (requested by
-- Command). It lives in the Admin page's role mapping as "Also given on
-- approval", so it can be changed there. Only fills a mapping that has
-- already been saved and doesn't have the setting yet.
UPDATE "Setting"
SET "value" = jsonb_set("value", '{approval}', '["1558706949581832212"]'::jsonb),
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "key" = 'roles' AND NOT ("value" ? 'approval');
