// 这个行业的分类体系：类别、标签词表、机构名录，以及防止张冠李戴的身份词典。
// 模型按这里的词表打标签，主题页（topics.json）按标签归类，筛选栏按类别分组。
// 换行业时：类别的 key 会出现在网址里（/all?category=…），上线后就不要再改；标签和名录可以随时增减。
//
// Thesis NH 的类别就是学科：人工智能、计算机、遥感、石油，以及工科的电子信息、机械、材料、化工、能源。
// 日报按这里的 section 分节，每个学科各自成节，读者一次只看自己关心的那一节。

/**
 * 网页上的类别（筛选栏、卡片角标、RSS 分类订阅）。key 是网址和接口里的身份，上线后不要改。
 * section 是日报里的分节标题（几个类别可以共用一节，按这里的顺序排）；guide 告诉结构抽取模型这一类收什么、
 * 和相邻类别的边界在哪（总的归类原则写在 prompts/structure.md 里）。
 * commentary 标出评论类（教程、观点）：日报写过的事又有评论类的后续报道，只占一行快讯（报道它的信源够多时除外）。
 * 没归上类的资料在日报里放进第一个 key 为 industry 的类别所在的节（没有就放最后一节）。
 * feedLabel 是分类 RSS 标题里的名字（不写就用 label）。公开接口、RSS 和 MCP 里要把一类并进另一类发布，写在站点设置里（site/site.ts 的 PUBLIC_CATEGORIES）。
 */
export const CATEGORIES = [
  { key: "ai", label: "人工智能", feedLabel: "AI 论文", section: "人工智能", guide: "机器学习、大模型、智能体、多模态、强化学习等以智能方法为核心的论文。用 AI 解决别的学科的问题、贡献在应用侧的，归到那个学科。" },
  { key: "cs", label: "计算机", feedLabel: "计算机论文", section: "计算机", guide: "系统、网络、数据库、软件工程、安全、体系结构、程序语言、理论等计算机方向的论文。以机器学习方法本身为贡献的归人工智能。" },
  { key: "rs", label: "遥感", feedLabel: "遥感论文", section: "遥感", guide: "对地观测、卫星与航空影像、高光谱、SAR、点云与摄影测量、定量遥感反演、遥感数据集与解译方法的论文。用通用视觉模型但任务和评估都在遥感上的，归遥感。" },
  { key: "petro", label: "石油", feedLabel: "石油论文", section: "石油", guide: "油气勘探与开发、储层与地质、钻完井、测井、油藏工程、提高采收率、地球化学、油气加工的论文。与油气场景无关的，归材料、化工或能源。" },
  { key: "ee", label: "电子信息", feedLabel: "电子信息论文", section: "电子信息", guide: "通信、信号处理、微电子与集成电路、半导体器件、光电子、雷达与天线、电力电子的论文。以机器学习方法为贡献的归人工智能；以遥感载荷或影像为对象的归遥感。" },
  { key: "mech", label: "机械", feedLabel: "机械论文", section: "机械", guide: "机械设计与制造、机器人本体与控制（非学习方法）、振动与故障诊断、摩擦磨损、流体机械、加工与增材制造、结构力学的论文。以机器人学习方法为核心的归人工智能。" },
  { key: "mat", label: "材料", feedLabel: "材料论文", section: "材料", guide: "金属、陶瓷、高分子、复合材料、纳米与功能材料的合成、结构、性能与表征的论文。只做材料在油气场景应用的归石油；只做电池器件的归能源。" },
  { key: "chem", label: "化工", feedLabel: "化工论文", section: "化工", guide: "化学工程、催化、反应工程、分离过程、过程强化与化工设计的论文。石油炼制与油气加工归石油；只做燃料燃烧的归能源。" },
  { key: "energy", label: "能源", feedLabel: "能源论文", section: "能源", guide: "新能源（电池、光伏、氢能、储能）、能源转换与利用、燃烧与燃料、可再生能源系统的论文。油气勘探开发归石油。" },
] as const satisfies ReadonlyArray<{ key: string; label: string; feedLabel?: string; section: string; guide: string; commentary?: true }>;

/**
 * 这个行业最受关注的那类发布（AI 行业是新模型）：日报报头的“N 个新模型”、改分类后修订已出的报告都按它数。
 * category 是类别，tag 是标签，两者都对上才算；unit 接在数字后面。
 * 没有这样一类的行业设成 null，报头就不显示这个数。
 *
 * 论文站不设：每一篇都是“新论文”，用类别加标签去数只会数到某一个学科，
 * 报头改用 metricUnits.firstPartyEvents 的“篇顶刊”。
 */
export const RELEASE: { category: string; tag: string; unit: string } | null = null;

/** 周报月报的总述可以直接写、不必在报道里找到出处的行业通用词（小写）。站名会自动算进去。 */
export const PLAIN_TERMS: readonly string[] = ["ai", "llm", "gpu", "sar", "doi", "cnn", "transformer", "lidar", "sota"];

/**
 * 内容理解一步给每篇资料判的“内容类型”（写在 prompts/content-understanding.md 里，改了类型要同步改那份提示词）。
 * 评分提示词（prompts/selection-score.md）按类型给五个维度不同的权重。
 */
export const ITEM_TYPES = ["new_paper", "venue_paper", "method", "dataset", "survey", "code_release", "commentary"] as const;

// ── 标签词表 ────────────────────────────────────────────────────────────────────────────

/** 每篇资料的第一个标签必须是这些“分类标签”之一。 */
export const CATEGORY_TAGS = [
  "新论文", "顶刊接收", "方法", "数据集/基准", "综述", "开源/复现", "解读/观点", "撤稿/更正", "学术动态", "其他",
] as const;

/** 可选的主题标签：研究方向。 */
export const TOPIC_TAGS = [
  "大模型", "多模态", "Agent", "计算机视觉", "强化学习", "图学习", "优化/理论", "系统/工程",
  "高光谱", "SAR", "光学遥感", "点云/摄影测量", "定量遥感",
  "储层/地质", "钻完井", "测井", "油气开发", "地球化学",
] as const;

/** 可选的实体标签（机构、实验室、期刊平台）。 */
export const ENTITY_TAGS = ["arXiv", "中科院", "武汉大学", "清华大学", "北京大学", "中国石油", "中国石化", "DeepMind", "OpenAI", "MIT", "Stanford"] as const;

/** 模型常写的近义词，统一成词表里的写法。 */
export const TAG_SYNONYMS: Readonly<Record<string, string>> = {
  论文: "新论文", 预印本: "新论文", preprint: "新论文", paper: "新论文", 研究: "新论文",
  顶会: "顶刊接收", 接收: "顶刊接收", camera_ready: "顶刊接收", 正式发表: "顶刊接收", 期刊: "顶刊接收",
  数据集: "数据集/基准", benchmark: "数据集/基准", 基准: "数据集/基准", 评测: "数据集/基准",
  综述: "综述", survey: "综述", review: "综述",
  开源: "开源/复现", 代码: "开源/复现", 复现: "开源/复现", repo: "开源/复现", github: "开源/复现",
  解读: "解读/观点", 观点: "解读/观点", 评论: "解读/观点", 评述: "解读/观点",
  撤稿: "撤稿/更正", 更正: "撤稿/更正", 勘误: "撤稿/更正",
  方法: "方法", 模型: "方法", 算法: "方法", 网络: "方法",
  遥感影像: "光学遥感", 卫星影像: "光学遥感", remote_sensing: "定量遥感",
  合成孔径雷达: "SAR", sar: "SAR", 高光谱影像: "高光谱", hyperspectral: "高光谱",
  摄影测量: "点云/摄影测量", 点云: "点云/摄影测量", 三维重建: "点云/摄影测量",
  油藏: "油气开发", 采油: "油气开发", 压裂: "油气开发", 提高采收率: "油气开发", eor: "油气开发",
  钻井: "钻完井", 完井: "钻完井",
  储层: "储层/地质", 地质: "储层/地质", 沉积: "储层/地质",
  测井: "测井", 地球物理: "测井",
  地球化学: "地球化学", 烃源岩: "地球化学",
  大语言模型: "大模型", llm: "大模型", gpt: "大模型",
  视觉: "计算机视觉", cv: "计算机视觉",
  智能体: "Agent", agent: "Agent",
  理论: "优化/理论", 优化: "优化/理论",
  工程: "系统/工程", 系统: "系统/工程",
};

// ── 机构与主体 ──────────────────────────────────────────────────────────────────────────

/**
 * 机构主题：id → 显示名、卡片上显示的标签（null 表示只用 entity:<id> 归类）、别名。
 * aliases 给结构抽取模型看；otherNames 是机构自己的其他称呼（实验室名、子品牌），
 * 把事实的主体对到发布方时也认它们。
 */
export const ENTITIES: Record<string, { name: string; displayTag: string | null; aliases: string[]; otherNames?: string[] }> = {
  cas: { name: "中国科学院", displayTag: null, aliases: ["中国科学院", "中科院", "CAS"], otherNames: ["空天信息创新研究院", "地理科学与资源研究所", "遥感与数字地球研究所", "自动化研究所", "计算技术研究所"] },
  whu: { name: "武汉大学", displayTag: null, aliases: ["武汉大学", "Wuhan University"], otherNames: ["测绘遥感信息工程国家重点实验室", "LIESMARS"] },
  thu: { name: "清华大学", displayTag: null, aliases: ["清华大学", "Tsinghua"], otherNames: ["清华"] },
  pku: { name: "北京大学", displayTag: null, aliases: ["北京大学", "Peking University"], otherNames: ["北大"] },
  zju: { name: "浙江大学", displayTag: null, aliases: ["浙江大学", "Zhejiang University"], otherNames: ["浙大"] },
  cug: { name: "中国地质大学", displayTag: null, aliases: ["中国地质大学", "China University of Geosciences"], otherNames: ["地大"] },
  cup: { name: "中国石油大学", displayTag: null, aliases: ["中国石油大学", "China University of Petroleum"], otherNames: ["石大", "中石大"] },
  petrochina: { name: "中国石油", displayTag: null, aliases: ["中国石油", "PetroChina", "CNPC"], otherNames: ["中国石油天然气集团", "勘探开发研究院"] },
  sinopec: { name: "中国石化", displayTag: null, aliases: ["中国石化", "Sinopec"], otherNames: ["中国石油化工集团", "石油勘探开发研究院"] },
  mit: { name: "MIT", displayTag: null, aliases: ["MIT", "Massachusetts Institute of Technology"] },
  stanford: { name: "Stanford", displayTag: null, aliases: ["Stanford", "斯坦福"] },
  deepmind: { name: "Google DeepMind", displayTag: "DeepMind", aliases: ["DeepMind", "Google DeepMind"] },
  openai: { name: "OpenAI", displayTag: "OpenAI", aliases: ["OpenAI"] },
  anthropic: { name: "Anthropic", displayTag: "Anthropic", aliases: ["Anthropic", "Claude"] },
  google: { name: "Google", displayTag: "Google", aliases: ["Google", "DeepMind", "Gemini", "谷歌"] },
  meta: { name: "Meta", displayTag: "Meta", aliases: ["Meta", "Llama"] },
  microsoft: { name: "Microsoft", displayTag: "Microsoft", aliases: ["Microsoft", "微软"] },
  deepseek: { name: "DeepSeek", displayTag: "DeepSeek", aliases: ["DeepSeek", "深度求索"] },
  minimax: { name: "MiniMax", displayTag: null, aliases: ["MiniMax", "海螺"] },
  huggingface: { name: "Hugging Face", displayTag: "Hugging Face", aliases: ["Hugging Face"] },
  kimi: { name: "Kimi / 月之暗面", displayTag: null, aliases: ["Kimi", "月之暗面", "Moonshot"] },
  cursor: { name: "Cursor", displayTag: null, aliases: ["Cursor", "Anysphere"] },
};

/**
 * 身份词典：摘要和标题里出现的机构，必须在原文里也出现过，否则退回原标题、丢掉摘要（防止模型张冠李戴）。
 * 行业没有这个问题时可以留空数组。
 */
export const IDENTITY_LEXICON: ReadonlyArray<{ id: string; name: string; patterns: RegExp[] }> = [
  { id: "cas", name: "中国科学院", patterns: [/中国科学院|中科院|\bCAS\b/] },
  { id: "whu", name: "武汉大学", patterns: [/武汉大学|\bWuhan University\b/] },
  { id: "cug", name: "中国地质大学", patterns: [/中国地质大学|\bChina University of Geosciences\b/] },
  { id: "cup", name: "中国石油大学", patterns: [/中国石油大学|\bChina University of Petroleum\b/] },
  { id: "petrochina", name: "中国石油", patterns: [/中国石油(?!大学)|PetroChina|\bCNPC\b/] },
  { id: "sinopec", name: "中国石化", patterns: [/中国石化|Sinopec/] },
  { id: "deepmind", name: "Google DeepMind", patterns: [/deepmind/i] },
  { id: "openai", name: "OpenAI", patterns: [/\bOpenAI\b/] },
];

/**
 * 这些域名上的文章，发布方就是对应的机构（托管平台如 GitHub、arXiv 不算）。
 * 论文站的“发布方”是期刊或会议，不是实验室，所以这里留空。
 */
export const PUBLISHER_DOMAINS: ReadonlyArray<{ entityId: string; domains: readonly string[] }> = [];

/** 原文里的这些写法也算提到了对应机构。 */
export const IDENTITY_CONTEXT_ALIASES: ReadonlyArray<{ entityId: string; pattern: RegExp }> = [];
