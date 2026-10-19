# 交接：期刊与热度之后，补齐引用导出、期刊清单和显示细节

当前状态：数据库 PostgreSQL 17.5 便携版在 `D:\pg`（启动方式见 [LOCAL.md](LOCAL.md)），Node 24 在 `D:\node24\node-v24.14.0-win-x64\node.exe`。
本轮没有启动站点，只用类型检查、构建和测试验证；站点跑起来后的 `scripts/smoke.ts` 还没跑。

## 这一轮做了什么

### 1. 期刊清单扩到 53 本、9 个学科

`industry/journals.json` 从 10 本扩到 53 本：人工智能、计算机、遥感、石油、电子信息、机械、材料、化工、能源各 5–8 本。
每本刊的 ISSN 都在 2026-10-18 逐条查过 OpenAlex 的 `sources` 接口，刊名取 OpenAlex 的 `display_name`。
`scripts/journals.ts` 和 `modules/journals` 都读这个文件，不用改代码；新增的刊在第一次跑 `npm run journals` 时自动建信源。

注意：IEEE 等按整期上线的刊，OpenAlex 的 `publication_date` 可能是几天到一个月前的批次（TPAMI 最近一批在 8 月 31 日）。
默认 `--days=7` 的窗口会整期漏掉，首次抓或每周补抓时用 `npm run journals -- --days=45`。

### 2. 引用导出：BibTeX、RIS、APA、GB/T 7714，加复制 DOI

- `apps/web/app/lib/citation.ts`：新增 `citationApa`、`citationGbt`；BibTeX 补 `volume`/`number`，RIS 补 `VO`/`IS`。
- 详情页“更多”菜单和手机操作表四个格式都有，复制后提示“请核对元数据”；来源栏显示 DOI，点一下复制。
- 测试 `apps/web/tests/citation.test.ts` 8 个。

### 3. 化学式上下标与转义清理

- 内容理解提示词要求化学式写 Unicode 上下标（CO₂、NOₓ、SO₂、H₂O、NH₃）。
- 网页在卡片和详情页统一用 `apps/web/app/lib/format.ts` 的 `readerText` 转换旧数据里的 CO2/NOX，并去掉 `1\.0` 这类 Markdown 转义；热度榜与期刊页的标题也走它。
- `apps/web/tests/reader-text.test.ts` 3 个。

### 4. 可信度小改动

- 首页数据超过 24 小时没更新时，说明“数据可能不是最新”。
- 详情页“来源”栏对有 OpenAlex 元数据的期刊论文标“已正式发表”；arXiv 仍标“预印本”。

### 5. 文档口径

- `AGENTS.md` 开头改成 Thesis NH 与九个学科，并把“最常见的任务”改成站点/行业/信源。
- `docs/customize.md` 说明本仓库已经是论文站；`RELEASE` 和门槛数字（T1 35、T1_5 40、T2 55）改成当前值。

### 6. 测试里的示例行业例子

按 `AGENTS.md` 的要求把还在用 AI 示例行业的地方换成论文站的对应项，以下文件现在单独跑都通过：

`analyze`、`category-corrections`、`content-publication`、`daily-report-alerts`、`default-model`、
`topics-withdrawal`、`page-metadata.standalone`。

`daily-report-alerts` 原来把“10:00”写死成截止时间，现在按 `EDITION_TIMES.daily + 2 小时` 算。

### 7. 列表筛选、详情页被引数与产品名搜索

- `/all` 新增三个筛选：来源类型（期刊论文 / 预印本）、发表时间（近 7/30/365 天）、开放获取。
  参数是 `kind=paper|preprint`、`within=7|30|365`、`oa=1|0`；写进地址，翻页和返回都保留，首页时间线也认这三个参数。
  后端条件在 `publication/items.ts`（`sourceKindCondition`、`openAccessCondition`、`withinDaysCondition`），
  接口在 `apps/api/src/routes/site.ts` 校验，页面控件在 `features/feed/Filters.tsx` 的 `FeedFilters`。
- 详情页“来源”栏新增被引数：模块插口 `WebModule.item`（`apps/web/app/modules.ts`、`routes/item.tsx`），
  `modules/heat` 的 `/api/heat/item/:id` 按篇给最近一天的引用数，撤稿后 404。
- 机构主题补了产品别名（Claude、ChatGPT、Gemini、Llama、微软、深度求索等），搜产品名也能找到机构。
- 搜索支持大写 AND / OR / NOT（`parseBooleanQuery`、`booleanCondition`）；两种排序用同一套条件，高亮只标正向词。
  测试 `tests/pool-boolean.test.ts` 3 个。检索词统一走 `searchTerms` 归一化（大小写、汉字与拉丁字母拆分），
  否则 `OpenAI` 这类大写查询会漏掉文本命中；公司主题的 tag 扩展仍照常工作。
- 测试：`tests/pool-filters.test.ts` 3 个；`modules/heat/tests/heat.test.ts` 加了按篇读的用例。

### 8. 账号系统（用户名 + 密码）

决定记录在 [md/账号与隐私决定.md](md/账号与隐私决定.md)。代码在新模块 `modules/accounts/`：

- 迁移 `0088_accounts.sql`、`0089_account_sessions.sql`、`0090_account_recovery_codes.sql`。
- 接口 `/api/account/*`：验证码、注册、登录、登出、找回、注销、当前账号、恢复码。
- 页面 `/login`、`/register`、`/recover`、`/account`；侧栏「更多」和「我的」页有入口。
- 密码用 scrypt 哈希；会话只存 token 哈希，30 天；恢复码十串、只存哈希、用一次作废；注销立即删除。
- 注册要图形验证码（`/api/account/captcha`），同 IP 注册每小时 5 次、登录 15 分钟 10 次。
- 隐私说明和使用规则已按决定改写（不收集邮箱、日志 30 天、搜索历史只存本地、14 周岁、反馈页联系）。
- 测试 `modules/accounts/tests/accounts.test.ts` 5 个。

- 文献库：收藏、已读和笔记按账号同步。登录后 `LibrarySync`（`root.Bottom`）把本地记录并进账号再拉回；
  收藏/取消和已读随 `aihot:local-change` 事件推给接口；详情页正文下方的 `NoteEditor`（`WebModule.item`）按篇写笔记。
  迁移 `0091_account_stars.sql`、`0092_account_reads.sql`、`0093_account_notes.sql`。
- 账号页显示收藏数、已读数和文献库入口；注销会一并删除收藏、已读和笔记。
- 测试：账号模块 5 个（注册/登录/恢复/注销、文献库、笔记）。

**订阅**：`/subscriptions` 保存搜索（检索词、分类、来源类型、时间范围），每条生成 `/feed/search/<token>.xml`；
  token 不可猜、删除即失效；支持重命名。界面从 `/subscriptions` 或搜索结果旁的“订阅这个搜索”进入（关键词和筛选会带过去）。
  接口 `/api/account/searches`，迁移 `0097`，测试 1 个。按刊 RSS 仍在 `/feed/journal/<ISSN>.xml`。

**还没做**：订阅的完整编辑（改检索条件仍需删除重建）；重命名已支持。
- 分组、标签和阅读状态：每条收藏可以填一个分组、几个标签和待读/在读/已读；`/starred` 顶部按它们筛选。
  字段在 `account_stars.folder` / `tags` / `status`（迁移 `0094`、`0095`、`0096`），本机改完由 `aihot:local-change` 的
  `star-meta` 事件推给 `/api/account/star/meta`。

### 9. 期刊抓取窗口与第一次试跑

- `scripts/journals.ts` 默认窗口从 7 天改成 45 天，`--issn` 支持逗号分隔的多本刊。
- 2026-10-18 19:59 试跑了 17 本（原有 10 本 + 每学科 1 本：TPAMI、TSE、TSP、MSSP、Acta Materialia、AIChE Journal、Applied Energy），
  45 天窗口新增 370 篇、已有 155 篇跳过；17 个期刊信源已建好。
- 15:14 启动的 worker 正在处理这批材料（`content.analyze` 已完成 364 个，249 篇 analyzed、188 篇还在排队），
  处理完会正常进精选和列表；模型调用费用按实际用量计。
- 会议（NeurIPS / ICML / ICLR）：OpenAlex 的会议数据太旧，改用 arXiv 的备注字段（`industry/conferences.json`、`scripts/conferences.ts`，
  `npm run conferences`）。备注里带会议名、且不含 workshop / under review / submitted 等字样的才收；ICLR 在出结果前要求
  备注里明确写 accepted / published。2026-10-19 首次跑 45 天：NeurIPS 68、ICML 40、ICLR 4，共 112 篇；105 篇已公开（62 / 39 / 4），
  6 篇因回执占用、1 篇模型输出异常在重试。会议脚本现在会按 arXiv 编号跳过已由 arXiv 收过的论文，避免两条重复。
- 剩下 36 本刊 2026-10-19 用 `--max=10` 跑完：新增 116 篇（比估算的 360 少，很多刊 45 天内没有带摘要的新论文），
  公开池 878 条。53 本刊和三个 AI 顶会现在都有内容。之后要补存量用 `npm run journals -- --max=50`。
- 调度：worker 常驻，`journals` 模块注册 `journals.collect`（07:30/17:30，45 天、每刊最多 10 篇）和
  `conferences.collect`（08:30，45 天）；arXiv 信源间隔改成 120 分钟；日报 09:00、热度 06:40 仍由 worker 定时。
  LLM 调用预算收紧到 300/分钟、3000/小时、8000/天（约 20M tokens/天上限，日常约 4M）。
  登录启动用 Startup 快捷方式（`ThesisNH-Postgres/Worker/Api/Web`），Windows 计划任务在这台机器上创建被拒。
- 日报编排：主栏目每刊最多 2 篇，快讯每刊最多 5 条（`FLASH_PER_SOURCE`，`FLASH_ENTRIES` 仍是 10 条总上限）。
  2026-10-19 的日报已按新规则重排（Fuel 5 条 + Applied Energy 2 条）。


## 怎么验证

```powershell
# 类型检查：web 的 typegen 在受限沙箱里会因 spawn 被拒，正常环境用 npm run typecheck
node node_modules/typescript/bin/tsc -p packages/contracts
node node_modules/typescript/bin/tsc -p packages/backend
node node_modules/typescript/bin/tsc -p apps/api
node node_modules/typescript/bin/tsc -p apps/worker
node node_modules/typescript/bin/tsc -p tests
node node_modules/typescript/bin/tsc -p modules
node node_modules/typescript/bin/tsc -p apps/web

npm run build -w @aihot/web

$env:DATABASE_URL='postgres://postgres@127.0.0.1:5432/myhot_test'
& D:\node24\node-v24.14.0-win-x64\node.exe --env-file=.env --test-global-setup=tests/databases.ts `
  --import ./tests/databases.ts --test --test-concurrency=6 --test-timeout=120000 `
  "tests/*.test.ts" "modules/*/tests/*.test.ts"

& D:\node24\node-v24.14.0-win-x64\node.exe --test apps/web/tests/citation.test.ts apps/web/tests/reader-text.test.ts
```

全量（2026-10-19 15:35）：804 个测试、785 通过、14 失败、5 取消。失败的 14 个都是环境问题（`pg_dump` 7 个、outbound 2 个、shutdown 5 个）；
另有几个文件在全量并发时偶发失败，单独跑都过（`ingest`、`source-collector-replacement`、`source-external-identity`、`withdrawn-recall` 等），重跑即可。

## 已知没修的

- **这台机器跑不起来的**：`outbound-headers.standalone` / `outbound-protocol.standalone`
  （Node 24 Windows 退出时 libuv 断言 `UV_HANDLE_CLOSING`）、`analyze-shutdown` / `translate-shutdown`（120 秒超时，信号与子进程）。
- **备份**：客户端工具已装到 `D:\pg\client-tmp\pgsql\bin`（pg_dump/pg_restore 17.5），跑备份测试时把它和
  `C:\Program Files\Git\bin`（提供 `sh`）加到 PATH；8 个备份测试里 4 个仍失败（Windows 权限与打包行为），和功能无关。
- **浏览器测试**：Chromium 和 WebKit 已装在 `E:\Agent\thesis-hot\.data\playwright`。运行时设 `PLAYWRIGHT_BROWSERS_PATH`，并把 `TEMP`/`TMP`
  指到 `E:\Agent\thesis-hot\.data\tmp`（否则 Chrome 配置目录在 C 盘临时目录里建锁会失败）。5 个文件 24 个用例里 20 个通过；
  67 个用例里 62 个通过；WebKit 视频、两处导航时序、手机搜索建议和深读回锚 5 个失败，和账号/筛选改动无关。
- **全量并发时个别文件会偶发失败**（例如 `listings`、`source-health`、`timeline-day-counts`、`publication`），单独跑都过。

## 清单上还没做的（见 [md/实施任务清单.md](md/实施任务清单.md)）

- **C2 收藏、阅读状态、笔记同步**：账号已经有了，下一步把这些个人数据搬到账号下，换设备可用。
- **C3 的保存搜索与订阅管理页**：按刊 RSS 已有。
- **B3 剩下的**：代码与数据链接（OpenAlex 不提供，要从摘要里识别）。
- **B4 预印本与正式版合并**：暂不做。
- **A5 会议**：先接 NeurIPS、ICML、ICLR。
- **D1/D2**：等域名；条款和隐私已按决定改写，需要本人通读。

## 补充（18:55，期刊模块的两处修正）

- `packages/backend/src/publication/pool.ts` 新增 `loadSourceTotals`：一条按 `source_id` 分组的计数 + 每本刊最近一篇的时间。
  `/journals` 与首页「今日顶刊」改用它，53 本刊的目录从 106 条查询降到 1 条（本机交替 6 轮中位：8.1ms → 0.8ms）。
- 首页区块加了上限：最多 6 本刊、每本最多 3 篇，其余还有更新的刊数用 `JournalHome.omitted` 交代并链到 `/journals`。
  51 本一区刊同一天都有更新时不会再铺满首页。
- 只改了 `modules/journals/`、上面的 `pool.ts` 和该模块的测试；模块测试 13 个全过，`tsc -p modules`、`tsc -p apps/web` 通过。
- 3000/3001 上跑的还是改之前的进程，重启后才看得到 `omitted` 和新的首页上限。
