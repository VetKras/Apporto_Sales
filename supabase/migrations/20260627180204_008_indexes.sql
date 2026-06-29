
/*
# Indexes for performance

1. Indexes
   All recommended indexes from the schema spec, focused on frequent query patterns:
   - profile lookups by email and authority level
   - product lookups by slug
   - pricing model lookups by version and product
   - active pricing config lookup
   - deal lookups by owner and customer name
   - quote line lookups by deal and config version
   - competitive matrix lookups
   - source document and knowledge chunk lookups
   - proposed update status queue
   - ai event type and actor queries

2. Vector Index
   IVFFlat index on knowledge_chunks.embedding for approximate nearest-neighbor
   semantic retrieval. lists=100 is appropriate for expected corpus size.
*/

CREATE INDEX IF NOT EXISTS idx_profiles_email ON profiles(email);
CREATE INDEX IF NOT EXISTS idx_profiles_authority_level ON profiles(authority_level);
CREATE INDEX IF NOT EXISTS idx_products_slug ON products(slug);
CREATE INDEX IF NOT EXISTS idx_pricing_models_config_version_id ON pricing_models(config_version_id);
CREATE INDEX IF NOT EXISTS idx_pricing_models_product_id ON pricing_models(product_id);
CREATE INDEX IF NOT EXISTS idx_pricing_config_versions_is_active ON pricing_config_versions(is_active);
CREATE INDEX IF NOT EXISTS idx_deals_owner_profile_id ON deals(owner_profile_id);
CREATE INDEX IF NOT EXISTS idx_deals_customer_name ON deals(customer_name);
CREATE INDEX IF NOT EXISTS idx_deal_inputs_deal_id ON deal_inputs(deal_id);
CREATE INDEX IF NOT EXISTS idx_quote_lines_deal_id ON quote_lines(deal_id);
CREATE INDEX IF NOT EXISTS idx_quote_lines_config_version_id ON quote_lines(config_version_id);
CREATE INDEX IF NOT EXISTS idx_quote_outputs_deal_id ON quote_outputs(deal_id);
CREATE INDEX IF NOT EXISTS idx_competitive_matrix_product_id ON competitive_matrix(product_id);
CREATE INDEX IF NOT EXISTS idx_competitive_matrix_competitor_id ON competitive_matrix(competitor_id);
CREATE INDEX IF NOT EXISTS idx_source_documents_uploader ON source_documents(uploader_profile_id);
CREATE INDEX IF NOT EXISTS idx_source_documents_authority ON source_documents(authority_level);
CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_product_id ON knowledge_chunks(product_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_competitor_id ON knowledge_chunks(competitor_id);
CREATE INDEX IF NOT EXISTS idx_proposed_updates_status ON proposed_updates(status);
CREATE INDEX IF NOT EXISTS idx_ai_events_event_type ON ai_events(event_type);
CREATE INDEX IF NOT EXISTS idx_ai_events_actor_profile_id ON ai_events(actor_profile_id);
CREATE INDEX IF NOT EXISTS idx_portia_sessions_user_profile_id ON portia_sessions(user_profile_id);
CREATE INDEX IF NOT EXISTS idx_portia_sessions_deal_id ON portia_sessions(deal_id);
CREATE INDEX IF NOT EXISTS idx_portia_messages_session_id ON portia_messages(session_id);
CREATE INDEX IF NOT EXISTS idx_product_facts_product_id ON product_facts(product_id);
CREATE INDEX IF NOT EXISTS idx_feedback_signals_deal_id ON feedback_signals(deal_id);
CREATE INDEX IF NOT EXISTS idx_feedback_signals_product_id ON feedback_signals(product_id);

-- Vector similarity index for knowledge retrieval
CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_embedding
  ON knowledge_chunks USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);
