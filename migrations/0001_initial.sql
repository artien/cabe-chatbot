-- Migration number: 0001 	 2026-09-05T13:55:00.000Z
CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY,
  text_content TEXT NOT NULL,
  source_url TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_documents_source_url ON documents(source_url);
CREATE INDEX IF NOT EXISTS idx_documents_created_at ON documents(created_at);
