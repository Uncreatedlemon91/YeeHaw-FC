-- The squads became Alpha / Bravo / Charlie (assault: Team Leader, 3 Assaulters,
-- Medic, Assistant Medic), Delta (logistics: Team Leader, 3 Technicians) and
-- Echo (recon: Team Leader, 3 Operators); Command is unchanged. Squad and role
-- names are stored as keys, so carry existing data across.
--
-- Roles, old -> new: Assistant Team Leader, Point Man and Breacher become
-- Assaulter; Overwatch / Sniper becomes Operator; Pilot becomes Technician.
-- Squads: Reaper (aviation) becomes Delta; Charlie's snipers move to Echo
-- with the recon job; Medical is gone, so its members are left unassigned
-- (still Medics) for Command to place. Anyone whose role their squad no
-- longer lists shows in the ORBAT's unassigned pool.
CREATE TEMP TABLE "_role_map" ("old" TEXT PRIMARY KEY, "new" TEXT NOT NULL, "pref" INT NOT NULL);
INSERT INTO "_role_map" VALUES
  ('Assistant Team Leader', 'Assaulter', 1),
  ('Point Man', 'Assaulter', 2),
  ('Breacher', 'Assaulter', 3),
  ('Overwatch / Sniper', 'Operator', 0),
  ('Pilot', 'Technician', 0);

CREATE FUNCTION pg_temp.restructure_role(name TEXT) RETURNS TEXT AS $$
  SELECT COALESCE((SELECT "new" FROM "_role_map" WHERE "old" = name), name)
$$ LANGUAGE SQL STABLE;

-- Named apart from team_billets' pg_temp.billet, which lives on in the same
-- session when migrations run back to back.
-- Squad by the member's (old) squad and (old) role. NULL squad stays NULL.
CREATE FUNCTION pg_temp.restructure_squad(squad TEXT, role TEXT) RETURNS TEXT AS $$
  SELECT CASE
    WHEN squad = 'Reaper' THEN 'Delta'
    WHEN squad = 'Medical' THEN NULL
    WHEN squad = 'Charlie' AND role = 'Overwatch / Sniper' THEN 'Echo'
    ELSE squad
  END
$$ LANGUAGE SQL IMMUTABLE;

-- Squad first (it reads the old role), then primary, then secondaries,
-- dropping duplicates and the primary.
UPDATE "User" SET "squad" = pg_temp.restructure_squad("squad", "unitRole") WHERE "squad" IS NOT NULL;
UPDATE "User" SET "unitRole" = pg_temp.restructure_role("unitRole") WHERE "unitRole" IS NOT NULL;
UPDATE "User" u
SET "secondaryRoles" = COALESCE((
      SELECT array_agg(r ORDER BY first_at)
      FROM (
        SELECT pg_temp.restructure_role(s) AS r, MIN(i) AS first_at
        FROM unnest(u."secondaryRoles") WITH ORDINALITY AS t(s, i)
        GROUP BY 1
      ) x
      WHERE r IS DISTINCT FROM u."unitRole"
    ), ARRAY[]::TEXT[])
WHERE cardinality(u."secondaryRoles") > 0;

-- Role requests keep { squad, primary, secondary[] }. A request that no
-- longer fits its squad is refused when decided (the billet cap check).
UPDATE "PersonnelRequest" p
SET "payload" = jsonb_set(
      jsonb_set(
        jsonb_set(p."payload", '{squad}', COALESCE(to_jsonb(pg_temp.restructure_squad(p."payload"->>'squad', p."payload"->>'primary')), 'null'::jsonb)),
        '{primary}', to_jsonb(pg_temp.restructure_role(p."payload"->>'primary'))),
      '{secondary}',
      COALESCE((
        SELECT jsonb_agg(r ORDER BY first_at)
        FROM (
          SELECT pg_temp.restructure_role(s) AS r, MIN(i) AS first_at
          FROM jsonb_array_elements_text(p."payload"->'secondary') WITH ORDINALITY AS t(s, i)
          GROUP BY 1
        ) x
        WHERE r IS DISTINCT FROM pg_temp.restructure_role(p."payload"->>'primary')
      ), '[]'::jsonb)
    )
WHERE p."type" = 'ROLE'
  AND jsonb_typeof(p."payload"->'squad') = 'string'
  AND jsonb_typeof(p."payload"->'primary') = 'string'
  AND jsonb_typeof(p."payload"->'secondary') = 'array';

-- Interest in a vacant billet { squad, role, needs[] }: the slot it named may
-- be gone, so close pending ones that no longer point at a listed billet.
UPDATE "PersonnelRequest" p
SET "payload" = jsonb_set(
      jsonb_set(p."payload", '{squad}', COALESCE(to_jsonb(pg_temp.restructure_squad(p."payload"->>'squad', p."payload"->>'role')), 'null'::jsonb)),
      '{role}', to_jsonb(pg_temp.restructure_role(p."payload"->>'role')))
WHERE p."type" = 'INTEREST'
  AND jsonb_typeof(p."payload"->'squad') = 'string'
  AND jsonb_typeof(p."payload"->'role') = 'string';
UPDATE "PersonnelRequest" p
SET "status" = 'CANCELLED', "decidedAt" = CURRENT_TIMESTAMP,
    "reviewNote" = 'Closed by the squad restructure: this billet no longer exists.'
WHERE p."type" = 'INTEREST' AND p."status" = 'PENDING'
  AND (p."payload"->>'squad' IS NULL OR p."payload"->>'role' IS NULL OR (p."payload"->>'squad', p."payload"->>'role') NOT IN (VALUES
    ('Command', 'Command'), ('Command', 'Communications / Intelligence Specialist'),
    ('Alpha', 'Team Leader'), ('Alpha', 'Assaulter'), ('Alpha', 'Medic'), ('Alpha', 'Assistant Medic'),
    ('Bravo', 'Team Leader'), ('Bravo', 'Assaulter'), ('Bravo', 'Medic'), ('Bravo', 'Assistant Medic'),
    ('Charlie', 'Team Leader'), ('Charlie', 'Assaulter'), ('Charlie', 'Medic'), ('Charlie', 'Assistant Medic'),
    ('Delta', 'Team Leader'), ('Delta', 'Technician'),
    ('Echo', 'Team Leader'), ('Echo', 'Operator')));

-- Required reading aimed at a billet or a squad.
UPDATE "LibraryDocument" d
SET "requiredRoles" = COALESCE((SELECT array_agg(DISTINCT pg_temp.restructure_role(r)) FROM unnest(d."requiredRoles") r), ARRAY[]::TEXT[])
WHERE cardinality(d."requiredRoles") > 0;
UPDATE "LibraryDocument" d
SET "requiredSquads" = COALESCE((
      SELECT array_agg(DISTINCT q) FROM (SELECT pg_temp.restructure_squad(s, NULL) AS q FROM unnest(d."requiredSquads") s) x WHERE q IS NOT NULL
    ), ARRAY[]::TEXT[])
WHERE cardinality(d."requiredSquads") > 0;

-- The Admin page's Discord role mapping keys squads and billets by name.
-- Where old billets merge, the lower "pref" wins; Reaper's role goes to
-- Delta and Medical's is dropped (the site ignores names it doesn't know).
UPDATE "Setting" s
SET "value" = jsonb_set(
      s."value",
      '{billets}',
      COALESCE((
        SELECT jsonb_object_agg(k, v)
        FROM (
          SELECT DISTINCT ON (pg_temp.restructure_role(e.key)) pg_temp.restructure_role(e.key) AS k, e.value AS v
          FROM jsonb_each(s."value"->'billets') e
          LEFT JOIN "_role_map" m ON m."old" = e.key
          ORDER BY pg_temp.restructure_role(e.key), COALESCE(m."pref", -1)
        ) x
      ), '{}'::jsonb)
    ),
    "updatedAt" = CURRENT_TIMESTAMP
WHERE s."key" = 'roles' AND jsonb_typeof(s."value"->'billets') = 'object';
UPDATE "Setting" s
SET "value" = jsonb_set(
      s."value",
      '{squads}',
      COALESCE((
        SELECT jsonb_object_agg(k, v)
        FROM (
          SELECT DISTINCT ON (pg_temp.restructure_squad(e.key, NULL)) pg_temp.restructure_squad(e.key, NULL) AS k, e.value AS v
          FROM jsonb_each(s."value"->'squads') e
          WHERE pg_temp.restructure_squad(e.key, NULL) IS NOT NULL
          ORDER BY pg_temp.restructure_squad(e.key, NULL), (e.key = 'Reaper')
        ) x
      ), '{}'::jsonb)
    ),
    "updatedAt" = CURRENT_TIMESTAMP
WHERE s."key" = 'roles' AND jsonb_typeof(s."value"->'squads') = 'object';

DROP FUNCTION pg_temp.restructure_squad(TEXT, TEXT);
DROP FUNCTION pg_temp.restructure_role(TEXT);
DROP TABLE "_role_map";
