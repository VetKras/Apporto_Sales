
/*
# Seed: authority rules and products

1. Seeds
   - 4 authority_rules rows defining the conflict-handling behavior per level.
   - 4 V1 sellable product rows: CoTutor, PowerGrader, TrustEd, ExamSpace.
     Portia is NOT seeded as a product.

2. Notes
   - Uses ON CONFLICT DO NOTHING for idempotency so re-runs are safe.
   - product source_refs store the knowledge file paths from the product definitions doc.
*/

-- Authority rules
INSERT INTO authority_rules (authority_level, label, conflict_behavior, can_apply_updates, requires_confirmation)
VALUES
  (1, 'Low / new or unknown employee',     'block_with_supervisor_escalation',           false, true),
  (2, 'Standard sales/product user',       'create_proposed_update',                     false, true),
  (3, 'Manager / domain owner',            'deep_analysis_strong_proposal',              false, true),
  (4, 'Executive / company leadership',    'deferential_analysis_confirmation_gated_override', true, true)
ON CONFLICT (authority_level) DO NOTHING;

-- Products (V1 sellable only — no Portia)
INSERT INTO products (id, slug, name, category, description, positioning, status, source_refs)
VALUES
  (
    'seed-product-cotutor',
    'cotutor',
    'CoTutor',
    'AI learning and authoring assistant',
    'An assignment-aware, rubric-aligned, faculty-guardrailed AI learning and authoring assistant that supports students while they work. Not a general-purpose chatbot.',
    'Assignment-aware, rubric-aligned, faculty-guardrailed AI learning assistant.',
    'active',
    '["Knowledge/Products/CoTutor/cotutor_product.md","Knowledge/Products/CoTutor/CoTutor Product Requirements Document 06-20.txt","Knowledge/Products/CoTutor/CoTutor Pricing, Packaging & Competitive Strategy 06-20.txt","Knowledge/Products/CoTutor/marketing.md"]'::jsonb
  ),
  (
    'seed-product-powergrader',
    'powergrader',
    'PowerGrader',
    'AI-assisted grading engine',
    'An LMS-native grading workspace that produces rubric-aligned draft scores and feedback for instructor review. Faculty remains final authority. Not automated final grading.',
    'Rubric-aligned AI grading support with faculty final authority.',
    'active',
    '["Knowledge/Products/PowerGrader/powergrader_product.md","Knowledge/Products/PowerGrader/powergrader_change_log.md","Knowledge/Products/PowerGrader/roadmap.md"]'::jsonb
  ),
  (
    'seed-product-trusted',
    'trusted',
    'TrustEd',
    'Academic integrity and authorship evidence',
    'An authorship and academic integrity evidence platform that analyzes writing process and behavioral signals to surface explainable evidence for faculty review. Does not automatically accuse or penalize.',
    'Writing-process and authorship evidence for faculty review, not automatic accusation.',
    'active',
    '["Knowledge/Products/TrustEd/trusted_product.md","Knowledge/Products/TrustEd/TrustEd Product Requirements Docume 06-20.md","Knowledge/Products/TrustEd/marketing.md"]'::jsonb
  ),
  (
    'seed-product-examspace',
    'examspace',
    'ExamSpace',
    'Controlled VDI assessment environment',
    'A VDI-based controlled assessment environment that enforces application, system, and network policy at the infrastructure level. Not browser-only lockdown and not AI proctoring.',
    'Infrastructure-level controlled assessment environment, not browser-only lockdown and not AI proctoring.',
    'active',
    '["Knowledge/Products/ExamSpace/examspace_product.md","Knowledge/Products/ExamSpace/examspace_change_log.md","Knowledge/Products/ExamSpace/RespondusLockDownBrowser_positioning.md","Knowledge/Products/ExamSpace/RespondusMonitor_positioning.md"]'::jsonb
  )
ON CONFLICT (id) DO NOTHING;
