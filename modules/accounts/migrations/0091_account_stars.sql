-- 账号的收藏：存一份卡片快照（标题、摘要、来源），换设备也能直接列出来。
CREATE TABLE IF NOT EXISTS account_stars (
  account_id text NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  article_id text NOT NULL,
  title text NOT NULL,
  summary text,
  source_name text NOT NULL DEFAULT '',
  saved_at timestamptz NOT NULL,
  published_at timestamptz,
  score integer,
  ai_selected boolean NOT NULL DEFAULT false,
  PRIMARY KEY (account_id, article_id)
)
