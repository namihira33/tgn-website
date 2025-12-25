-- TGN Posts Database Schema

CREATE TABLE IF NOT EXISTS posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'info',
  image_url TEXT,
  published_at DATE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- カテゴリのインデックス
CREATE INDEX IF NOT EXISTS idx_posts_category ON posts(category);

-- 日付のインデックス（新しい順で取得するため）
CREATE INDEX IF NOT EXISTS idx_posts_created_at ON posts(created_at DESC);

-- 公開日のインデックス
CREATE INDEX IF NOT EXISTS idx_posts_published_at ON posts(published_at DESC);

-- 既存のテーブルに published_at カラムを追加（ALTER文はD1コンソールで実行）
-- ALTER TABLE posts ADD COLUMN published_at DATE;

-- ========================================
-- Qちゃんチャット履歴テーブル
-- ========================================

-- チャットセッション
CREATE TABLE IF NOT EXISTS chat_sessions (
  id TEXT PRIMARY KEY,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  user_agent TEXT,
  ip_hash TEXT
);

-- チャットメッセージ
CREATE TABLE IF NOT EXISTS chat_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  sources TEXT,  -- JSON array of source links
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (session_id) REFERENCES chat_sessions(id) ON DELETE CASCADE
);

-- インデックス
CREATE INDEX IF NOT EXISTS idx_chat_messages_session ON chat_messages(session_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_created ON chat_messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_created ON chat_sessions(created_at DESC);
