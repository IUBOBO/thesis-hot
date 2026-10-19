-- 收藏的分组（一个自定义文件夹名；空表示未分组）。
ALTER TABLE account_stars ADD COLUMN IF NOT EXISTS folder text
