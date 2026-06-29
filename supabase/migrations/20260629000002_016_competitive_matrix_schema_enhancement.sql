
/*
# Schema enhancement: competitive_matrix enriched columns

Adds intelligence fields needed for full battlecard generation.
Migration 006 created the base table; this extends it without breaking existing rows.

New columns:
  - sales_positioning_line  : the one-liner counter-positioning for sales conversations
  - escalation_status       : 'escalated' | 'stable' | 'new' | 'watch' | 'monitor'
  - threat_rationale        : WHY this competitor is the stated threat tier (buying pressure, distribution, etc.)
  - key_overlap             : what this competitor directly overlaps with our product
  - pricing_intel           : competitor's public pricing model or benchmark
  - lms_coverage            : LMS platforms the competitor integrates with
  - ferpa_positioning       : competitor's stated FERPA/compliance posture
  - evidence_source         : where this intelligence was validated (source citation)
  - strategic_window        : time-sensitive intelligence (deadlines, critical windows, escalation triggers)
*/

ALTER TABLE competitive_matrix
  ADD COLUMN IF NOT EXISTS sales_positioning_line text,
  ADD COLUMN IF NOT EXISTS escalation_status      text NOT NULL DEFAULT 'stable'
                                                    CHECK (escalation_status IN ('escalated','stable','new','watch','monitor')),
  ADD COLUMN IF NOT EXISTS threat_rationale       text,
  ADD COLUMN IF NOT EXISTS key_overlap            text,
  ADD COLUMN IF NOT EXISTS pricing_intel          text,
  ADD COLUMN IF NOT EXISTS lms_coverage           text,
  ADD COLUMN IF NOT EXISTS ferpa_positioning      text,
  ADD COLUMN IF NOT EXISTS evidence_source        text,
  ADD COLUMN IF NOT EXISTS strategic_window       text;

-- Index for fast filtering by escalation status (Portia queries this for urgent flags)
CREATE INDEX IF NOT EXISTS idx_competitive_matrix_escalation
  ON competitive_matrix (escalation_status);
