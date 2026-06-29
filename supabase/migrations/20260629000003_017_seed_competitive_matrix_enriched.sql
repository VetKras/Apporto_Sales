
/*
# Seed: enriched competitive matrix — all four V1 products (June 2026)

Sources:
  - i:\My Drive\Apporto\Input\Competitive\competitive_matrix_master.csv  (28 rows, May 2026)
  - i:\My Drive\Apporto\Input\Competitive\product_cotutor.csv
  - i:\My Drive\Apporto\Input\Competitive\product_trusted.csv
  - i:\My Drive\Apporto\Input\Competitive\product_examspace.csv
  - i:\My Drive\Apporto\Input\Competitive\COMPETITIVE BRIEF - Schoolyear Safe.txt (June 2026)
  - i:\My Drive\Apporto\AI_Core\Bots\domonic_competitive\LEARNING_LOG.md
  - i:\My Drive\Apporto\Knowledge\Products\competitive_summary.md

Threat tiers:
  tier-1  Direct, high-priority competitive threat with institutional sales impact
  tier-2  Partial overlap or indirect threat; lower displacement risk
  tier-3  Consumer-grade or low institutional penetration; minimal procurement threat
  watch   Under research — insufficient data to assign tier; do not use in customer-facing content

Escalation status:
  escalated  Tier elevated or urgency raised since last review (May/June 2026)
  stable     Verdict confirmed; holding current tier
  monitor    Tier 2+ with active escalation watch trigger
  new        Added to tracking for the first time
  watch      Research required before tier assignment
*/


-- ============================================================
-- 1. MISSING COMPETITOR RECORDS
--    (7 already seeded in migration 012; adding all remaining)
-- ============================================================

INSERT INTO competitors (name, category, notes)
VALUES
  ('Gradescope (Turnitin)',          'Institutional grading platform',
   'Turnitin-owned grading platform with deep higher-ed penetration. Increasingly bundled in Turnitin institutional renewal contracts alongside Clarity and Feedback Studio.'),

  ('CoGrader',                       'AI grading tool',
   'Low-cost AI grading tool. Free starter tier drives bottom-up faculty adoption. Primary risk vector is individual teacher adoption without institutional procurement.'),

  ('Turnitin Clarity',               'Process-visible AI writing workspace',
   'ESCALATED May 2026. Turnitin writing composition environment with AI-assisted drafting, process playback, version history, AI usage visibility, and assignment-to-grading workflows. Now overlaps CoTutor, TrustEd, and PowerGrader simultaneously. Highest cross-suite strategic priority.'),

  ('Turnitin Originality',           'Academic integrity / plagiarism detection',
   'Market-leading text-similarity and AI-detection engine. TrustEd Tier 1. Distribution advantage via Feedback Studio bundling in renewal cycles.'),

  ('Packback',                       'Instructional AI / discussion and writing platform',
   'Pedagogically credible; 600+ institutions. Different competitive surface per product: Tier 1 for CoTutor, Tier 2 for PowerGrader and TrustEd originality signals.'),

  ('TimelyGrader',                   'AI-assisted grading platform',
   'Founded ~2023. Canvas + D2L integrations confirmed. SOC2 Type II + FERPA + HECVAT 4.0 compliance stack. Free tier is primary faculty adoption risk vector.'),

  ('Quizlet Q-Chat',                 'Consumer study AI',
   'Consumer study tool with high student brand familiarity. Minimal direct institutional procurement threat.'),

  ('ChatGPT Edu',                    'Institution-wide AI platform',
   'Institution-licensed OpenAI. SAML SSO. Expanding institutional privacy messaging. One of the largest long-term existential competitors to CoTutor.'),

  ('Gemini for Education',           'Institutional AI platform',
   'Google Workspace AI with LTI 1.3 to Canvas/Schoology. Stronger Workspace for Education integration in 2026. CoTutor Tier 2, potential Tier 1 escalation.'),

  ('Copyleaks',                      'AI and plagiarism detection',
   'Strong LMS coverage across 7+ platforms. Multilingual detection. TrustEd Tier 1. Differentiates on breadth of platform support.'),

  ('GPTZero',                        'Standalone AI detector',
   'Brand visibility in AI detection category. Mostly standalone SaaS. TrustEd Tier 2 — detector-only positioning is weaker than process forensics.'),

  ('ExamSoft / Examplify',           'Secure exam platform',
   'ESCALATED Tier 1 May 2026. Deep footprint in law, medical, and certification markets. Largest strategic ExamSpace competitor long-term due to institutional exam infrastructure ownership.'),

  ('Safe Exam Browser (SEB)',        'Open-source secure browser',
   'Free/open-source (MPL). Broad LMS support via plugins. Requires per-device installation. ExamSpace Tier 2.'),

  ('Schoolyear Safe Exam Workspace', 'Secure exam environment (AVD-based)',
   'NEW June 2026. AVD-based architecture creates genuine infrastructure-level security. Direct ExamSpace territory — targets same virtual desktop exam delivery category.'),

  ('Writable',                       'AI writing feedback platform',    'Watch list. Research required before tier assignment.'),
  ('MagicSchool AI',                 'AI teacher productivity platform', 'Watch list. Research required before tier assignment.'),
  ('Brisk Teaching',                 'AI teacher assistant',             'Watch list. Research required before tier assignment.'),
  ('Instructure IgniteAI',           'Native LMS AI layer (Canvas)',     'Watch list. Native Canvas — no procurement required. Structural distribution threat to CoTutor.'),
  ('Microsoft Copilot for Education','Institutional AI platform',        'Watch list. Microsoft 365 institutional footprint = distribution threat to CoTutor. Research required.')
ON CONFLICT (name) DO NOTHING;


-- ============================================================
-- 2. ENRICHED COMPETITIVE MATRIX ROWS
--    All 28 CSV rows + Schoolyear Safe (June 2026)
--    Product IDs looked up by slug; competitor IDs by name
-- ============================================================

INSERT INTO competitive_matrix (
  product_id, competitor_id,
  threat_tier, escalation_status, category,
  competitor_strength, apporto_edge,
  sales_positioning_line,
  threat_rationale, key_overlap,
  pricing_intel, lms_coverage, ferpa_positioning,
  latest_notes, evidence_source,
  strategic_window,
  confidence, freshness_date
)
SELECT
  p.id, c.id,
  v.threat_tier, v.escalation_status::text, v.category,
  v.competitor_strength, v.apporto_edge,
  v.sales_positioning_line,
  v.threat_rationale, v.key_overlap,
  v.pricing_intel, v.lms_coverage, v.ferpa_positioning,
  v.latest_notes, v.evidence_source,
  v.strategic_window,
  v.confidence, v.freshness_date::date
FROM (VALUES

  -- ================================================================
  -- POWERGRADER
  -- ================================================================

  ('powergrader', 'Gradescope (Turnitin)', 'tier-1', 'stable',
   'Institutional grading platform',
   'Deep higher-ed penetration; trusted grading brand; broad assignment-type support; strong LMS coverage; increasingly bundled in Turnitin institutional renewal contracts',
   'Adaptive grading that learns teacher grading voice; rubric generation from assignment structure; teacher-controlled draft/publish workflow; behavioral process evidence from TrustEd; FERPA-safe enterprise AI governance',
   'Gradescope grades at scale; PowerGrader adapts to each teacher''s grading voice and closes the loop with AI tutoring and integrity evidence.',
   'Gradescope procurement risk is amplifying via Turnitin bundling — institutions renewing Turnitin Feedback Studio contracts get Gradescope as part of the ecosystem, bypassing a standalone grading evaluation.',
   'Assignment grading, rubric workflows, LMS grade sync',
   'Custom / institutional quote (Turnitin contract-bundled)',
   'Blackboard, Brightspace, Canvas, Moodle, Sakai (LTI)',
   'FERPA-compliant; institutional data governance via Turnitin enterprise',
   'Verdict confirmed May 2026. Turnitin ecosystem strengthening through Clarity integration increases indirect procurement risk. Keep Tier 1.',
   'competitive_matrix_master.csv (May 2026); Domonic LEARNING_LOG',
   NULL,
   'high', '2026-05-01'),

  ('powergrader', 'CoGrader', 'tier-2', 'stable',
   'AI grading tool',
   'Free starter tier drives individual teacher adoption without institutional procurement; low-cost paid plans; FERPA messaging; Canvas and Google Classroom integrations confirmed',
   'PowerGrader is sold as a premium institutional product with governance, adaptive teacher voice modeling, TrustEd integration, and full AI Suite loop — CoGrader is a standalone point tool',
   'CoGrader wins on price entry; PowerGrader wins on institution-grade governance, adaptive learning, and full AI suite integration.',
   'Bottom-up adoption risk: individual faculty may self-adopt CoGrader free tier, creating institutional fragmentation before a top-down PowerGrader evaluation occurs.',
   'AI-assisted grading, rubrics, educator workflow, basic LMS sync',
   'Free starter; $15/month standard; school/district quote',
   'Google Classroom (all plans); Canvas, Schoology (school plans)',
   'FERPA messaging present; institutional data governance limited',
   'Official pricing and integration confirmed on CoGrader pricing and help pages.',
   'competitive_matrix_master.csv (May 2026)',
   NULL,
   'high', '2026-05-01'),

  ('powergrader', 'Turnitin Clarity', 'tier-1', 'escalated',
   'Process-visible writing workspace / grading adjacency',
   'Turnitin brand and installed base; institutional buyers already under contract; now a full writing composition environment with AI-assisted drafting, process playback, version history, AI usage visibility, and assignment-to-grading workflows',
   'Apporto links process visibility, AI tutoring, adaptive grading, and integrity evidence in one closed loop across all student tools — Clarity is a single managed writing environment',
   'Turnitin Clarity shows the writing process inside one workspace; PowerGrader closes the grading loop and connects integrity evidence to final assessment.',
   'Turnitin Clarity now competes on grading workflow, not just writing visibility — institutions that already have Turnitin can get overlapping grading-adjacent features through contract renewal without a new buying decision.',
   'AI-assisted drafting, process playback, assignment-to-grading workflows, writing-stage visibility',
   'Paid add-on to Turnitin Feedback Studio (pricing not publicly standardized)',
   'LTI 1.3 (recommended); Turnitin ecosystem',
   'Turnitin institutional data governance',
   'ESCALATED May 2026. No longer integrity-adjacent only — now overlaps CoTutor, TrustEd, and PowerGrader simultaneously. Highest strategic priority across suite.',
   'competitive_matrix_master.csv (May 2026); Domonic LEARNING_LOG',
   'Cross-suite Turnitin Clarity threat window is open now. Counter strategy requires demonstrating full workflow loop (CoTutor→PowerGrader→TrustEd) as structurally superior to any single Turnitin workspace.',
   'high', '2026-05-01'),

  ('powergrader', 'Packback', 'tier-2', 'stable',
   'Pedagogically aligned writing feedback platform',
   'Strong pedagogy and institutional trust; 600+ institutions; instructional AI brand; expanding AI-writing and originality positioning; strong LTI Advantage integration',
   'PowerGrader covers grading across all assignment types, not just discussion and writing; adds adaptive teacher voice, TrustEd integrity evidence, and LMS/AI suite loop',
   'Packback supports discussion and writing feedback; PowerGrader adapts grading across all assignment types and integrates TrustEd integrity evidence.',
   'Packback''s pedagogical credibility is a door-opener for faculty — it may be evaluated alongside PowerGrader in institutions that prioritize instructor workflow. Risk is being framed as overlapping rather than complementary.',
   'Guided AI writing feedback, discussion analytics, inquiry-based AI engagement, originality fingerprint',
   'Per-community pricing; institution-prepaid or student-paid by contract',
   'LTI Advantage; Canvas, Blackboard, D2L, Moodle (grade sync)',
   'FERPA-aligned; institutional contract model',
   'Verdict updated May 2026. Continued institutional expansion. Stronger AI-writing and originality positioning. Keep Tier 2 for PowerGrader, Tier 1 for CoTutor adjacency.',
   'competitive_matrix_master.csv (May 2026)',
   NULL,
   'high', '2026-05-01'),

  ('powergrader', 'TimelyGrader', 'tier-2', 'monitor',
   'AI-assisted grading platform',
   'Human-in-the-loop framing; SOC2 Type II + FERPA + HECVAT 4.0 compliance stack; free tier faculty adoption vector; broad assignment-type support including OCR, video, spreadsheets; AACSB accreditation export; named institutional references (MSU, ASU, UIUC)',
   'PowerGrader sits inside the CoTutor→PowerGrader→TrustEd workflow chain; adaptive grading learns teacher style over time; behavioral process evidence from TrustEd links grading to AI interaction history — TimelyGrader grades in isolation with no upstream behavior data',
   'TimelyGrader accelerates grading workflows; PowerGrader adapts to each teacher''s grading voice and connects assessment to AI behavior history and integrity evidence.',
   'SOC2 Type II and HECVAT 4.0 compliance stack removes a key IT evaluation blocker that smaller AI tools fail at. Free tier creates faculty adoption before procurement is engaged. AACSB positioning targets business school accreditation market specifically.',
   'AI grading suggestions, rubric-based feedback, bulk grading, LMS grade sync, OCR/video/spreadsheet support',
   'Free plan; Starter $10-$12/month; Institutional custom quote',
   'Canvas, D2L Brightspace (SSO, assignment sync, rubric import, grade passback)',
   'FERPA compliant; SOC2 Type II audited; HECVAT 4.0 ready; WCAG 2.2 AA; student data not used to train external AI models',
   'Verdict updated May 2026. Canvas + D2L integrations confirmed. Keep Tier 2 with escalation watch. Free tier is primary adoption risk vector. Founded ~2023; Vancouver BC; early-stage private.',
   'competitive_matrix_master.csv (May 2026)',
   'Monitor LMS expansion — Blackboard addition would materially increase threat level. Monitor funding events.',
   'high', '2026-05-01'),

  ('powergrader', 'iParadigms / Turnitin Feedback Studio', 'tier-2', 'stable',
   'AI-assisted grading and feedback tools (Turnitin ecosystem)',
   'Rubric and feedback tools embedded in Turnitin ecosystem; broad institutional penetration via existing contracts; increasingly cross-sold with Clarity and Gradescope in renewals',
   'PowerGrader is LMS-native with adaptive teacher voice, draft/publish control, and direct TrustEd escalation path — Feedback Studio is grading-adjacent to integrity, not grading-first',
   'Turnitin Feedback Studio adds rubrics and comments to Turnitin workflow; PowerGrader builds adaptive grading intelligence and closes the loop with TrustEd behavioral evidence.',
   'Procurement risk is via bundling — Feedback Studio included in Turnitin contracts without a separate evaluation. Secondary risk: Turnitin Clarity is absorbing Feedback Studio''s grading-adjacent positioning.',
   'Rubric-based feedback, inline comments, grading tools, assignment workflow in Turnitin',
   'Included in Turnitin institutional contract (bundled)',
   'LMS-embedded via Turnitin ecosystem; LTI',
   'Institutional data governance; EU Frankfurt residency option',
   'Turnitin ecosystem bundling risk increasing with Clarity and Gradescope additions. Keep Tier 2.',
   'competitive_matrix_master.csv (May 2026); Migration 012 seed',
   NULL,
   'high', '2026-05-01'),

  -- ================================================================
  -- COTUTOR
  -- ================================================================

  ('cotutor', 'Packback', 'tier-1', 'stable',
   'Instructional AI / discussion and writing support',
   'Pedagogically credible; strong institutional traction at 600+ institutions; analytics; discussion and writing focus; LTI Advantage; institutional trust built over years; inquiry-based AI engagement model',
   'CoTutor works inside standard productivity tools students already use (Word, Google Docs, Visual Studio); faculty-defined guardrails per assignment; pre-submission workflow into PowerGrader and TrustEd',
   'Packback owns discussion; CoTutor extends AI tutoring into the full student workflow including native Office/IDE environments with faculty-defined guardrails.',
   'Packback''s pedagogical credibility is real and institutionally validated. The procurement risk is that evaluators may see Packback and CoTutor as competing for the same AI-tutoring budget line rather than serving different workflow surfaces.',
   'Guided AI feedback without outright answer generation; inquiry-based discussion; writing support; engagement analytics',
   'Per-community pricing; institution-prepaid or student-paid by contract',
   'LTI Advantage; Canvas, Blackboard, D2L, Moodle (grade sync)',
   'FERPA-aligned; institutional contract model',
   'Official Packback site emphasizes instructional AI, institutional trust, LTI Advantage, and AI that supports thinking rather than replaces it.',
   'competitive_matrix_master.csv (May 2026); product_cotutor.csv',
   NULL,
   'high', '2026-05-01'),

  ('cotutor', 'ChatGPT Edu', 'tier-1', 'stable',
   'Institution-wide AI platform',
   'OpenAI brand recognition; Study Mode with personalized AI tutoring; institution data not used to train; SAML SSO; expanding enterprise education positioning; increasing institutional privacy messaging; LMS ecosystem conversations increasing',
   'CoTutor replaces generic AI access with course-aware, faculty-governed tutoring per assignment — governance layer, not just access layer; connects to grading and integrity workflows that ChatGPT Edu cannot reach',
   'ChatGPT Edu gives campus-wide AI access; CoTutor gives faculty control over how AI assists students assignment by assignment.',
   'The core strategic risk: institutions that license ChatGPT Edu may believe they have "solved AI in education" and deprioritize CoTutor. Counter requires demonstrating that campus AI access ≠ assignment-level faculty governance. Key buying question: does the institution require faculty to control AI behavior per course, or just provide students AI access?',
   'Broad AI capabilities; Study Mode; file upload; custom GPTs; assignment context via Canvas LLM-Enabled Assignment (separate Canvas feature)',
   'Institution-licensed; pricing not publicly listed',
   'No native LTI; campus rollout via SSO/governance alongside LMS',
   'Institution data not used to train; SAML SSO',
   'Updated May 2026. More aggressive enterprise education positioning. SAML SSO strengthened. Now one of largest long-term existential competitors to CoTutor. Keep Tier 1.',
   'competitive_matrix_master.csv (May 2026); product_cotutor.csv; Domonic LEARNING_LOG',
   'Q3-Q4 2026: CoTutor SCIM provisioning needed to match ChatGPT Edu enterprise admin parity — this is a hard stop in IT evaluation gates before differentiation is even heard.',
   'high', '2026-05-01'),

  ('cotutor', 'Turnitin Clarity', 'tier-1', 'escalated',
   'Process-visible AI writing environment',
   'Turnitin institutional foothold; show-your-work writing process model; guided AI assistance inside Clarity writing workspace; educator-controlled AI use; LTI 1.3 integration; installed-base leverage via renewal cycles',
   'CoTutor extends beyond a single writing space into Office/Google Docs/VS and supports guided tutoring assistance with faculty-defined guardrails per assignment — not just transparent composition inside one vendor workspace',
   'Turnitin Clarity captures the writing process inside one workspace; CoTutor guides students across every tool they use with course-aware, faculty-controlled scaffolding.',
   'Turnitin Clarity now competes directly on guided AI assistance — not just process visibility. For institutions already paying for Turnitin, Clarity is free/low-cost to add in a renewal. The buying question shifts from "should we buy CoTutor?" to "doesn''t Clarity already do this?"',
   'Process transparency; approved AI use inside assignment workspace; guided AI assistance; writing workspace; process tracking; educator-controlled AI use',
   'Paid add-on to Turnitin Feedback Studio (pricing not publicly standardized)',
   'LTI 1.3 (recommended); Turnitin ecosystem',
   'Turnitin institutional data governance',
   'ESCALATED May 2026. New overlap: guided AI assistance, writing workspace, process tracking, educator-controlled AI use. CoTutor counter: works inside productivity tools students already use, broader assignment ecosystem, assignment-level guardrails, TrustEd linkage.',
   'competitive_matrix_master.csv (May 2026); product_cotutor.csv; Domonic LEARNING_LOG',
   'Cross-suite Turnitin Clarity threat is most acute in CoTutor and TrustEd. Counter requires demonstrating workflow breadth (Office, VS, Google Docs) that Clarity''s single writing editor cannot match.',
   'high', '2026-05-01'),

  ('cotutor', 'Gemini for Education', 'tier-2', 'monitor',
   'Institutional AI via LTI',
   'Google brand; strong Workspace ecosystem; LTI 1.3 to Canvas and Schoology; Workspace SSO; stronger Workspace for Education integration in 2026; native Google ecosystem advantage increasing',
   'CoTutor is guardrail-first with faculty-defined teaching approach (Socratic, problem-based, explanatory) configured per assignment; Gemini for Education is a general AI assistant without pedagogical scaffolding or assignment-level behavioral governance',
   'Gemini for Education puts Google AI in the LMS; CoTutor puts faculty-governed, course-aware AI tutoring inside the tools students write code and essays with.',
   'Distribution risk via Google Workspace for Education installed base — institutions already paying for Google Workspace get Gemini access without a new procurement decision. Assignment-level governance gap is real but may not be visible to institutional evaluators.',
   'Conversational AI; course-context assistance; Google Workspace integration; LTI 1.3',
   'Gemini Education $20/user/month; Premium $30/user/month',
   'Gemini LTI for Canvas, Schoology; Workspace SSO',
   'Google for Education privacy posture; admin-controlled',
   'Updated May 2026. Stronger Workspace for Education integration. Increasing LMS interoperability discussions. Keep Tier 2 — potential Tier 1 escalation. Monitor LMS partnership expansion.',
   'competitive_matrix_master.csv (May 2026); product_cotutor.csv',
   'Monitor Google Workspace + Canvas/Blackboard integration expansion — any LTI depth gain in Fall 2026 would trigger escalation review.',
   'high', '2026-05-01'),

  ('cotutor', 'Khanmigo / Khan Academy AI', 'tier-3', 'stable',
   'Consumer / teacher AI tutor',
   'Strong consumer brand awareness; free for teachers; low learner cost ($4/month or $44/year); guided tutoring and scaffolding inside Khan Academy; Canvas LTI 1.3 for teacher tools',
   'CoTutor provides institutional guardrails, LMS/course-context pull, TrustEd logging, and direct workflow into submission and PowerGrader — Khanmigo operates outside institutional governance',
   'Khanmigo guides students inside Khan Academy; CoTutor brings institution-governed AI tutoring into the tools students already use for coursework.',
   'Low direct institutional threat — Khanmigo does not enter institutional procurement discussions. Risk is only indirect: student familiarity with consumer AI tutors that operate without faculty guardrails may raise expectations.',
   'AI tutoring, scaffolding, guided help inside Khan Academy ecosystem',
   'Teachers free; learners $4/month or $44/year',
   'Primarily Khan Academy environment; Canvas LTI 1.3 for teacher tools',
   'FERPA not deeply documented for consumer tier',
   'Khanmigo pricing page confirms current model. Low direct institutional threat.',
   'competitive_matrix_master.csv (May 2026); product_cotutor.csv',
   NULL,
   'high', '2026-05-01'),

  ('cotutor', 'Quizlet Q-Chat', 'tier-3', 'stable',
   'Consumer study AI',
   'Huge brand familiarity among students; low cost (Quizlet Plus ~$35.99/year or $7.99/month); widely used for consumer study support; no additional tool adoption required for students',
   'CoTutor operates inside the LMS and course context with faculty-set guardrails; institutional control, process logging, course-aware assignment support — Quizlet Q-Chat operates outside institutional oversight entirely',
   'Quizlet Q-Chat serves students outside institutional oversight; CoTutor operates inside the LMS and course context with faculty-set guardrails.',
   'Low institutional threat. Quizlet is not competing in higher-ed procurement. The risk is behavioral: students using consumer study AI without faculty governance creates integrity pressure that CoTutor is designed to address.',
   'Student AI help and study guidance inside Quizlet ecosystem',
   'Quizlet Plus ~$35.99/year or $7.99/month',
   'Quizlet app/site; not LMS-native',
   'No institutional FERPA posture documented',
   'Low direct institutional threat; mostly student-side alternative. Not in procurement competition.',
   'competitive_matrix_master.csv (May 2026); product_cotutor.csv',
   NULL,
   'high', '2026-05-01'),

  ('cotutor', 'Writable', 'watch', 'watch',
   'AI writing feedback platform',
   '[data gap] Integration depth, pricing, and institutional traction not yet confirmed',
   'Guardrail-managed course-aware AI tutoring with TrustEd behavioral linkage and cross-tool support beyond a single writing editor',
   'Pending research validation.',
   '[data gap] Research required — threat tier cannot be assigned without confirmed integration depth and institutional adoption data.',
   '[data gap] Likely: AI writing assistance, feedback generation',
   '[data gap] Unknown',
   '[data gap] Unknown',
   '[data gap] Unknown',
   'Added to watch list May 2026 per Lex validation report. Research required before threat tier assignment.',
   'Domonic LEARNING_LOG (May 2026)',
   NULL,
   'low', '2026-05-01'),

  ('cotutor', 'MagicSchool AI', 'watch', 'watch',
   'AI teacher productivity platform',
   '[data gap] Research required — primarily teacher-facing; student-facing capabilities and institutional traction not yet confirmed',
   'Guardrail-managed student-facing AI with institutional governance and TrustEd behavioral linkage',
   'Pending research validation.',
   '[data gap] Research required — threat tier cannot be assigned. Note: teacher-productivity focus may mean limited direct overlap with CoTutor student-facing guardrail model.',
   '[data gap] Likely: AI-assisted instruction, teacher workflow tools',
   '[data gap] Unknown',
   '[data gap] Unknown',
   '[data gap] Unknown',
   'Added to watch list May 2026 per Lex validation report. Research required before threat tier assignment.',
   'Domonic LEARNING_LOG (May 2026)',
   NULL,
   'low', '2026-05-01'),

  ('cotutor', 'Brisk Teaching', 'watch', 'watch',
   'AI teacher assistant',
   '[data gap] Integration depth and institutional traction unconfirmed',
   'Guardrail-managed course-aware AI tutoring with institutional governance',
   'Pending research validation.',
   '[data gap] Research required before tier assignment.',
   '[data gap] Likely: AI-assisted feedback, teacher workflow',
   '[data gap] Unknown',
   '[data gap] Unknown',
   '[data gap] Unknown',
   'Added to watch list May 2026 per Lex validation report. Research required before threat tier assignment.',
   'Domonic LEARNING_LOG (May 2026)',
   NULL,
   'low', '2026-05-01'),

  ('cotutor', 'Instructure IgniteAI', 'watch', 'watch',
   'Native LMS AI layer (Canvas)',
   'Native Canvas integration — no additional procurement required; structural distribution advantage within Canvas installed base; no separate buying decision needed',
   'CoTutor provides guardrail-managed AI tutoring with TrustEd behavioral linkage and cross-tool support beyond Canvas',
   'Pending research validation.',
   '[data gap] Research required, but native Canvas positioning is a structural procurement threat — if IgniteAI provides assignment-level AI assistance natively, the CoTutor value proposition must be clearly differentiated as governance-depth and multi-tool (Word, VS, Google Docs), not just LMS AI.',
   '[data gap] Likely: LMS-embedded AI assistance, student support',
   '[data gap] Unknown — likely Canvas-bundled',
   'Canvas-native',
   '[data gap] Unknown',
   'Added to watch list May 2026 per Lex validation report. Native Canvas positioning makes this a structural distribution threat. Research required before tier assignment.',
   'Domonic LEARNING_LOG (May 2026)',
   'Monitor Canvas product roadmap for AI feature depth — any assignment-level guardrail capability would trigger Tier 1 escalation review.',
   'low', '2026-05-01'),

  ('cotutor', 'Microsoft Copilot for Education', 'watch', 'watch',
   'Institutional AI platform',
   'Microsoft 365 installed base; institutional licensing leverage; broad distribution via existing M365 Education agreements',
   'Course-aware guardrail AI with faculty-defined parameters per assignment and TrustEd behavioral linkage — Copilot for Education is general-purpose AI without assignment-level faculty governance',
   'Pending research validation.',
   '[data gap] Research required, but Microsoft 365 installed base is a distribution threat similar to Google Workspace. Institutions already paying for M365 may evaluate Copilot for Education before CoTutor. Key question: does Copilot for Education support assignment-level faculty guardrails?',
   '[data gap] Likely: AI writing assistance, institutional AI access',
   '[data gap] Unknown',
   'Microsoft 365 ecosystem; LMS adjacency via Teams',
   '[data gap] Unknown',
   'Added to watch list May 2026 per Lex validation report. Microsoft 365 institutional footprint makes this a distribution threat. Research required.',
   'Domonic LEARNING_LOG (May 2026)',
   'Monitor Microsoft EDU Copilot feature announcements in Fall 2026 for LMS integration depth.',
   'low', '2026-05-01'),

  -- ================================================================
  -- TRUSTED
  -- ================================================================

  ('trusted', 'Turnitin Originality', 'tier-1', 'stable',
   'Institutional plagiarism and AI detection',
   'Market leader deeply embedded in university workflows; vast submission database; EU Frankfurt data residency option; distribution advantage via Feedback Studio contract bundling; recognized institutional brand for academic integrity',
   'TrustEd is process-based, not detector-dependent: playback, AI interaction trace, behavioral evidence, copy/paste classification, writing speed analysis — lower false-positive exposure and harder to game than text-similarity scoring',
   'Turnitin detects outputs; TrustEd reconstructs the entire content creation process to provide behavioral evidence, not just a similarity score.',
   'Turnitin''s installed-base + Feedback Studio bundling = displacement threat via distribution advantage, not feature competition. The risk is not that Turnitin is better — it is that institutions already under contract see Turnitin as "good enough" without evaluating process forensics as a separate category.',
   'Academic integrity, AI-writing detection flags, plagiarism similarity scoring, submission database comparison',
   'Custom / institutional quote (bundled in Turnitin contract)',
   'LMS-embedded via Turnitin ecosystem; LTI',
   'Institutional data governance; EU Frankfurt residency option',
   'Internal Apporto materials position TrustEd as behavioral/process analysis vs. Turnitin output detection. Turnitin Clarity shows Turnitin moving toward process visibility — escalation watch active.',
   'competitive_matrix_master.csv (May 2026); product_trusted.csv; Domonic LEARNING_LOG',
   'Q3 2026 critical: TrustEd GA must reach production deployment before Turnitin Clarity achieves cross-platform behavioral analysis positioning. Delay surrenders the forensics frame.',
   'high', '2026-05-01'),

  ('trusted', 'Turnitin Clarity', 'tier-1', 'escalated',
   'Process-visible writing workspace / integrity adjacency',
   'Turnitin brand and installed base; institutional buyers already under contract; now directly includes playback, writing process visibility, AI activity review, and flagged review points — moving into TrustEd territory on process evidence',
   'TrustEd analyzes process across all tools and workflows students use, not just a single managed writing workspace; covers copy/paste, AI interaction, time-on-task, cohort baseline behavior, and writing style consistency across the full creation story',
   'Turnitin Clarity makes process visible inside one workspace; TrustEd captures the full creation story regardless of which tool the student used.',
   'This is the highest-urgency TrustEd competitive threat. Turnitin Clarity is absorbing the process-evidence narrative that TrustEd needs to own. Institutions renewing Turnitin contracts get Clarity as a low-friction add-on — they will not evaluate TrustEd separately unless TrustEd owns a clearly differentiated category frame (cross-platform forensic reconstruction vs. single workspace visibility).',
   'Process transparency, writing-stage visibility, responsible AI workflow, playback, AI activity review, flagged submission review',
   'Paid add-on to Turnitin Feedback Studio',
   'LTI 1.3 (recommended); Turnitin ecosystem',
   'Turnitin institutional data governance',
   'ESCALATED to highest Tier 1 priority May 2026. Now directly includes playback and AI activity review. Moving toward TrustEd territory. Window to own behavioral reconstruction as a category is open but not permanent.',
   'competitive_matrix_master.csv (May 2026); product_trusted.csv; Domonic LEARNING_LOG; TrustEd vs. Turnitin Clarity.txt (June 2026)',
   'Q3 2026 critical: TrustEd GA + cross-platform forensic reconstruction frame must be established before Clarity adoption solidifies at Turnitin installed-base accounts. This is the most time-sensitive window across the entire competitive landscape.',
   'high', '2026-05-01'),

  ('trusted', 'Copyleaks', 'tier-1', 'stable',
   'AI and plagiarism detection',
   'Strong LMS coverage across 7 platforms; explicit education packaging with FTE pricing; multilingual detection capability; EU data center available; FERPA-aligned education packaging',
   'TrustEd focuses on how content was created — playback, baseline comparison, AI conversation visibility, and behavioral evidence chain — instead of binary output accusation, reducing false positives and providing defensible institutional review',
   'Copyleaks flags AI-generated output; TrustEd shows the process behind the output, reducing false positives and providing defensible evidence.',
   'Copyleaks'' broad LMS coverage removes the integration friction argument against it. The differentiation must be on the evidence model: detection-based (Copyleaks) vs. process forensics (TrustEd). Procurement risk is that detection is simpler to explain and buy.',
   'AI detection, plagiarism detection, institution analytics, multilingual detection, batch scans',
   'Education pricing custom by FTE; personal $13.99/month; pro $74.99/month (annual)',
   'Canvas, Moodle, D2L Brightspace, Schoology, Sakai, Edsby, Blackboard',
   'EU data center available; FERPA-aligned education packaging',
   'Copyleaks official pricing page confirms education packaging and LMS coverage.',
   'competitive_matrix_master.csv (May 2026); product_trusted.csv',
   NULL,
   'high', '2026-05-01'),

  ('trusted', 'GPTZero', 'tier-2', 'stable',
   'Standalone AI detector',
   'Strong brand visibility in AI detection category; simple educator workflow; educator-facing SaaS with batch scanning; some classroom tooling; growing institutional messaging',
   'TrustEd avoids detector-only weakness by using writing process, playback, cohort/baseline behavior, and integrated review workflow — makes TrustEd evidence harder to game and easier to defend in formal academic integrity proceedings',
   'GPTZero scores the output; TrustEd analyzes the creation process, making it harder to game and easier to defend in academic integrity proceedings.',
   'Detection-only tools are adversarially bypassable — students can learn to defeat them. The differentiation argument against GPTZero is that process forensics captures what was done, not just what was submitted. Risk is that GPTZero is simpler to trial and evaluate without IT involvement.',
   'AI-generated text detection, batch scans, educator workflow, output scoring',
   'Published tiers ~$8.33-$24.99/month',
   'Limited; mostly standalone SaaS; some classroom tooling',
   'No strong institutional FERPA positioning documented',
   'Updated May 2026. More educator workflows added. Stronger AI transparency framing. Keep Tier 2 — differentiation holds on process-forensic vs. detector-centric positioning.',
   'competitive_matrix_master.csv (May 2026); product_trusted.csv',
   NULL,
   'high', '2026-05-01'),

  ('trusted', 'Packback', 'tier-2', 'stable',
   'Instructional AI with originality signals',
   'Packback markets originality fingerprint and AI risk detection alongside strong faculty trust and institutional analytics; expanding originality and risk analysis positioning in 2026; stronger educational process language emerging',
   'TrustEd is purpose-built for forensic process analysis across all submission types — playback, copy/paste flags, AI conversation trace, behavioral review, integrated grading context; Packback''s originality is scoped to discussion platform activity',
   'Packback adds originality signals to its discussion platform; TrustEd is purpose-built for forensic process analysis across all submission types.',
   'Packback''s originality fingerprint creates overlap at the "where did this content come from" question, but only within its own discussion ecosystem. The risk is in institutions that use Packback heavily — they may view Packback''s originality features as sufficient for their integrity needs without evaluating TrustEd''s broader cross-tool forensics.',
   'Originality fingerprint, AI risk detection, pedagogical support, discussion analytics',
   'Custom / institution or student-paid by community',
   'LTI-linked institutional platform; Canvas, Blackboard, D2L, Moodle',
   'FERPA-aligned institutional contract model',
   'Updated May 2026. Expanding originality and risk analysis positioning. Keep Tier 2.',
   'competitive_matrix_master.csv (May 2026); product_trusted.csv',
   NULL,
   'high', '2026-05-01'),

  -- ================================================================
  -- EXAMSPACE
  -- ================================================================

  ('examspace', 'Respondus LockDown Browser', 'tier-1', 'stable',
   'Assessment security / browser lockdown',
   'Huge installed base at thousands of institutions; simple deployment; low cost relative to full VDI ($3,295/yr for up to 2,000 FTE); confirmed LMS integrations across Canvas, Blackboard, Moodle, Brightspace, Schoology, Sakai; free pilot available; deeply entrenched in existing exam workflows',
   'ExamSpace controls the full virtual desktop environment, not just the browser tab; admins define allowed applications, files, network access, and AI tool policies; no per-device installation required; single cloud deployment eliminates version management and per-device support tickets',
   'LockDown Browser secures one browser tab; ExamSpace gives admins a fully configurable virtual desktop where allowed applications and resources are institution-defined.',
   'Respondus LDB is entrenched via years of installed-base adoption and low perceived switching cost. The differentiation argument must be made at the exam design level: browser lockdown cannot support assessments that require approved software, coding environments, or controlled AI tool access. ExamSpace wins where the exam requires more than a locked browser.',
   'Secure testing, LMS integration, browser-level exam lockdown, student compliance monitoring',
   'Campus license from $3,295 for up to 2,000 FTE; scales by FTE',
   'Blackboard, Brightspace, Canvas, Moodle, Schoology, Sakai',
   'FERPA-compliant; institutional license model',
   'Updated May 2026. LMS integrations confirmed accurate. Keep Tier 1. Differentiation valid: Respondus locks browser, ExamSpace controls full desktop and applications.',
   'competitive_matrix_master.csv (May 2026); product_examspace.csv; Knowledge/Products/ExamSpace/RespondusLockDownBrowser_positioning.md',
   NULL,
   'high', '2026-05-01'),

  ('examspace', 'Respondus Monitor', 'tier-1', 'stable',
   'Automated webcam proctoring',
   'Webcam-based monitoring with strong installed base; no per-exam fees on seat license; tiered pricing confirmed ($4,950-$5,950 for 1,000 seats); companion to LockDown Browser with same LMS integrations; familiar procurement through existing Respondus relationships',
   'ExamSpace focuses on institution-defined desktop environment and allowed applications, producing objective session-level behavioral records tied to verified exam rules — TrustEd can extend process evidence beyond the exam session; ExamSpace does not rely on webcam surveillance for enforcement',
   'Respondus Monitor watches the student; ExamSpace controls what the student can access, combining environment lockdown with configurable application access.',
   'Respondus Monitor''s bundling with LockDown Browser means institutions that already have LDB may get Monitor at a perceived low incremental cost. The differentiation must be on the model: ExamSpace prevents exam integrity violations at the infrastructure level rather than detecting them after the fact via webcam flags.',
   'Remote proctoring, behavioral flags, webcam-based monitoring, exam session review, ID verification',
   'Base $4,950 or $5,950 for 1,000 seats; $1,950 per additional 1,000; or $15/student/year',
   'Companion to LockDown Browser; same LMS integrations: Blackboard, Brightspace, Canvas, Moodle, Schoology, Sakai',
   'FERPA-compliant; institutional license',
   'Updated May 2026. Webcam-based remote monitoring and pricing confirmed. Keep Tier 1. ExamSpace stronger on managed desktop control, app-level control, and institutional lab environment definition.',
   'competitive_matrix_master.csv (May 2026); product_examspace.csv; Knowledge/Products/ExamSpace/RespondusMonitor_positioning.md',
   NULL,
   'high', '2026-05-01'),

  ('examspace', 'ExamSoft / Examplify', 'tier-1', 'escalated',
   'Secure exam platform',
   'High-stakes exam reputation; extensive feature set; offline-friendly exam workflows (critical for law, medical, and certification markets); deep institutional penetration in professional credentialing; assessment ecosystem maturity and institutional trust; per-device installation accepted as standard by its customer base',
   'ExamSpace is zero-install via cloud virtual desktop with real-time admin configuration; institution-defined virtual desktop and allowed apps updated centrally; strong fit for lab, coding, and tool-enabled assessments where ExamSoft''s offline model cannot accommodate approved software access',
   'ExamSoft requires installation and is built for high-stakes offline exams; ExamSpace is zero-install and lets admins configure the virtual desktop in real time.',
   'ExamSoft is the most dangerous long-term ExamSpace competitor because it owns institutional exam infrastructure in high-stakes markets (law bar exams, medical licensing, professional certification), not just browser lockdown. Once ExamSoft is deployed for high-stakes assessments, displacement requires proving VDI equivalence for offline scenarios and demonstrating IT simplicity vs. per-device installation overhead.',
   'Secure exam delivery, exam lockdown, offline-friendly assessment workflows, application control, high-stakes exam delivery',
   'Institution-configured; not publicly standardized; institution-paid or student-paid',
   'App-based secure exam environment; institution-configured; not LMS-native by default',
   'Institution-configured; FERPA-compliant',
   'ESCALATED to highest Tier 1 priority May 2026. Largest strategic ExamSpace competitor long-term. More dangerous than Respondus because it owns institutional exam infrastructure in high-stakes markets.',
   'competitive_matrix_master.csv (May 2026); product_examspace.csv',
   'Monitor ExamSoft cloud/VDI roadmap — any cloud exam delivery announcement would significantly increase the competitive threat level.',
   'high', '2026-05-01'),

  ('examspace', 'Honorlock', 'tier-1', 'stable',
   'Remote proctoring',
   'Easy LMS rollout; strong live-agent and AI proctoring story; exam reports delivered within LMS; confirmed LMS coverage: Canvas, Blackboard, Moodle, D2L Brightspace, Open LMS, Intellum, Docebo (LTI 1.3); quick institutional deployment',
   'ExamSpace focuses on the managed virtual desktop and allowed-application control, establishing the exam environment before the first question loads — Honorlock monitors student behavior during an exam that begins in an uncontrolled environment',
   'Honorlock watches what students do during an exam; ExamSpace defines what environment students are in before the first question loads.',
   'Honorlock competes on proctoring convenience and LMS coverage breadth. The ExamSpace differentiation must be at the environment-control level: ExamSpace prevents unauthorized access by controlling the entire desktop, not by surveilling what students do inside an uncontrolled one.',
   'Online exam proctoring, live AI proctoring, session viewer, reports, ID verification, LMS-embedded reporting',
   'Quote-based',
   'Canvas, Blackboard, Moodle, D2L Brightspace, Open LMS, Intellum, Docebo (LTI 1.3)',
   'FERPA-aligned; institutional contract',
   'Honorlock official integration pages confirm LMS coverage and rapid deployment.',
   'competitive_matrix_master.csv (May 2026); product_examspace.csv',
   NULL,
   'high', '2026-05-01'),

  ('examspace', 'Proctorio', 'tier-1', 'stable',
   'Remote proctoring / browser extension',
   'Strong remote scale at large institutions; LMS/API flexibility; 24/7/365 failover claims; confirmed LMS support: Canvas, Blackboard, Brightspace, Moodle, ILIAS (LTI/API); automated behavioral analysis',
   'ExamSpace gives a school-defined virtual desktop and application control; exam environment is controlled at the infrastructure level before assessment begins — better fit where faculty/admins need to define the full workstation, not just monitor behavioral flags',
   'Proctorio monitors exam behavior remotely at scale; ExamSpace controls the entire desktop environment so behavior monitoring begins with a controlled starting point.',
   'Proctorio''s scale and LMS API flexibility are genuine strengths. The ExamSpace argument must be at the model level: monitoring behavior inside an uncontrolled environment is fundamentally weaker than controlling the environment entirely. ExamSpace wins when institutions prioritize prevention over detection.',
   'Automated proctoring, scalable remote monitoring, behavioral analysis, 24/7 failover, LMS/API integration',
   'Quote-based',
   'Canvas, Blackboard, Brightspace, Moodle, ILIAS; LTI/API',
   'FERPA-aligned; institutional contract',
   'Proctorio official integration pages confirm LMS/API model and scalability claims.',
   'competitive_matrix_master.csv (May 2026); product_examspace.csv',
   NULL,
   'high', '2026-05-01'),

  ('examspace', 'Safe Exam Browser (SEB)', 'tier-2', 'stable',
   'Open-source secure browser',
   'Zero licensing cost (MPL open source); broad LMS support via plugins; active open-source community; SEB Server for centralized management; wide academic institution adoption as low-cost option',
   'ExamSpace requires no student-side installation and delivers an institution-configured virtual desktop with real-time admin control and centralized policy management; SEB requires per-device installation and manages only the browser layer without infrastructure-level environment control',
   'Safe Exam Browser is free and widely supported; ExamSpace adds a fully managed virtual desktop with no student-side installation and real-time admin control.',
   'SEB''s free licensing removes cost as a differentiation factor — institutions will compare ExamSpace''s VDI value against $0 for browser kiosk. The differentiation must be entirely on exam design capability: SEB cannot support assessments that require approved software, coding environments, or tool-enabled exam scenarios.',
   'Secure browser kiosk mode, LMS support via plugins, admin policy configuration',
   'Free / open source (MPL)',
   'Moodle, Canvas, and others via LMS plugins; SEB Server',
   'Open source; compliance depends on institution configuration',
   'SEB open-source MPL licensing and active maintenance confirmed. Keep Tier 2.',
   'competitive_matrix_master.csv (May 2026); product_examspace.csv',
   NULL,
   'high', '2026-05-01'),

  ('examspace', 'Schoolyear Safe Exam Workspace', 'tier-1', 'new',
   'Secure exam environment (AVD-based infrastructure)',
   'AVD-based architecture provides genuine infrastructure-level security, not browser-only lockdown; positions as modern cloud-native alternative to legacy exam delivery tools; direct ExamSpace territory; emerging competitor with credible technical architecture',
   'ExamSpace is built on Apporto''s VDI infrastructure with institutional-grade configuration workflows, LTI 1.3 LMS launch, zero student-side installation, and real-time admin control — established platform vs. emerging competitor',
   'Schoolyear Safe Exam Workspace delivers AVD-based exam environments; ExamSpace delivers Apporto VDI-based exam environments with institutional configuration workflows and established LMS integrations.',
   'Schoolyear Safe Exam Workspace enters the same virtual desktop exam delivery category as ExamSpace — this is a direct infrastructure-level competitor, not a browser lockdown or proctoring play. The threat is that Schoolyear may compete on AVD architecture credibility at accounts where Microsoft Azure relationships already exist.',
   'AVD-based secure exam delivery, exam environment control at infrastructure level',
   '[data gap] Pricing not confirmed',
   '[data gap] LMS integration depth not confirmed',
   '[data gap] Compliance posture not confirmed',
   'NEW June 2026. Tier 1 escalation. Full competitive brief at: i:\My Drive\Apporto\Input\Competitive\COMPETITIVE BRIEF - Schoolyear Safe.txt. Research required for pricing and LMS integration depth.',
   'COMPETITIVE BRIEF - Schoolyear Safe.txt (June 2, 2026)',
   'Complete pricing and LMS integration research. Identify whether Schoolyear is targeting ExamSpace''s existing customer base or greenfield accounts.',
   'medium', '2026-06-02')

) AS v(
  product_slug, competitor_name, threat_tier, escalation_status, category,
  competitor_strength, apporto_edge,
  sales_positioning_line,
  threat_rationale, key_overlap,
  pricing_intel, lms_coverage, ferpa_positioning,
  latest_notes, evidence_source,
  strategic_window,
  confidence, freshness_date
)
JOIN products p ON p.slug = v.product_slug
JOIN competitors c ON c.name = v.competitor_name
ON CONFLICT (product_id, competitor_id) DO NOTHING;
