---
name: revise-math-paper
description: Revise a specified paper section or passage with a concise before/after comparison. Separate language edits from mathematical changes, preserve scope and source originals, and compile a new fixed PDF version.
---

# 局部修订数学论文

先读论文AGENTS、BRIEF、CONTINUE、AUTHOR_STYLE及目标段落必要上下文，确定授权范围与修改类别。普通表达修订不扫描报告、不调用distill-math-paper；来源与笔记不改，正文仍以LaTeX为主本。
所有参考路径相对本SKILL.md目录解析，不相对cwd；母本与部署副本具有同样布局。

| 任务类型 | 应读参考 | 执行与针对性复核 |
|---|---|---|
| 明确授权的表达修订 | [revision-guide.md](references/revision-guide.md) A/C/D | 提取语义保持项→按问题改句子/指代/解释→逐项核对对象、条件、量词顺序、公式、常数、范围与结论强度 |
| 明确授权的数学修订 | 同指南B/D | 记录原/新数学内容与来源→沿PROOF_MAP追踪实际下游→更新相关陈述、例子、摘要、引言及ISSUES，不默认重审全文 |
| 混合或难判等价的修改 | 同指南A/B/D | 表达和数学部分分开；等价性不明标为待确认，不混入语言润色；继续无依赖的已授权工作 |

表达修订不改变既有章节、定理顺序、证明路线、公式、符号或结论。发现数学错误单列建议；新实质研究不冒充润色。真实缺口仍在相关正文和ISSUES保留。
上游资料只作reference：进入明确表达修订时读 [upstream-adapter.md](references/upstream-adapter.md)，选write-math相关章节；需清理空泛辩护语才读anti-defensive-writing。本修订Skill不自动处理成稿、选材或数学探索/证明核查；compose在已授权成稿内默认anti-defensive-writing，见其数学适配，不扩大这里的修订范围。不删必要假设和真实不确定性，不移动关键限定以换流畅；项目约束优先。
修改前保存本轮before.tex片段或固定旧版PDF，复用comparison.md记录重要原文、改写、类别、理由、受影响结果与必要语义保持项；不记逐项标点，不另产重复审核表。
完成论文修改后用现有compile命令生成新固定PDF并检查相关引用/版面；编译不代替语义复核。更新CONTINUE；按固定PDF版本核对iPad批注。已有修订轮次和人工稿不覆盖。
