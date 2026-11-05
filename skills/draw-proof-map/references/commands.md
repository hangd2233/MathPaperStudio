# 命令与位置

下列路径 `S` 指本次实际读取的 SKILL.md 所在目录（母本或唯一发现副本），不从论文 cwd 拼接 `skills/`。Python 命令传参使用参数数组或正确引号，支持含空格和中文的路径。

```text
python "<S>/scripts/drawio_tool.py" probe
python "<S>/scripts/drawio_tool.py" check "<paper>/working/proof-maps/map.drawio"
python "<S>/scripts/drawio_tool.py" baseline "<paper>/working/proof-maps/map.drawio"
python "<S>/scripts/drawio_tool.py" export "<paper>/working/proof-maps/map.drawio"
python "<S>/scripts/drawio_tool.py" open "<paper>/working/proof-maps/map.drawio"
```

工具仅打开、检查、保存基线和导出，不提取数学或布局。`--exe "..."` 或本机环境变量 `DRAWIO_DESKTOP` 可指定执行文件。也可在本机（不进同步）`%LOCALAPPDATA%/MathPaperStudio/drawio.json` 或 macOS `~/Library/Application Support/MathPaperStudio/drawio.json` 设置 `{"executable":"本机绝对路径"}`。自动检查 PATH 和常见安装位置，不自动安装升级。macOS 常用 `/Applications/draw.io.app/Contents/MacOS/draw.io`。

probe 实际执行 `--help`，export 仅使用该帮助列出的 export/format/output/border 参数；不加 layout，不改 XML。PDF 临时导出通过后才替换目标，源图前后哈希必须一致。检查 PDF 文件头仅排除明显失败，不能证明图或公式可见；另外用已有 PDF 渲染器检查每页，并在临时 LaTeX 中按预期尺寸 includegraphics 验收。缺少 Desktop 时仍可写源图，明确报告未导出，禁止制作占位 PDF。

baseline 在图目录的 `baselines/` 保存带时间与哈希的源文件及已有 notes/PDF。它是更新前的快照，不是锁。跨设备同步冲突必须保留另一个版本后处理。open 成功仅表示进程已发起；无 UI 证据则打开显示和交互编辑待人工确认。
