-- 账号的已读记录：只存编号和时间，换设备后列表的已读状态跟着走。
CREATE TABLE IF NOT EXISTS account_reads (
  account_id text NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  article_id text NOT NULL,
  read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, article_id)
)
