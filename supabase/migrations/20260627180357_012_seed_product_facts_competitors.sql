
/*
# Seed: product facts and key competitors

1. Seeds
   - Core product_facts rows covering sales-safe claims, known risks/data gaps,
     and integration capabilities for each V1 product.
   - Key competitor records for battlecard use.

2. Notes
   - fact_type values: 'sales_safe_claim', 'known_risk', 'integration', 'positioning', 'capability'
   - Portia will cite individual fact rows, so granular facts are better than one big blob.
*/

-- CoTutor facts
INSERT INTO product_facts (product_id, fact_type, content, confidence)
VALUES
  ('seed-product-cotutor', 'positioning', 'CoTutor is not a general-purpose chatbot. It is scoped to assignment instructions, rubrics, and faculty-defined guardrails.', 'high'),
  ('seed-product-cotutor', 'sales_safe_claim', 'Assignment-aware, not generic AI chat — CoTutor knows the assignment context before helping.', 'high'),
  ('seed-product-cotutor', 'sales_safe_claim', 'Faculty decides how AI helps — configurable assistance levels and teaching method (Socratic, problem-based, explanatory).', 'high'),
  ('seed-product-cotutor', 'sales_safe_claim', 'Designed for governed institutional AI adoption, not consumer AI experimentation.', 'high'),
  ('seed-product-cotutor', 'integration', 'Supports LMS integration, Microsoft Word add-in, and Google Docs integration.', 'medium'),
  ('seed-product-cotutor', 'integration', 'Uses PowerGrader as the pre-submission review engine.', 'high'),
  ('seed-product-cotutor', 'known_risk', 'Guardrail misconfiguration can create over-assistance. Faculty setup guidance is important.', 'high'),
  ('seed-product-cotutor', 'known_risk', 'Google Docs integration is noted as hardening/in progress. Verify current status before customer demos.', 'medium'),
  ('seed-product-cotutor', 'known_risk', 'Claims about measured outcomes need a specific pilot/source before customer use — do not invent metrics.', 'high')
ON CONFLICT DO NOTHING;

-- PowerGrader facts
INSERT INTO product_facts (product_id, fact_type, content, confidence)
VALUES
  ('seed-product-powergrader', 'positioning', 'PowerGrader is decision support, not automated assessment. Faculty remains final authority on every grade.', 'high'),
  ('seed-product-powergrader', 'sales_safe_claim', 'AI-assisted grading that respects faculty control — draft scores are reviewed, edited, and approved by instructors.', 'high'),
  ('seed-product-powergrader', 'sales_safe_claim', 'Rubric-first workflow supports transparency and grading consistency across sections.', 'high'),
  ('seed-product-powergrader', 'integration', 'Canvas LMS integration is operational. D2L and Moodle stabilization are active/in progress.', 'medium'),
  ('seed-product-powergrader', 'integration', 'Supports multi-format submissions and direct escalation into TrustEd evidence views.', 'high'),
  ('seed-product-powergrader', 'known_risk', 'D2L and Moodle integrations are noted as active/in progress — verify current status before quoting those LMS customers.', 'medium'),
  ('seed-product-powergrader', 'known_risk', 'Avoid claims like "eliminates grading time" — grading quality depends on rubric completeness and assignment structure.', 'high')
ON CONFLICT DO NOTHING;

-- TrustEd facts
INSERT INTO product_facts (product_id, fact_type, content, confidence)
VALUES
  ('seed-product-trusted', 'positioning', 'TrustEd is behavior-based and evidence-focused. It surfaces authorship signals for faculty judgment — it does not accuse automatically.', 'high'),
  ('seed-product-trusted', 'sales_safe_claim', 'Designed for transparency, not black-box accusation. Faculty makes all final determinations.', 'high'),
  ('seed-product-trusted', 'sales_safe_claim', 'Reduces over-reliance on text-only AI detection tools by analyzing writing process and behavioral signals.', 'high'),
  ('seed-product-trusted', 'capability', 'Capabilities: keystroke/process playback, writing speed/revision analysis, copy-paste detection, writing style consistency, outlier detection.', 'high'),
  ('seed-product-trusted', 'known_risk', 'Faculty may misinterpret indicators as definitive judgments — messaging should emphasize evidence and review, not accusation.', 'high')
ON CONFLICT DO NOTHING;

-- ExamSpace facts
INSERT INTO product_facts (product_id, fact_type, content, confidence)
VALUES
  ('seed-product-examspace', 'positioning', 'ExamSpace controls the full assessment environment at the infrastructure level, not just the browser tab.', 'high'),
  ('seed-product-examspace', 'positioning', 'Not browser-only lockdown. Not AI proctoring. Not automated surveillance.', 'high'),
  ('seed-product-examspace', 'sales_safe_claim', 'Supports both restricted and authentic tool-enabled assessments — faculty can allow specific software for the exam design.', 'high'),
  ('seed-product-examspace', 'sales_safe_claim', 'Provides equitable access to required software through cloud desktops, replacing local lab constraints.', 'high'),
  ('seed-product-examspace', 'sales_safe_claim', 'Enforces policy centrally at the virtual desktop level — URL/network, application control, AI tool access all configurable.', 'high'),
  ('seed-product-examspace', 'integration', 'LMS launch via LTI 1.3. Admin-managed base exam desktops with faculty clone/configure workflow.', 'high'),
  ('seed-product-examspace', 'known_risk', 'Faculty misconfiguration of allowed tools can weaken assessment design. Training is important.', 'medium'),
  ('seed-product-examspace', 'known_risk', 'High-concurrency reliability must be validated for large deployments — check capacity planning before committing to peak exam periods.', 'medium')
ON CONFLICT DO NOTHING;

-- Seed key competitors
INSERT INTO competitors (name, category, notes)
VALUES
  ('Respondus LockDown Browser', 'Assessment security / browser lockdown', 'Browser-based lockdown tool. Does not control infrastructure. Direct competitor to ExamSpace.'),
  ('Respondus Monitor', 'AI proctoring', 'Webcam-based AI proctoring. Not infrastructure-level. ExamSpace differentiates on environment control vs surveillance.'),
  ('Turnitin', 'Academic integrity', 'Text-similarity-based plagiarism detection. TrustEd differentiates on writing-process evidence vs text matching.'),
  ('Honorlock', 'AI proctoring', 'AI proctoring tool. Similar to Respondus Monitor. ExamSpace differentiates on VDI infrastructure vs webcam surveillance.'),
  ('Proctorio', 'AI proctoring', 'Browser extension AI proctoring. ExamSpace differentiates on full environment control vs browser extension.'),
  ('iParadigms / Turnitin Feedback Studio', 'AI-assisted grading', 'Rubric and feedback tools. PowerGrader differentiates on LMS-native workflow and faculty control.'),
  ('Khanmigo / Khan Academy AI', 'AI tutoring', 'Consumer AI tutoring. CoTutor differentiates on institutional governance, faculty guardrails, and assignment-awareness.')
ON CONFLICT (name) DO NOTHING;
