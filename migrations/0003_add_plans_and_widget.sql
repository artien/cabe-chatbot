-- Migration number: 0003 	 2026-09-06T13:30:00.000Z
ALTER TABLE users ADD COLUMN plan TEXT NOT NULL DEFAULT 'free';
ALTER TABLE users ADD COLUMN widget_key TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_widget_key ON users(widget_key);

ALTER TABLE documents ADD COLUMN doc_id TEXT;
CREATE INDEX IF NOT EXISTS idx_documents_doc_id ON documents(doc_id);

CREATE TABLE IF NOT EXISTS daily_chat_usage (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  usage_date TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, usage_date)
);

CREATE INDEX IF NOT EXISTS idx_daily_chat_usage_user_date ON daily_chat_usage(user_id, usage_date);
