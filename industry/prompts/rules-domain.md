
【论文领域翻译规则 — 本平台只收人工智能、计算机、遥感、石油，以及电子信息、机械、材料、化工、能源的论文，严格遵守】

1. 歧义默认值：以下词在中文有其他含义，**一律按学术含义翻译**：
   - Transformer = Transformer 架构（保留英文；不译"变压器"）
   - Agent / Agentic = 智能体 / 智能体的（不译"代理人"）
   - Token = 模型 token（保留英文；不译"代币"）
   - Diffusion = 扩散模型（生成模型语境）；在地球物理语境指扩散过程，按上下文判断
   - Alignment = 对齐（AI 安全语境）；在地质语境是"对齐关系"，按上下文判断
   - Inference = 推理（模型生成）；统计语境是"推断"
   - Resolution = 分辨率（遥感）；方程语境是"求解"
   - Migration = 偏移（地震数据处理）；AI 语境是"迁移"
   - Inversion = 反演（遥感与地球物理），不译"倒置"
   - Reservoir = 储层（石油），不译"水库"；计算语境是"记忆库"
   - Log / Logging = 测井（石油）；程序语境是"日志"，按上下文判断
   - Core = 岩心（石油）；计算语境是"核心"
   - Fine-tune = 微调；Pretrain = 预训练；Embedding = 嵌入（可保留英文）

2. 以下内容**一律保留英文原文**，不翻译、不加中文括注：
   - 方法名与模型名：ResNet / ViT / CLIP / SAM / LoRA / U-Net / YOLO / BERT / GPT / LLaMA
     **规则**：论文提出的方法名、缩写、代号一律原样保留
   - 数据集、传感器与卫星：ImageNet / COCO / ADE20K / Sentinel-2 / Landsat-8 / MODIS / Pavia / Houston / Samson
     **规则**：任何数据集名、传感器名、卫星名、基准名一律保留原文
   - 期刊与会议缩写：RSE / ISPRS J / TGRS / JSTARS / GRSL / TPAMI / JMLR / CVPR / ICCV / NeurIPS / ICML / ICLR / AAAI / IGARSS / SPE J / AAPG
     **规则**：期刊会议的缩写原样保留，不扩写成中文全称
   - 技术缩写：SAR / InSAR / LiDAR / DEM / DSM / NDVI / CNN / RNN / GAN / RL / LLM / VLM / MoE / FFT / SNR / RMSE
     **规则**：任何 2–6 个字母的全大写缩写，默认保留英文
   - 指标名：PSNR / SSIM / mIoU / mAP / F1 / R² / RMSE / MAE / IoU
   - 编号：arXiv:2610.21185 / v1 / v2 / DOI:10.1016/j.rse.2026.115739
     **规则**：编号一字不改，不要把 v2 写成"第二版"

3. 数字与单位**一字不改**：12.3% / 3.2 dB / 0.85 / 10 m / 30 m 分辨率 / 4.2 次每周
   不要把 "10 m" 改写成"十米级"，不要把 "0.85" 四舍五入成"约 0.9"。

4. 代码、命令、URL、公式符号**原样保留**：
   - 反引号里的内容不翻译
   - 仓库地址、DOI 链接、arXiv 链接原样
   - 公式里的变量名（x、θ、λ）不改写

5. 中文学科名按官方说法：遥感 / 摄影测量 / 定量遥感 / 储层 / 测井 / 钻完井 / 提高采收率（EOR）/ 烃源岩

6. 作者与机构名：外文作者保留原文姓名；中文机构用官方名称（中国科学院、武汉大学、中国石油大学），不要自造简称。
