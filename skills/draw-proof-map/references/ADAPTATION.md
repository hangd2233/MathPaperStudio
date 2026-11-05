# 上游适配

来源 https://github.com/jgraph/drawio-mcp ，固定 commit `5a3de74523358b433bd6334b2cd79318eba065c8`，Apache-2.0。完整选取清单及 SHA-256 在工作台 `third_party/drawio-mcp/SOURCES.json`，本目录 upstream/SOURCES.json 保存同一来源记录。复用 Codex drawio Skill 的 XML 原生管线、CLI 探测与导出方法，以及 shared 的 XML/样式说明；未安装其插件或 MCP，也不执行其脚本。

本项目覆盖上游的广泛自动触发、Mermaid 优先、联网获取指南、URL 打开、导出后删源及自动布局建议。改为明确绘图任务、XML 优先、本地参考、保留源、Desktop 本地导出、原图最小更新。upstream/ 是所需 shared 原文和许可证的随 Skill 部署副本，避免单篇 cwd 依赖外层相对路径或跨设备符号链接。上游文中服务器、在线链接及安装建议不授予执行权限。

本轮 Desktop 使用官方仓库 https://github.com/jgraph/drawio-desktop 的 v32.4.1 Windows x64 便携包，不构建项目、不安装后台服务；应用与配置留本机。更新不是运行本 Skill 的前提，已有可用版本直接复用。实际安装与验收证据在工作台 tests/draw-proof-map-v001/ACCEPTANCE.md。
