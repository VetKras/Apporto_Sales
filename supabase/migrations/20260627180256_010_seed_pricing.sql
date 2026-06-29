
/*
# Seed: active V1 pricing config version and all pricing models

1. Seeds
   - One pricing_config_versions row: 'v1-active-defaults' with is_active=true.
   - Pricing model rows for all four products at all tiers.
   
   CoTutor active V1 defaults (NOT the historical 80/65/50 workbook values):
     Departmental/Premium: $20/student/year
     Campus/Standard:      $15/student/year
     Platform/Entry:       $10/student/year

   PowerGrader:
     Per student:    $15/student/year
     Per faculty:    $120/faculty/year
     Per submission: $4/submission

   TrustEd:
     Standalone:   $50/student/year
     Bundle add-on: $40/student/year

   ExamSpace:
     Medium:       $11/seat-day
     Large:        $16/seat-day
     GPU:          $23/seat-day
     Platform fee: $1200/year (new customers only)
     Setup fee:    $2500 one-time (new customers only)

2. Notes
   - The historical CoTutor 80/65/50 values from the old workbook are NOT seeded as active.
   - All prices are configurable — stored in the DB, not hardcoded in application logic.
   - is_active=true on this version is the signal the pricing engine reads at runtime.
   - ON CONFLICT DO NOTHING makes re-runs safe.
*/

-- Insert the active config version
INSERT INTO pricing_config_versions (id, version_name, effective_date, notes, is_active, validation_status, source_refs)
VALUES (
  'a1b2c3d4-0001-0001-0001-000000000001'::uuid,
  'v1-active-defaults',
  '2025-01-01',
  'Active V1 configurable defaults from current Apporto Sales planning and PO app config. CoTutor: 20/15/10. Historical 80/65/50 workbook values are NOT active defaults.',
  true,
  'valid',
  '["AI_Sales_App_-_Bolt_Seed_File.txt","AI_Sales_App_-_Portia_System_Prompt.txt"]'::jsonb
)
ON CONFLICT (id) DO NOTHING;

-- CoTutor pricing models
INSERT INTO pricing_models (config_version_id, product_id, tier_name, pricing_type, unit, default_price, currency, source_reference, confidence)
VALUES
  ('a1b2c3d4-0001-0001-0001-000000000001'::uuid, 'seed-product-cotutor', 'Departmental / Premium', 'per_student', 'student/year', 20, 'USD', 'v1-active-defaults seed', 'high'),
  ('a1b2c3d4-0001-0001-0001-000000000001'::uuid, 'seed-product-cotutor', 'Campus / Standard',       'per_student', 'student/year', 15, 'USD', 'v1-active-defaults seed', 'high'),
  ('a1b2c3d4-0001-0001-0001-000000000001'::uuid, 'seed-product-cotutor', 'Platform / Entry',        'per_student', 'student/year', 10, 'USD', 'v1-active-defaults seed', 'high')
ON CONFLICT (config_version_id, product_id, tier_name, pricing_type) DO NOTHING;

-- PowerGrader pricing models
INSERT INTO pricing_models (config_version_id, product_id, tier_name, pricing_type, unit, default_price, currency, source_reference, confidence)
VALUES
  ('a1b2c3d4-0001-0001-0001-000000000001'::uuid, 'seed-product-powergrader', 'Per Student',    'per_student',    'student/year',   15,  'USD', 'v1-active-defaults seed', 'high'),
  ('a1b2c3d4-0001-0001-0001-000000000001'::uuid, 'seed-product-powergrader', 'Per Faculty',    'per_faculty',    'faculty/year',   120, 'USD', 'v1-active-defaults seed', 'high'),
  ('a1b2c3d4-0001-0001-0001-000000000001'::uuid, 'seed-product-powergrader', 'Per Submission', 'per_submission', 'submission',     4,   'USD', 'v1-active-defaults seed', 'high')
ON CONFLICT (config_version_id, product_id, tier_name, pricing_type) DO NOTHING;

-- TrustEd pricing models
INSERT INTO pricing_models (config_version_id, product_id, tier_name, pricing_type, unit, default_price, currency, source_reference, confidence)
VALUES
  ('a1b2c3d4-0001-0001-0001-000000000001'::uuid, 'seed-product-trusted', 'Standalone',    'per_student', 'student/year', 50, 'USD', 'v1-active-defaults seed', 'high'),
  ('a1b2c3d4-0001-0001-0001-000000000001'::uuid, 'seed-product-trusted', 'Bundle Add-on', 'per_student', 'student/year', 40, 'USD', 'v1-active-defaults seed', 'high')
ON CONFLICT (config_version_id, product_id, tier_name, pricing_type) DO NOTHING;

-- ExamSpace pricing models
INSERT INTO pricing_models (config_version_id, product_id, tier_name, pricing_type, unit, default_price, currency, source_reference, confidence)
VALUES
  ('a1b2c3d4-0001-0001-0001-000000000001'::uuid, 'seed-product-examspace', 'Medium',        'per_seat_day',   'seat-day',  11,   'USD', 'v1-active-defaults seed', 'high'),
  ('a1b2c3d4-0001-0001-0001-000000000001'::uuid, 'seed-product-examspace', 'Large',         'per_seat_day',   'seat-day',  16,   'USD', 'v1-active-defaults seed', 'high'),
  ('a1b2c3d4-0001-0001-0001-000000000001'::uuid, 'seed-product-examspace', 'GPU',           'per_seat_day',   'seat-day',  23,   'USD', 'v1-active-defaults seed', 'high'),
  ('a1b2c3d4-0001-0001-0001-000000000001'::uuid, 'seed-product-examspace', 'Platform Fee',  'platform_fee',   'year',      1200, 'USD', 'v1-active-defaults seed; new customers only', 'high'),
  ('a1b2c3d4-0001-0001-0001-000000000001'::uuid, 'seed-product-examspace', 'Setup Fee',     'setup_fee',      'one-time',  2500, 'USD', 'v1-active-defaults seed; new customers only', 'high')
ON CONFLICT (config_version_id, product_id, tier_name, pricing_type) DO NOTHING;
