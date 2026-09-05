-- Migration number: 0002 	 2026-09-05T15:00:00.000Z
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  name TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
ALTER TABLE documents ADD COLUMN user_id TEXT;
CREATE INDEX IF NOT EXISTS idx_documents_user_id ON documents(user_id);
