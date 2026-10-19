-- 收藏的自定义标签，最多几个短词。
ALTER TABLE account_stars ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}'
