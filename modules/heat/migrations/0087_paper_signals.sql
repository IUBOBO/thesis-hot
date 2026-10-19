-- 论文的每日信号：引用、讨论、代码按天各存一行，热度从涨落算。
-- 现在只采引用（OpenAlex）；讨论数由站内报道同一事件的信源数算出，不存这里。代码还没有公开来源，列先留着。
CREATE TABLE IF NOT EXISTS paper_signals (
  article_id text NOT NULL REFERENCES articles (id) ON DELETE CASCADE,
  day date NOT NULL,
  cites integer NOT NULL,
  discussions integer,
  stars integer,
  captured_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (article_id, day)
)
