---
name: compose-math-paper
description: Compose a complete English LaTeX working draft from an explicit selected scope and proof handoff, using the author's mathematical exposition methods and direct prose, then compile a readable PDF. Use for authorized drafting, not autonomous selection or rewriting existing manuscripts.
---

# 从交接组织数学论文

先读根/论文规则、[作者偏好](references/AUTHOR_STYLE.md)、BRIEF、PROOF_MAP、ISSUES及指定证明原件。无选题不扫描报告或调用选材；当前会话执行，不另起代理/模型。LaTeX为唯一正文主本，讨论中文、正文英文，原件不改。参考路径相对本SKILL.md解析，不相对cwd；全部所需指南及规则随部署携带。

| 任务类型 | 应读参考 | 执行与针对性复核 |
|---|---|---|
| 已授权首次成稿 | [composition-guide.md](references/composition-guide.md) 0/A–F；开始时读[数学适配](references/anti-defensive-math.md)及其链接的固定规则正文 | 稳定中心问题/读者/结果层次与证明依赖→选择组织方式→写中间目标及实际论证→依据完整论证完成引言/摘要→正常通读时检查一次防御性表达，核对范围/依赖/引用 |
| 指定范围续写 | 指南相关章节/F及上述默认表达规则 | 只写授权范围；首次成稿方法不授权重排/改证明或自动改其他论文 |
| 同时明确授权已有段落表达修订 | [revision-guide.md](../revise-math-paper/references/revision-guide.md) A/C/D | 保持既有结构及数学语义，按问题选择write-math；不默认附加全文修订 |

anti-defensive-writing在已授权compose任务内默认启用，用户当次关闭即关闭。先读并直接起草，不另跑循环润色；按功能保留必要条件、weak等术语、证明归约与真实障碍。write-math的原授权范围不变；revise的表达/数学边界不变。
按当前环节选读[合成示例](references/author-examples.md)；不携带个人范文或阅读记录。示例不作新稿的数学证据。
新工程用现有tools/studio.py new-paper，现有目标先读并保留人工内容。真实缺步同时标正文与ISSUES，不编造证明。用现有compile保存固定新版PDF并检查引用/版面；不以编译替代数学审查。保存reviews/<round>/comparison.md并更新CONTINUE，初稿不伪造前稿。
