-- 账号的笔记：一篇论文一段 Markdown 文本，只有本人能看到。
CREATE TABLE IF NOT EXISTS account_notes (
  account_id text NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  article_id text NOT NULL,
  body text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, article_id)
)
