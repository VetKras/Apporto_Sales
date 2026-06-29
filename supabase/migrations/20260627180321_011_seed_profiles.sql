
/*
# Seed: profiles (verified core team members only)

1. Seeds
   - 11 verified Apporto team member profiles from the stakeholder map.
   - supervisor_profile_id wired where supervisor is known; left null for unknowns.
   - No placeholder/fake users. Unknown supervisors remain null — not guessed.
   - auth_user_id left null; populated when each person signs in for the first time.

2. Notes
   - Uses text PKs matching the seed IDs from the spec for idempotency.
   - ON CONFLICT (id) DO NOTHING makes re-runs safe.
   - Two-pass insert: first insert rows without supervisor FKs, then update
     supervisor_profile_id in a second step for the ones we know.
*/

-- Pass 1: insert all profiles without supervisor linkage
INSERT INTO profiles (id, name, email, title, department, authority_level, authority_notes, status)
VALUES
  ('seed-antony-awaida',    'Antony Awaida',    'antony@apporto.com',       'CEO',                            'Executive',    4, 'Final company authority on strategy, revenue outcomes, customer commitments, and resource allocation.', 'active'),
  ('seed-veton-krasniqi',   'Veton Krasniqi',   'v.krasniqi@apporto.com',   'AI Product Owner',              'Product',      3, 'Domain owner for AI Suite product strategy, product truth, roadmap alignment, and sales/product feedback loops.', 'active'),
  ('seed-michael-smith',    'Michael Smith',    'msmith@apporto.com',        'Director of Marketing',         'Marketing',    4, 'Leadership/high-trust source for messaging, positioning, case studies, and sales narrative. Product/pricing conflicts still require source trace and audit.', 'active'),
  ('seed-brian-gray',       'Brian Gray',       'brian@apporto.com',         'Chief Engineering Officer',     'Engineering',  4, 'Leadership/high-trust source for engineering feasibility, delivery capacity, technical readiness, and release risk.', 'active'),
  ('seed-phil-spitze',      'Phil Spitze',      'p.spitze@apporto.com',      'VP Sales / Solutions Architect','Sales',        3, 'High-trust source for sales positioning, solution alignment, buyer objections, and technical sales context.', 'active'),
  ('seed-austin-shelp',     'Austin Shelp',     'a.shelp@apporto.com',       'Account Executive',             'Sales',        2, 'Standard sales user. Customer notes, deal feedback, and objections can create proposed updates.', 'active'),
  ('seed-tony-dunckel',     'Tony Dunckel',     't.dunckel@apporto.com',     'Product Owner, VDI / DaaS',     'Product',      3, 'Domain owner for VDI/DaaS roadmap, customer migrations, and rollout execution.', 'active'),
  ('seed-dallin-hutchison', 'Dallin Hutchison', 'd.hutchison@apporto.com',   'Lead Engineer / Release Manager','Engineering', 3, 'High-trust source for implementation approach, release sequencing, LMS integrations, and engineering readiness.', 'active'),
  ('seed-suleman-ashfaq',   'Suleman Ashfaq',   's.ashfaq@apporto.com',      'AI Engineer',                   'Engineering',  3, 'High-trust source for AI systems, model integration, RAG/LLM architecture, cost/latency tradeoffs, and technical AI data.', 'active'),
  ('seed-tusha-pavuluri',   'Tusha Pavuluri',   't.pavuluri@apporto.com',    'Lead QA Engineer',              'QA',           3, 'High-trust source for QA strategy, release gating, test coverage, and release readiness.', 'active'),
  ('seed-domonic-vale',     'Domonic (AI Bot)',  null,                        'Competitive Intelligence Bot',  'Competitive',  3, 'AI bot persona for competitive data — not a real person. Do not surface as a user.', 'inactive')
ON CONFLICT (id) DO NOTHING;

-- Pass 2: wire supervisor_profile_id where known
UPDATE profiles SET supervisor_profile_id = 'seed-antony-awaida'  WHERE id = 'seed-veton-krasniqi'   AND supervisor_profile_id IS NULL;
UPDATE profiles SET supervisor_profile_id = 'seed-brian-gray'     WHERE id = 'seed-tony-dunckel'     AND supervisor_profile_id IS NULL;
