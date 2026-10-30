-- Starter award catalog. Insert-if-missing by slug, so it is safe on a live
-- database and never touches an award an admin has since edited, retired or
-- deleted-and-recreated. A slug already taken by a qualification gets "-award"
-- appended, because /vault/<slug> shows the award first.
INSERT INTO "Award" ("id", "slug", "name", "kind", "precedence", "ribbon", "description", "criteria", "repeatable", "device", "autoRule", "updatedAt")
SELECT gen_random_uuid()::text,
       CASE WHEN EXISTS (SELECT 1 FROM "Qualification" q WHERE q."slug" = v."slug") THEN v."slug" || '-award' ELSE v."slug" END,
       v."name", v."kind"::"AwardKind", v."precedence", v."ribbon"::jsonb, v."description", v."criteria", v."repeatable", v."device"::"AwardDevice", v."autoRule"::jsonb, CURRENT_TIMESTAMP
FROM (VALUES
    ('combat-valor-medal', $$Combat Valor Medal$$, 'MEDAL', 10, '[{"color":"#7a1f1f","width":5},{"color":"#e8e8e8","width":1},{"color":"#1f3a7a","width":6},{"color":"#e8e8e8","width":1},{"color":"#7a1f1f","width":5}]', $$For conspicuous courage under fire, beyond what the mission asked.$$, $$Nominated by squad leadership and decided by Command.

Awarded to an operator who put the team or the objective ahead of their own safety in contact: drawing fire so others could move, going back for a casualty, or holding when holding was the only option. The citation names the op and what was done.$$, false, 'NONE', NULL),
    ('lifesaver-medal', $$Lifesaver Medal$$, 'MEDAL', 20, '[{"color":"#2f5d3a","width":1},{"color":"#e8e8e8","width":6},{"color":"#a32020","width":4},{"color":"#e8e8e8","width":6},{"color":"#2f5d3a","width":1}]', $$For keeping a teammate in the fight, or alive, when it counted.$$, $$Nominated by squad leadership and decided by Command.

Awarded for saving a life under pressure: a tourniquet in contact, a casualty carried out, a MEDEVAC run to the standard. The citation says who was saved and how.$$, false, 'NONE', NULL),
    ('unit-citation', $$Unit Citation$$, 'UNIT_CITATION', 30, '[{"color":"#c9a227","width":2},{"color":"#1b3a6b","width":6},{"color":"#c9a227","width":2},{"color":"#1b3a6b","width":6},{"color":"#c9a227","width":2}]', $$For a team that performed as one on a hard op.$$, $$Nominated by squad leadership and decided by Command, one nomination per member of the team.

Awarded to the whole element that carried an operation through when it went wrong: communication held, fire and manoeuvre stayed tight, and nobody was left behind. The citation names the op.$$, false, 'NONE', NULL),
    ('leadership-commendation', $$Leadership Commendation$$, 'COMMENDATION', 40, '[{"color":"#4b2e83","width":4},{"color":"#e8e8e8","width":1},{"color":"#c9a227","width":2},{"color":"#e8e8e8","width":1},{"color":"#4b2e83","width":4}]', $$For leading well when it was not easy.$$, $$Nominated by squad leadership and decided by Command.

Awarded to someone who led a team through an op, a training block or a rough patch and made the people around them better. Can be given more than once.$$, true, 'OAK_LEAF', NULL),
    ('instructor-ribbon', $$Instructor Ribbon$$, 'COMMENDATION', 50, '[{"color":"#2f5d3a","width":5},{"color":"#c9a227","width":1},{"color":"#e8e8e8","width":2},{"color":"#c9a227","width":1},{"color":"#2f5d3a","width":5}]', $$For turning recruits into operators.$$, $$Nominated by squad leadership and decided by Command.

Awarded to instructors and NCOs who ran training that stuck: sound lesson plans, patient coaching and recruits who came out of it ready. Can be given more than once.$$, true, 'OAK_LEAF', NULL),
    ('recruiter-ribbon', $$Recruiter Ribbon$$, 'COMMENDATION', 60, '[{"color":"#1f5f7a","width":5},{"color":"#e8e8e8","width":1},{"color":"#d97b29","width":2},{"color":"#e8e8e8","width":1},{"color":"#1f5f7a","width":5}]', $$For bringing good people through the door.$$, $$Nominated by squad leadership and decided by Command.

Awarded to recruiters who found, vetted and welcomed new operators who went on to earn their place in the unit. Can be given more than once.$$, true, 'STAR', NULL),
    ('good-conduct-ribbon', $$Good Conduct Ribbon$$, 'SERVICE', 70, '[{"color":"#7a5a32","width":6},{"color":"#e8e8e8","width":1},{"color":"#4f6b2f","width":4},{"color":"#e8e8e8","width":1},{"color":"#7a5a32","width":6}]', $$For six months of clean, dependable service.$$, $$Awarded automatically after 182 days as an active member with no disciplinary entries on the service record in that window.$$, false, 'NONE', '{"type":"good_conduct","days":182}'),
    ('operations-ribbon', $$Operations Ribbon$$, 'SERVICE', 80, '[{"color":"#3b4a2f","width":4},{"color":"#d4b483","width":1},{"color":"#8f1d21","width":3},{"color":"#d4b483","width":1},{"color":"#3b4a2f","width":4}]', $$For turning up, op after op.$$, $$Awarded automatically for attending operations: the first at 10, then another for every 10 after that. The numeral on the ribbon is the number of times it has been earned.$$, true, 'NUMERAL', '{"type":"ops_attended","threshold":10,"every":10}'),
    ('six-month-service', $$Six Month Service Ribbon$$, 'SERVICE', 90, '[{"color":"#4f6b2f","width":7},{"color":"#d4b483","width":2},{"color":"#4f6b2f","width":7}]', $$Six months in the unit.$$, $$Awarded automatically at 182 days since enlistment.$$, false, 'NONE', '{"type":"service_days","threshold":182}'),
    ('one-year-service', $$One Year Service Ribbon$$, 'SERVICE', 100, '[{"color":"#4f6b2f","width":5},{"color":"#d4b483","width":1},{"color":"#4f6b2f","width":4},{"color":"#d4b483","width":1},{"color":"#4f6b2f","width":5}]', $$A full year in the unit.$$, $$Awarded automatically at 365 days since enlistment.$$, false, 'NONE', '{"type":"service_days","threshold":365}'),
    ('two-year-service', $$Two Year Service Ribbon$$, 'SERVICE', 110, '[{"color":"#4f6b2f","width":4},{"color":"#d4b483","width":1},{"color":"#4f6b2f","width":2},{"color":"#d4b483","width":1},{"color":"#4f6b2f","width":2},{"color":"#d4b483","width":1},{"color":"#4f6b2f","width":4}]', $$Two years in the unit. The long haul.$$, $$Awarded automatically at 730 days since enlistment.$$, false, 'NONE', '{"type":"service_days","threshold":730}')
) AS v("slug", "name", "kind", "precedence", "ribbon", "description", "criteria", "repeatable", "device", "autoRule")
WHERE NOT EXISTS (SELECT 1 FROM "Award" a WHERE a."slug" IN (v."slug", v."slug" || '-award'))
ON CONFLICT ("slug") DO NOTHING;
