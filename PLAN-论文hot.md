# 论文 HOT 改造方案 v2（按"新"重定位）

> v1 是按"新闻热度"设计的。你确认了：**学科是 AI/CS/遥感/石油等工科，"热"其实是"新"——盯顶刊最新一期，按月回看最近几个月。**
> 产品形态因此从"热点榜"变成"**顶刊最新目录 + 按月归档**"。这份 v2 按这个重新评估，v1 里关于热度榜、聚簇、日报的部分基本作废。

评估日期：2026-10-18。仓库：`IUBOBO/thesis-hot`（AIHOT 框架原样拷贝，1 个 commit）。

---

## 一、结论

**可行，但比 v1 的估计要多写一个模块。**

- 六种信源、三级分级：框架自带，不用开发。
- 但"顶刊最新一期"这件事，**主流出版商的原生 RSS 基本接不了**（实测见第三节）。真正能用的通道是 OpenAlex / Crossref / Semantic Scholar 这类元数据 API，而它们**没有现成的采集器**——需要一个约 200 行的小模块。
- 好消息：正因为不再做"新闻热度"，框架里最复杂的部分（热度榜、事件聚簇、日报编排）基本可以闲置，改造量反而变小了。

---

## 二、"新"意味着什么

| | 新闻站（v1 假设） | 论文站（你的定义） |
|---|---|---|
| 主排序轴 | 独立参与方数量（谁在讨论） | **发布时间**（谁最新） |
| 核心页面 | `/hot` 热点榜 | `/all` 时间线 + **月报/按月归档** + 期刊主题页 |
| "一篇"的身份 | 一件事的多个报道 | **一篇论文的多个入口** |
| 评分的作用 | 决定进不进精选 | **在一期里排序**（哪几篇最值得看） |
| 日报 | 今日要闻 | 今日新上线 / 本月最值得看 |

三个直接影响：

1. **`/hot` 热点榜基本废了**。它要求 48 小时内至少 2 个独立参与方，单篇论文永远只有 1 个（它自己）。留着不碍事，但别当成主页面。
2. **月报成了主产品**。框架自带 `/monthly`（每月 1 日 10:30），从当月日报汇编——正好是"按月看"。
3. **聚簇的价值反转了**。新闻站用它把 10 篇报道折成 1 件事；论文站用它把"arXiv / 期刊页 / 公众号解读 / X 讨论"折成 1 篇论文。

---

## 三、通道实测（这一节决定方案能不能成）

我在本机实际请求了各家接口（2026-10-18）：

| 通道 | 结果 | 能用吗 |
|---|---|---|
| **Elsevier 期刊 RSS**（ScienceDirect）<br>`rss.sciencedirect.com/publication/science/<ISSN>` | 200，80–100 条 | ❌ **没有单篇日期**（0 个 `pubDate`、0 个 `dc:date`），日期只写在 description 的正文文字里；且文章页 **403**，补不了日期 |
| **IEEE Xplore TOC RSS**<br>`ieeexplore.ieee.org/rss/TOC36.XML` | 第一次 200，之后 **418 Unusual Traffic** | ❌ 反爬，不可靠 |
| **Springer** `/journal/<id>/rss` | 404 | ❌ 已停 |
| **Wiley** `/feed/<doi>` | 连接被关闭 | ❌ |
| **MDPI** `/rss/journal/<name>` | 403 | ❌ |
| **Nature** `/nature.rss` | 200，75 条，**有 `dc:date`** | ✅ 框架的 rss 采集器认 `dc:date`，能直接用 |
| **arXiv API**（Atom） | 200，正常 | ✅ `summaryIsBody: true` 直接吃，摘要就是正文 |
| **OpenAlex** `api.openalex.org/works?filter=primary_location.source.issn:...` | 200，RSE 近 6 个月 282 条 | ✅ **有日期、DOI、引用数**；摘要只有 inverted index（要重建） |
| **Crossref** `/journals/<ISSN>/works` | 200，RSE 近 6 周 209 条 | ✅ 有日期、DOI、作者；**Elsevier 不存摘要** |
| **Semantic Scholar** `paper/search/bulk?venue=...` | 无 key 直接 **429** | ⚠️ 有摘要（最好用），但要免费 key 且限流 |
| **OpenReview** | 403 | ❌ 被墙 |

**结论：顶刊目录的通用通道只有 OpenAlex / Crossref，摘要要靠 S2 或 OpenAlex 的 inverted index 重建。**
RSS 只对 Nature 这类还保留 `dc:date` 的出版商、以及 arXiv 有效。

---

## 四、三个硬约束（必须先解决，否则站是空的）

### ① 没有摘要 = 不评分 = 不公开

框架规则：*"只有标题、没有正文、订阅摘要或帖子文字的普通文章先等待材料，不评分、不凭标题写文案，也不进入公开池。"*

OpenAlex / Crossref 都拿不到干净的摘要字符串。所以**必须补摘要**，否则采进来的论文全部停在"等待材料"，页面上一条都没有。

三条路：
- S2 API（免费 key）+ `fields=abstract` —— 最省事，429 风险低
- OpenAlex `abstract_inverted_index` 本地重建 —— 免费、稳，但要写 20 行代码
- 抓出版商页面 —— 已被 403 挡住，不可行

### ② "回看 6 个月" 和 "48 小时旧文规则" 冲突

`content/materials.ts` 里 `STALE_ON_DISCOVERY_MS = 48 小时`：发现时已发布超过 48 小时的资料会被标成 backfill，**不创办事件、不进"今天"、不推送**（还在 `/all` 里，但没有事件页、没有聚簇）。

对策（推荐，零代码）：**每天抓一次"当天新上线"的论文**，每篇都在 48 小时内被发现，就都是"新闻"。6 个月的回看靠日积月累 + 月报归档，**不要一次性灌历史**。

想要"一上线就有 6 个月存量"的话，就得改这个常量（1 行代码 + 相关公开规则），代价是首次导入会把历史全刷出来。

### ③ 期刊论文的"日期"是哪一天

Elsevier 的卷期日期可能是 **2027 年 1 月**（提前出版），而在线日期是**今天**。用卷期日期会把所有论文判成"未来"，用在线日期才符合"新"。

- OpenAlex：`publication_date` 一般是**在线日期**，可用
- Crossref：`created`（入藏时间）≈ 上线时间，比 `published` 更接近"新"
- **统一用在线/入藏日期**，别用卷期日期

---

## 五、学科与分类

你说的是"AI、CS、遥感、石油等工科"——多学科。框架的分类（`CATEGORIES`）正好可以当**学科**用：

| key | label | section（日报分节） |
|---|---|---|
| `ai` | 人工智能 | 人工智能 |
| `cs` | 计算机 | 计算机 |
| `rs` | 遥感 | 遥感与地学 |
| `petro` | 石油 | 石油与能源 |
| `other` | 其他工科 | 其他 |

`topics.json` 再分两层：
- `field`：细分方向（LLM / 视觉 / 强化学习 / 高光谱 / SAR / 储层 / 钻完井……）
- `company`：机构与期刊（清华、武大、中科院空天院、中石油勘探院……）

**注意**：跨学科共用一套评分标准会失真。建议 `selection-score.md` 里按学科分节写"什么值得看"，或者给每个学科配一份提示词（框架支持 `{{> 文件}}` 引用）。

---

## 六、推荐架构

```
OpenAlex（按 ISSN 拉最近上线）
   └─ 小模块补摘要（S2 或 inverted index 重建）
        └─ POST /api/ingest/items 或直接 upsertMaterial
             └─ 框架原有流程：预筛 → 评分 → 中文标题摘要 → 归档
arXiv（AI/CS）── 直接 rss，零改造
Nature 系（有 dc:date）── 直接 rss
公众号（可选，T2）── mp_account + 极致了
```

### 配置能做的（P0，1–2 天）
- `site/site.ts`：站名、`subject: "论文"`、文案、`EDITION_TIMES`
- `industry/taxonomy.ts`：上面的学科分类、标签词表、机构/期刊名录
- `industry/topics.json`：方向 + 机构主题页
- `industry/sources.json`：arXiv（按类别拆 4–5 个源）、Nature、BAIR/DeepMind 等实验室博客
- `industry/prompts/`：`prefilter.md`、`selection-score.md`（**按学科分节**）、`content-understanding.md`
- `industry/selection.ts`：门槛先用 60/65/76
- `tests/` 里写死 AI 分类和公司名的例子要一起换

### 需要写一个模块（P2，约 200 行 + 1 张表）
`modules/journals/`：
- 按 ISSN 列表定时拉 OpenAlex（免费，无 key 每天 $0.10 额度，够用）
- 补摘要（S2 by DOI，或 OpenAlex inverted index 重建）
- 用 `upsertMaterial` 入库，`via: "fetch"`、`tier: "T1"`
- 期刊元数据（刊名、ISSN、卷期、引用数）塞进 `raw`，卡片上显示

框架的 `modules/` 就是为这个准备的：`module.ts` + `server.ts` + `migrations/` + `tests/`，不碰 `apps/` 和 `packages/`。

---

## 七、分期

| 阶段 | 内容 | 产出 |
|---|---|---|
| P0 | 站名、学科分类、arXiv + Nature 信源、提示词 | 能跑起来，AI/CS 有内容 |
| P1 | 标 100–200 篇 → `eval-selection.ts` → 调门槛 | 选得准 |
| P2 | `modules/journals/` 接顶刊（遥感、石油） | 全学科有内容 |
| P3 | 按月归档页 / 引用数排序（可选） | "最近 6 个月最热" |

---

## 八、成本

- **模型**：约 6 次调用/篇。每天 40 篇 ≈ 240 次，约 0.3M token/天；200 篇 ≈ 1,200 次。
- **OpenAlex**：免费（无 key 每天 $0.10，有 key $1/天）。
- **Crossref**：免费。
- **S2**：免费 key，有限流。
- **公众号**：极致了按次——列表 ¥0.14/次、正文 ¥0.03/篇（代码注释记的单价）。
- **X**：SocialData 按请求。

---

## 九、公众号怎么接（key 从哪来）

框架里的 `mp_account` 用的是**极致了（Dajiala）**这个第三方数据服务，不是微信官方接口（微信没有开放"读任意公众号"的 API）。

1. 打开 <https://www.dajiala.com>，手机号注册（API 页：`/main/interface`）。
2. 充值/购买额度（按次扣，余额见控制台）。
3. 在控制台拿 **API key**，写进 `.env`：`DAJIALA_KEY=...`（可选 `DAJIALA_BASE_URL`）。
4. 每个号要一个 **`ghid`（原始 ID，`gh_` 开头）**，填在信源配置：`{ "ghid": "gh_xxxx", "nickname": "机器之心" }`。ghid 一般在极致了的公众号检索/控制台里查，或者找客服要。
5. 重启 api 和 worker。后台「信源」新建 `mp_account` 类型，填 ghid。

成本：一个号每天查一次列表 ≈ ¥0.14/天；10 个号 ≈ ¥42/月，再加正文 ¥0.03/篇。

⚠️ 三个提醒：
- `mp_account` **不支持"预览抓取"**，只能建完等定时任务跑。
- 公众号正文只展示摘要 + 原文链接（版权默认，`site_fulltext` 关）。
- 对顶刊论文站，公众号是**二手解读**（T2），不是刚需。建议**先不接**，等顶刊跑通再说。

替代方案（免费但要自己养）：RSSHub 的 `/wechat/` 路由（依赖搜狗微信，经常失效）、wechat2rss（自建，要维护 cookie）。

---

## 十一、期刊与会议清单（ISSN 已用 OpenAlex 核实）

> 采集通道标注：✅ OpenAlex 当天可见 ｜ ⚠️ 元数据滞后 1–3 个月（IEEE 通病）｜ ❌ 无 DOI，只能靠会议官网

### 遥感

| 刊名 | ISSN | 出版方 | 通道 |
|---|---|---|---|
| Remote Sensing of Environment | 0034-4257 | Elsevier | ✅ 近 30 天 57 篇 |
| ISPRS Journal of Photogrammetry and Remote Sensing | 0924-2716 | Elsevier | ✅ 46 篇 |
| IEEE TGRS | 0196-2892 | IEEE | ⚠️ |
| IEEE JSTARS | 1939-1404 | IEEE | ⚠️ |
| IEEE GRSL | 1545-598X | IEEE | ⚠️ |
| Remote Sensing (MDPI) | 2072-4292 | MDPI | ✅ |
| Int. J. Applied Earth Obs. and Geoinformation | 1569-8432 / 0303-2434 | Elsevier | ✅ |
| GIScience & Remote Sensing | 1548-1603 | T&F | ✅ |
| Photogrammetric Engineering & Remote Sensing | 0099-1112 | ASPRS | ✅ |
| IEEE Geoscience and Remote Sensing Magazine | 2168-6831 | IEEE | ⚠️ |
| Remote Sensing Letters | 2150-704X | T&F | ✅ |
| 会议：IGARSS / ISPRS Congress | — | IEEE / ISPRS | ⚠️ DOI 有但滞后 |

### 石油

| 刊名 | ISSN | 出版方 | 通道 |
|---|---|---|---|
| Fuel | 0016-2361 | Elsevier | ✅ **近 30 天 377 篇** |
| Geoenergy Science and Engineering（JPSE 新名） | 2949-8910 | Elsevier | ✅ |
| Journal of Petroleum Science and Engineering（旧名） | 0920-4105 | Elsevier | ✅ |
| Marine and Petroleum Geology | 0264-8172 | Elsevier | ✅ |
| SPE Journal | 1086-055X | SPE | ✅ 29 篇 |
| Petroleum Exploration and Development | 1876-3804 | Elsevier | ✅ |
| AAPG Bulletin | 0149-1423 | AAPG | ✅ |
| Organic Geochemistry | 0146-6380 | Elsevier | ✅ |
| Energy & Fuels | 0887-0624 | ACS | ✅ |
| International Journal of Coal Geology | 0166-5162 | Elsevier | ✅ |
| Petroleum Science | 1995-8226 / 1672-5107 | Elsevier | ✅ |
| 会议：SPE ATCE / IPTC / OTC | — | OnePetro | ❌ 无免费 API |

### 人工智能

| 刊名 | ISSN | 出版方 | 通道 |
|---|---|---|---|
| IEEE TPAMI | 0162-8828 | IEEE | ⚠️ 近 30 天只有 2 条 |
| JMLR | 1532-4435 | MIT Press | ⚠️ 近 30 天 0 条 |
| Artificial Intelligence | 0004-3702 | Elsevier | ✅ |
| IEEE TNNLS | 2162-237X | IEEE | ⚠️ |
| Neurocomputing | 0925-2312 | Elsevier | ✅ |
| IEEE TIP | 1057-7149 | IEEE | ⚠️ |
| Pattern Recognition | 0031-3203 | Elsevier | ✅ |
| Nature Machine Intelligence | 2522-5839 | Nature | ✅ 12 篇 |
| Information Sciences | 0020-0255 | Elsevier | ✅ |
| IEEE Transactions on Cybernetics | 2168-2267 | IEEE | ⚠️ |
| Neural Networks | 0893-6080 | Elsevier | ✅ |
| 会议：NeurIPS | 1049-5258 | — | ⚠️ OpenAlex 有 19928 条，但无 DOI 的进不来 |
| 会议：ICML / ICLR / ICCV / IJCAI / ACL | — | — | ❌ 无 ISSN，靠 arXiv + 官网 |

### 计算机

| 刊名 | ISSN | 出版方 | 通道 |
|---|---|---|---|
| Communications of the ACM | 0001-0782 | ACM | ✅ |
| IEEE TSE | 0098-5589 | IEEE | ⚠️ |
| IEEE TKDE | 1041-4347 | IEEE | ⚠️ |
| PVLDB | 2150-8097 | ACM | ✅ |
| ACM Computing Surveys | 0360-0300 | ACM | ✅ |
| IEEE TIFS | 1556-6013 | IEEE | ⚠️ |
| IEEE TMC | 1536-1233 | IEEE | ⚠️ |
| IEEE Transactions on Computers | 0018-9340 | IEEE | ⚠️ |
| IEEE TPDS | 1045-9219 | IEEE | ⚠️ |
| Journal of Systems and Software | 0164-1212 | Elsevier | ✅ |
| ACM TOCS | 0734-2071 | ACM | ✅ |
| 会议：SIGMOD / VLDB / OSDI / SOSP / NSDI / KDD | — | — | ❌ |

**三个必须知道的事实：**

1. **IEEE 系（TGRS/TPAMI/TIP/TSE/TKDE…）元数据滞后 1–3 个月**。不是没更新，是 Crossref/OpenAlex 还没收到。要实时只能上 IEEE Xplore API（免费 key）。**建议先不做 IEEE**，或用它做"补充源"。
2. **Fuel 一个月 377 篇**——单刊就和整个 AIHOT 的日更量级相当。门槛和呈现方式必须按刊调，不能一套通用。
3. **会议几乎没有 ISSN**，NeurIPS/ICML/ICLR 的正式版很多没有 DOI，只能靠 arXiv + 官网 accepted 列表。**会议天生不适合"自动化目录"**，除非接受"以 arXiv 预印本为准"。

---

## 十二、比 AIHOT 更优的 8 个设计选择

AIHOT 的核心假设是"**1000 条/天的资讯洪流，用模型筛出 10 条**"。论文站的假设完全不同，照搬会浪费钱、还会把好论文筛掉。逐条说：

### 要砍的

**1. 砍掉"双次评分 + 76 分门槛"**

AIHOT 的 `T2` 门槛 76 分是为"媒体噪声"设的。顶刊论文已经过同行评审，用 76 分只会把 90% 的论文挡在外面——这是论文站最致命的照搬。

改法：**评分只用来排序，不用来淘汰**。门槛降到 40 左右（或改成 `understandFloor` 式的"全都写摘要"），让"这一期有什么"完整呈现，读者自己挑。

**2. 砍掉 48 小时热点榜和事件聚簇**

单篇论文永远 1 个参与方，进不了 `/hot`；聚簇本来是给"10 篇报道折成 1 件事"用的，论文的场景是"1 篇论文的多个入口折成 1 条"——那是身份匹配问题，不是语义聚类问题。

**3. 砍掉"逐条 6 次调用"的流水线**

AIHOT：预筛 + 2 次评分 + 结构化 + 写作 + 归组 ≈ 6 次/篇。
论文站：**结构化 + 写作 = 2 次/篇**，而且**同一期同一刊可以批量写**（一次调用 20 篇，共享期刊上下文），实际能压到 0.3 次/篇。

100 篇/天：AIHOT 方式 600 次/天，论文方式 200 次/天，批量方式 30 次/天。**差 20 倍**。

### 要加的

**4. DOI / arXiv ID 做一等身份（最重要的一条）**

AIHOT 用 URL 去重，因为新闻转载的链接各不相同。论文的 DOI 是全球唯一标识——**加一列 `doi` + 唯一索引，多入口自动合并**，比让模型判断"是不是同一篇"准得多，也便宜得多。

顺带解决论文站最烦的重复：**预印本 → 期刊正式版**、**会议版 → 期刊扩展版**。这是标题/作者/DOI 匹配问题，不是 LLM 问题。

**5. 热度换成学术信号，而不是"谁提了一嘴"**

`cited_by_count`（OpenAlex 每天更新）+ HF upvotes + GitHub stars + Altmetric，加权成"热度"。这才配叫"最近 6 个月最热"。AIHOT 的"独立参与方数量"对论文几乎无意义。

**6. 期次/卷号是一等公民**

论文的真正单位是 "Volume 348, January 2027"，不是"今天"。页面按 **期次 → 论文** 组织，比时间线更符合科研读者的心智；月报正好按"期"归档。

**7. 中文摘要要换写法**

AIHOT 的 `content-understanding.md` 是新闻写法（发生了什么）。论文要"**问题 → 方法 → 关键结果 → 局限**"四段式，外加保留英文原标题、作者、机构、代码链接。这是你相对 AIHOT 的最大体验差异点。

**8. 按期刊订阅 + 期刊主题页**

读者常只关心 3 本刊。AIHOT 的 RSS 按分类出，你要加 `/feed/journal/<issn>.xml` 和每本刊的主题页。这是论文站自然的增长入口（"RSE 最新一期"是高频搜索词）。

### 一个反直觉的建议

**别做"全网论文"。** AIHOT 的护城河是信源名单 + 门槛；你的护城河应该是"**某几个学科顶刊的完整覆盖 + 中文精读**"。10 本刊做全，比 1000 个源做浅有价值得多——这也是为什么我建议先只做 4 个学科、先把 IEEE 放一边。

---

## 十三、还差你确认

1. **4 个学科够不够**？还要不要加"材料/能源/地学"之类？
2. **IEEE 系先不做**（等 metadata 或上 IEEE API），还是接受 1–3 个月延迟？
3. **"最近 6 个月"是滚动窗口，还是自然月归档**？前者要加页面，后者月报就够。
4. **中文标题还是英文原标题为主**？建议"英文原标题 + 中文一句话结论"，框架的 `original_title` 支持。
