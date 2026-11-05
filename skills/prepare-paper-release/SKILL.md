---
name: prepare-paper-release
description: Compile and check an explicitly designated paper, verify imports and references, and produce a versioned source ZIP and PDF. Use for packaging a working draft or release candidate; never submit automatically.
---

# 检查与版本打包

读目标论文 CONTINUE.md 和 working/ISSUES.md，确认范围、版本和单一写入者。无授权不提交、发布或冻结接受稿。
从工作台根执行 `python3 tools/studio.py check-paper papers/<id>`，再执行 `python3 tools/studio.py release papers/<id> --version <new-version>`。固定目录 releases/<version>/ 包含 main.pdf、source.zip、build.log 和 manifest.json；版本存在则换新版本，不能覆盖批注对象。
工具使用本机 TeX，在系统临时目录新鲜编译；核对导入哈希、常见相对依赖、未定义/重复引用和源码 ZIP 字节完整性。工具检查有限，不能当作完整数学/引用审查：人工/当前会话核对正文缺口、文献适用性、文件依赖和实际 PDF 排版。
解压源码包到同步目录外，用已有 TeX 再编译一次，确认独立于 Danus/工作台。保留必要来源与交接；排除应用状态、凭据、缓存，不以 .gitignore 代替坚果云排除规则。
默认标记 working-draft；有缺口不能叫完成论文。缺少编译器或权限明确记录，不反复安装。更新 CONTINUE.md 的版本与限制。按版本 PDF 在 iPad 批注，另存批注文件。投稿需要另行明确请求。
