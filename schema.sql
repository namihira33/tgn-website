-- TGN Posts Database Schema

CREATE TABLE IF NOT EXISTS posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'info',
  image_url TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- カテゴリのインデックス
CREATE INDEX IF NOT EXISTS idx_posts_category ON posts(category);

-- 日付のインデックス（新しい順で取得するため）
CREATE INDEX IF NOT EXISTS idx_posts_created_at ON posts(created_at DESC);
