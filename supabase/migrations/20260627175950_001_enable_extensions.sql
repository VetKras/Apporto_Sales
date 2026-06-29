
/*
# Enable required extensions

1. pgcrypto — gen_random_uuid()
2. vector — 1536-dimension embeddings for knowledge_chunks semantic retrieval
*/
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS vector;
