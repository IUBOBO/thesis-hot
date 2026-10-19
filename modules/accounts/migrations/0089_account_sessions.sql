-- 登录会话：只存 token 的哈希，30 天后过期；账号删除时一起删。
CREATE TABLE IF NOT EXISTS account_sessions (
  token_hash text PRIMARY KEY,
  account_id text NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
)
