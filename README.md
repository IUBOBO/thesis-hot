# Thesis NH

> **N** = New（今天有什么新论文）　**H** = Hot（最近什么在升温）

一个自己盯期刊、自己写中文精读的论文站。覆盖**人工智能、计算机、遥感、石油、电子信息、机械、材料、化工、能源**九个方向：53 本核心期刊、NeurIPS / ICML / ICLR 三个 AI 顶会，以及 arXiv 预印本。每篇新论文写成“问题 / 方法 / 结果 / 局限”的中文精读，按学科归档，另排论文热度榜。

## 它做什么

- **收**：期刊（OpenAlex）、会议（arXiv 备注）、arXiv、机构博客；RSS、网页列表、JSON 接口、X、脚本推送都能接。
- **认**：同一篇论文只算一条；预印本、正式版、会议版按论文身份归并，不靠模型猜。
- **写**：中文标题保留英文专名，摘要写成四段式，附“为什么值得读”、作者/机构/卷期/DOI/代码数据链接。
- **排**：N 轴按时间（今天 / 全部），H 轴按引用速度；日报按学科分节，快讯每刊最多 5 条。
- **读**：搜索支持 DOI/arXiv 跳转、关键词高亮、`AND / OR / NOT`；结果可保存为订阅。
- **账号**：用户名 + 密码登录，收藏、分组、标签、待读/在读/已读、笔记跨设备同步；每条订阅有独立 RSS。
- **出**：每天 09:00 日报，每周一、每月 1 日回顾。

## 站点结构

| 地址 | 内容 |
|---|---|
| `/` | 精选：顶刊新论文、最热 / 最新、时间线 |
| `/all` | 全部论文，按学科、来源、时间、获取方式筛选，支持布尔搜索 |
| `/hot/papers` | 论文热度榜（旧 `/hot` 301 到这里） |
| `/daily` `/weekly` `/monthly` | 日报、周报、月报 |
| `/journals` `/journal/:issn` | 期刊目录与单刊主页 |
| `/topics` | 学科、机构与研究方向 |
| `/starred` `/account` `/subscriptions` | 收藏、账号、订阅管理 |
| `/feed.xml` `/feed/journal/:issn.xml` `/feed/search/:token.xml` | 全站、按刊、按保存搜索的 RSS |
| `/api/v1` `/api/mcp` | 公开 API 与 MCP，匿名只读 |

## 跑起来

需要 Node.js 24 与 PostgreSQL 17：

```bash
npm ci
node scripts/init-env.ts --llm-key <你的模型 API Key>
createdb myhot
npm run db:migrate
node scripts/seed.ts
npm run dev:api      # 3001
npm run dev:worker   # 采集、分析、热度、日报
npm run dev:web      # 3000
```

打开 <http://localhost:3000>，后台在 `/admin`。域名、HTTPS、云服务器和 Docker 部署见 [部署](docs/deploy.md)；Windows 本机的数据库、开机自启和日常命令见 [LOCAL.md](LOCAL.md)。

## 采集

```bash
npm run journals -- --days=45 --max=10   # 期刊，45 天窗口，每刊最多 10 篇
npm run conferences                      # NeurIPS / ICML / ICLR（arXiv 备注）
npm run journals -- --issn=0034-4257 --dry
```

worker 常驻时按计划自动跑：

| 时间 | 内容 |
|---|---|
| 每天 07:30、17:30 | 期刊（45 天窗口、每刊最多 10 篇） |
| 每天 08:30 | 会议 |
| 每 120 分钟 | arXiv 信源 |
| 每天 06:40 | 引用数 / 热度 |
| 每天 09:00 | 日报 |

`COLLECT_ENABLED`、`MODEL_CALLS_ENABLED` 等安全阀默认关闭；`.env` 里的 `OPENALEX_MAILTO` 可进 OpenAlex 礼貌池。LLM 调用有回执和预算熔断（默认 300 次/分钟、3000 次/小时、8000 次/天）。

## 文档

- [实现进度与交接](HANDOFF.md)
- [本机运行](LOCAL.md)
- [实施任务清单](md/实施任务清单.md)
- [账号与隐私决定](md/账号与隐私决定.md)
- [部署](docs/deploy.md) · [架构](docs/architecture.md) · [改造成自己的行业](docs/customize.md)

## 技术栈

Node.js 24 · TypeScript · React Router（服务端渲染）· Fastify · PostgreSQL · pg-boss · Tailwind CSS · Docker Compose

## 许可

代码使用 [MIT 许可证](LICENSE)，基于 AIHOT 开源框架改造。论文原文版权归各期刊、会议与作者所有；本站只展示题目、摘要与链接，不转载全文。
