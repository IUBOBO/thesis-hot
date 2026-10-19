-- 收藏的阅读状态：saved 待读、reading 在读、done 已读。
ALTER TABLE account_stars ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'saved'
