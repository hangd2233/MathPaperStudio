# 上游资料适配与读取路由

这些是普通reference文件，不调用或安装write-math/anti-defensive-writing Skill。本页用于明确授权的表达修订，按下表读对应章节；write-math不默认介入首次成稿、选材、数学探索或证明核查。compose内默认anti-defensive-writing的成稿路径见 [数学适配](../../compose-math-paper/references/anti-defensive-math.md)，不扩大revise授权。所有相对路径相对本文件目录，不相对cwd。
固定来源与逐文件哈希见 [SOURCES.json](upstream/SOURCES.json)。根third_party/是可核对的来源副本，本目录upstream/是随现有revise技能部署的字节相同参考副本。来源按约定只读；本适配优先于上游正文中广泛适用的说明和建议。

| 表达问题 | 应读参考及具体章节 | 允许采用的动作 |
|---|---|---|
| 句子过长、指代、量词措辞、公式与句子衔接 | [english-usage.md](upstream/write-math/references/comprehensive/english-usage.md)：Sentence Structure、Precise Quantifier Words、Ambiguous Pronouns、Quantifier Ambiguity in English、Punctuation of Mathematics | 拆句、明确先行词及依赖、保持公式与量词顺序并解释计算目的 |
| 段落逻辑、读者不知道一步的目的 | [reader-centered-writing.md](upstream/write-math/references/comprehensive/reader-centered-writing.md)：Signposting、Clear antecedents、Controlling information flow | 在指定段落补已有论证的解释、连接词；不重排章节/定理/路线 |
| 引言/摘要已有内容的表达 | [paper-structure.md](upstream/write-math/references/comprehensive/paper-structure.md)：Abstract、Background and Related Work、Summary of Main Results | 清楚表达已核实对象/条件/贡献；不创造空白、不改变贡献及结构；不强制字数或五段 |
| 定理/证明语言冗长但数学不变 | [theorems-and-proofs.md](upstream/write-math/references/comprehensive/theorems-and-proofs.md)：Theorem Statement Design、Proof Overviews、Quantifier Precision | 明确陈述及已有证明步骤的目的；不抽换/合并引理、不改变直接/反证方法或依赖顺序 |
| 局部记号解释不清 | [notation.md](upstream/write-math/references/comprehensive/notation.md)：Global vs. Local Notation、Pairing Objects with Their Notation | 补清现有记号作用域及所指对象；不改符号或TeX宏 |
| 引用句含混 | [citations-and-references.md](upstream/write-math/references/comprehensive/citations-and-references.md)：Signposting Citations、Specific References | 改引用说明；结论/原文定位/条件不明确时列ISSUES，不虚构编号或替换数学依据 |
| 局部润色反复、语气统一 | [revision-and-process.md](upstream/write-math/references/comprehensive/revision-and-process.md)：Polishing restraint (Johnson's rule)、Tracking changes、Local versus global errors | 限定本轮范围、保留对照；不由此跑整篇审查或新流程 |
| 空泛谦辞、预设质询、叠加保留词 | [rules.md](upstream/anti-defensive-writing/rules.md)：Core Rule、Preserve Necessary Precision、Rewrite Procedure、English Patterns、Using the Examples（或对应中文段落） | 分类语句功能后删空泛语气；有效性/范围/真实不确定性在使用位置保留 |

write-math的 [upstream-skill.md](upstream/write-math/upstream-skill.md) 和 [essential checklist](upstream/write-math/references/essential/checklist.md) 保留用于核对来源及导航，不作为每轮默认全读清单。

## 项目覆盖规则

- 上游泛化的自动触发描述不生效：这里仍只用于明确授权表达修订。compose的已授权成稿默认使用固定anti-defensive-writing规则及数学适配；write-math调用范围保持不变，不自动追加全文润色。
- write-math建议重排、合并/拆分引理、改符号、替换证明方法、整篇风格统一时，表达修订不执行。结构或数学变化只作为单独建议；必须进入明确授权的数学/结构修订才可另行处理。
- 反防御写作不能删真实假设、条件性、尚未证明内容或关键解释，也不把它们统一移到discussion。与某一结论有效性有关的限定就留在该处。
- 保留结论强度层次：upper bound≠sharp bound，example attaining a bound≠classification of every equality case，group order≠group structure。不以自信措辞替代证明。
- 上游是写作建议集合，不是数学事实来源。其示例甚至可能省略所需假设；先核对示例条件，不照搬事实。未独立查证其列出的作者建议或二手归因，不声称直接读取了所有Tao/Knuth/Halmos原文。
- 保留MIT版权/许可原件。未取回时可先用项目指南，但本轮两个固定版本的规则/许可已实际取回并核验，不能继续称为仅提及。
