-- 恢复码：注册时生成十串，只存哈希；用过的记下时间，不能再用。
CREATE TABLE IF NOT EXISTS account_recovery_codes (
  account_id text NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  code_hash text NOT NULL,
  used_at timestamptz,
  PRIMARY KEY (account_id, code_hash)
)
