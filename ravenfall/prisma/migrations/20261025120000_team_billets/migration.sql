-- The infantry billets became team billets. Role names are stored as keys,
-- so carry existing data across. Rifleman and Automatic Rifleman both
-- become Assaulter; Command and Pilot are unchanged. Old name -> new name:
CREATE TEMP TABLE "_billet_map" ("old" TEXT PRIMARY KEY, "new" TEXT NOT NULL, "pref" INT NOT NULL);
INSERT INTO "_billet_map" VALUES
  ('Squad Leader', 'Team Leader', 0),
  ('Team Leader', 'Assistant Team Leader', 0),
  ('Rifleman', 'Assaulter', 0),
  ('Automatic Rifleman', 'Assaulter', 1),
  ('Grenadier', 'Breacher', 0),
  ('Marksman', 'Overwatch / Sniper', 0),
  ('Combat Medic', 'Medic', 0),
  ('Radio Operator', 'Communications / Intelligence Specialist', 0);

CREATE FUNCTION pg_temp.billet(name TEXT) RETURNS TEXT AS $$
  SELECT COALESCE((SELECT "new" FROM "_billet_map" WHERE "old" = name), name)
$$ LANGUAGE SQL STABLE;

-- Primary first, then secondaries, dropping duplicates and the primary.
UPDATE "User" SET "unitRole" = pg_temp.billet("unitRole") WHERE "unitRole" IS NOT NULL;
UPDATE "User" u
SET "secondaryRoles" = COALESCE((
      SELECT array_agg(r ORDER BY first_at)
      FROM (
        SELECT pg_temp.billet(s) AS r, MIN(i) AS first_at
        FROM unnest(u."secondaryRoles") WITH ORDINALITY AS t(s, i)
        GROUP BY 1
      ) x
      WHERE r IS DISTINCT FROM u."unitRole"
    ), ARRAY[]::TEXT[])
WHERE cardinality(u."secondaryRoles") > 0;

-- Role requests keep { squad, primary, secondary[] }.
UPDATE "PersonnelRequest" p
SET "payload" = jsonb_set(
      jsonb_set(p."payload", '{primary}', to_jsonb(pg_temp.billet(p."payload"->>'primary'))),
      '{secondary}',
      COALESCE((
        SELECT jsonb_agg(r ORDER BY first_at)
        FROM (
          SELECT pg_temp.billet(s) AS r, MIN(i) AS first_at
          FROM jsonb_array_elements_text(p."payload"->'secondary') WITH ORDINALITY AS t(s, i)
          GROUP BY 1
        ) x
        WHERE r IS DISTINCT FROM pg_temp.billet(p."payload"->>'primary')
      ), '[]'::jsonb)
    )
WHERE p."type" = 'ROLE'
  AND jsonb_typeof(p."payload"->'primary') = 'string'
  AND jsonb_typeof(p."payload"->'secondary') = 'array';

-- The Admin page's role mapping keys billet roles by name. Where two old
-- billets merge, the lower "pref" wins (Rifleman over Automatic Rifleman).
UPDATE "Setting" s
SET "value" = jsonb_set(
      s."value",
      '{billets}',
      COALESCE((
        SELECT jsonb_object_agg(k, v)
        FROM (
          SELECT DISTINCT ON (pg_temp.billet(e.key)) pg_temp.billet(e.key) AS k, e.value AS v
          FROM jsonb_each(s."value"->'billets') e
          LEFT JOIN "_billet_map" m ON m."old" = e.key
          ORDER BY pg_temp.billet(e.key), COALESCE(m."pref", -1)
        ) x
      ), '{}'::jsonb)
    ),
    "updatedAt" = CURRENT_TIMESTAMP
WHERE s."key" = 'roles' AND jsonb_typeof(s."value"->'billets') = 'object';

DROP TABLE "_billet_map";
