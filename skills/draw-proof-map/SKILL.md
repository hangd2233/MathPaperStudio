---
name: draw-proof-map
description: Use draw.io to draw or update a proof dependency overview or a single theorem proof route, only when explicitly requested for designated manuscript passages. Does not run as part of compose/revise or replace TikZ tasks.
---

# 数学证明图（draw.io）

只在用户明确要求绘制或更新证明图时执行；读取用户指定的当前正文及必要依赖，不扫描报告、不重新选材、不调用代理。论文 LaTeX 和原始笔记只读。图中文字跟随论文语言，说明用中文。绘图不是形式化验证或全面数学审查。

1. 先读 [数学与更新约定](references/proof-map.md)，以及本地 [XML essentials](references/upstream/xml-essentials.md)。复杂样式才读同目录 xml-reference.md、style-reference.md；不联网获取指南。上游适配来源见 [ADAPTATION](references/ADAPTATION.md)。
2. 确认指定稿件、模式和覆盖范围：A 全文依赖概览（主定理、关键引理、共同准备、外部结果）；B 单定理路线（目标、构造、推导、分类、结论）。完整读取所画结果、证明和必要依赖。PROOF_MAP.md 仅是定位线索。先从实际证明提取带定位的节点与关系清单，再绘图，不从预设关系生成验收结论。
3. 默认生成简洁概览；复杂证明拆局部图。优先原生 XML，稳定 id 优先 LaTeX label，显示当前编号；不修改论文标签。节点、实质边逐条追溯正文位置，压缩表达不补步、不修证明。
4. 在目标论文 `working/proof-maps/` 交付 `<name>.drawio`、`<name>.pdf`、`<name>-notes.md`。独立 drawio 是可编辑主本，始终保留；PDF 用本机 Desktop 导出，无云端转换或在线内容链接。notes 只记图例、位置、稿件版本/SHA-256、实际覆盖和不确定关系，不复制完整证明。不自动插入正文或 figures/。
5. 用 [本机命令](references/commands.md)检查 XML、实际 CLI 选项、导出和打开。先核实版本支持再选择布局，不能假设 `--layout` 存在；小图可直接按上游网格摆放，不开发布局引擎。公式先展开论文自定义宏并记录适配，开启 draw.io math 支持，必须检查实际 PDF。黑白可辨、字号可读、连线不穿字、无裁切；单靠文件存在不能验收。
6. 更新前读取原图、notes 和当前正文，运行 baseline 保存旧图；保留人工位置、连线和文字，只改必要内容，冲突先记录，不静默覆盖。单纯 re-export 只导出，不布局不改源。同步冲突保留版本；同图只允许一个设备写入。完成后更新目标 CONTINUE.md 与 reviews/<round>/comparison.md，列出实际检查和待人工步骤后停止。
