-- 保存的搜索：账号下的一条检索条件，带一个不可猜的 feed token 供 RSS 订阅。
CREATE TABLE IF NOT EXISTS account_searches (
  id text PRIMARY KEY,
  account_id text NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  name text NOT NULL,
  query text NOT NULL DEFAULT '',
  filters jsonb NOT NULL DEFAULT '{}'::jsonb,
  feed_token text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
)
