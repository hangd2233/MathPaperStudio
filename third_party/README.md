# 写作资料来源与采用边界

SOURCES.json记录固定提交、原始路径、Git blob SHA-1、逐文件SHA-256和字节数。write-math来自用户指定commit；anti-defensive-writing的HEAD实际解析到固定commit后，所有文件以该commit取回。两者MIT许可证及版权声明原样保留。

write-math仅取得plugins/write-math/skills/write-math/中的说明、八份导航参考与仓库适用LICENSE；没有取其他插件、安装脚本或插件配置。上游SKILL.md重命名为upstream-skill.md，原字节保留；其全场景自动适用描述在本项目不生效。
anti-defensive-writing仅保存skill/anti-defensive-writing/SKILL.md规则正文（重命名rules.md）及LICENSE；上游根SKILL.md已核对与它逐字节相同，不重复保存。没有取示例、图片、安装脚本或发现配置。

这些是约定只读的来源参考，不是新Skill。更新需另建明确版本/记录，不手改规则正文。规范使用边界与按问题读取路由见skills/revise-math-paper/references/upstream-adapter.md。部署用的普通文件副本位于该Skill的references/upstream/，与这里字节一致；不使用符号链接或全局插件。

## draw.io 绘图参考

drawio-mcp/ 固定保存 Codex drawio Skill 及必要 shared XML/样式说明，保留 Apache-2.0 许可。清单、适配和 Desktop 官方成品来源分别见该目录 SOURCES.json、ADAPTATION.md、DESKTOP.json。运行时优先读取部署内的本地参考，不注册上游通用 drawio Skill，不安装其 MCP。
