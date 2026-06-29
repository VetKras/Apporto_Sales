
/*
# Competitive, knowledge, and feedback tables

1. New Tables
   - `competitors` — competitor master records (Respondus, Turnitin, etc.)
   - `competitive_matrix` — per-product vs per-competitor positioning matrix with
     threat_tier, strengths, Apporto edges, and freshness tracking.
     Unique constraint on (product_id, competitor_id) prevents duplicates.
   - `knowledge_chunks` — chunked, embedded text from source_documents.
     embedding is a 1536-dimension vector for pgvector similarity search.
     Used by Portia for RAG retrieval when answering product/competitive questions.
   - `feedback_signals` — lost deal reasons, objections, customer quotes, win themes.
     Captured from uploads, transcripts, or manual entry. Drives battlecard updates.

2. Security
   - Read access for all authenticated users.
   - Insert/update allowed (feedback is added continuously by the sales team).
*/

CREATE TABLE IF NOT EXISTS competitors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  website text,
  category text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE competitors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_select_competitors" ON competitors;
CREATE POLICY "auth_select_competitors" ON competitors FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "auth_insert_competitors" ON competitors;
CREATE POLICY "auth_insert_competitors" ON competitors FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "auth_update_competitors" ON competitors;
CREATE POLICY "auth_update_competitors" ON competitors FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- competitive_matrix
CREATE TABLE IF NOT EXISTS competitive_matrix (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id text NOT NULL REFERENCES products(id),
  competitor_id uuid NOT NULL REFERENCES competitors(id),
  threat_tier text,
  category text,
  competitor_strength text,
  apporto_edge text,
  latest_notes text,
  confidence text NOT NULL DEFAULT 'medium',
  freshness_date date,
  source_document_id uuid REFERENCES source_documents(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id, competitor_id)
);

ALTER TABLE competitive_matrix ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_select_competitive_matrix" ON competitive_matrix;
CREATE POLICY "auth_select_competitive_matrix" ON competitive_matrix FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "auth_insert_competitive_matrix" ON competitive_matrix;
CREATE POLICY "auth_insert_competitive_matrix" ON competitive_matrix FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "auth_update_competitive_matrix" ON competitive_matrix;
CREATE POLICY "auth_update_competitive_matrix" ON competitive_matrix FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- knowledge_chunks
CREATE TABLE IF NOT EXISTS knowledge_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_document_id uuid NOT NULL REFERENCES source_documents(id) ON DELETE CASCADE,
  content text NOT NULL,
  embedding vector(1536),
  product_id text REFERENCES products(id),
  competitor_id uuid REFERENCES competitors(id),
  chunk_type text,
  confidence text NOT NULL DEFAULT 'medium',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE knowledge_chunks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_select_knowledge_chunks" ON knowledge_chunks;
CREATE POLICY "auth_select_knowledge_chunks" ON knowledge_chunks FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "auth_insert_knowledge_chunks" ON knowledge_chunks;
CREATE POLICY "auth_insert_knowledge_chunks" ON knowledge_chunks FOR INSERT TO authenticated WITH CHECK (true);

-- feedback_signals
CREATE TABLE IF NOT EXISTS feedback_signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id uuid REFERENCES deals(id),
  product_id text REFERENCES products(id),
  signal_type text NOT NULL,
  content text NOT NULL,
  customer_name text,
  source_document_id uuid REFERENCES source_documents(id),
  created_by text REFERENCES profiles(id),
  authority_level integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE feedback_signals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_select_feedback_signals" ON feedback_signals;
CREATE POLICY "auth_select_feedback_signals" ON feedback_signals FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "auth_insert_feedback_signals" ON feedback_signals;
CREATE POLICY "auth_insert_feedback_signals" ON feedback_signals FOR INSERT TO authenticated WITH CHECK (true);
