import { useDocumentStore } from "@/stores/document-store";
import { useAgentChatStore } from "@/stores/agent-chat-store";
import { openProjectFile } from "@/lib/project-file-links";

type File = { id: string; relativePath: string };
export function paperEntries(files: File[]) {
  return files.filter(f => /(^|\/)main\.tex$/.test(f.relativePath) &&
    !f.relativePath.split("/").some(p => ["imports","releases","baselines","tests","third_party",".prism",".codexprism"].includes(p)));
}
export function mapsForPaper(files: File[], main: string) {
  const directory = main.slice(0, -"main.tex".length) + "working/proof-maps/";
  return files.filter(f => f.relativePath.startsWith(directory) &&
    !f.relativePath.slice(directory.length).includes("/") && f.relativePath.endsWith(".pdf"))
    .sort((a,b) => {
      const stamp = (p:string) => p.match(/\d{8}T\d{9}Z/)?.[0] ?? "";
      return stamp(b.relativePath).localeCompare(stamp(a.relativePath)) || b.relativePath.localeCompare(a.relativePath, undefined, {numeric:true});
    });
}

export function proofMapPrompt(main: string, mode: "dependency" | "route", theorem: string, previous?: string, now = new Date()) {
  if (!main.endsWith("main.tex") || main.split("/").some(p => p === "..")) throw new Error("请选择论文 main.tex");
  if (mode === "route" && !theorem.trim()) throw new Error("请填写定理编号或 LaTeX label");
  const prefix = main.slice(0,-"main.tex".length);
  const stamp = now.toISOString().replace(/[-:.]/g, "");
  const output = `${prefix}working/proof-maps/${mode}-${stamp}`;
  return [
    "$draw-proof-map",
    `用户明确请求为当前论文 ${JSON.stringify(main)} ${previous ? "更新" : "绘制"}证明图。`,
    mode === "dependency" ? "模式 A：全文证明依赖概览，复杂部分拆为局部图。" : `模式 B：单定理证明路线；指定结果：${JSON.stringify(theorem.trim())}。`,
    previous ? `参考原图 ${JSON.stringify(previous.replace(/\.pdf$/, ".drawio"))} 及同名 notes。先读取并保存 baseline，将原图复制为新版本后最小修改，保留人工布局、连线和文字；发现与当前正文冲突时记录，不静默覆盖。` : "先完整读取所画结果及必要依赖，再提取关系，不根据摘要或旧地图猜测。",
    `新的交付文件基名为 ${JSON.stringify(output)}：.drawio、.pdf、-notes.md。若已存在，另选唯一版本，保留全部历史。`,
    "以当前正文为准重新核对范围、编号、假设、证明依赖及来源指纹；PROOF_MAP.md 只作定位线索。使用本地 draw.io Desktop 导出并检查 PDF，保留独立可编辑源图。",
    "保留/更新图到论文 PDF 正文的定位链接：只链接与当前正文匹配且实际核对过位置的 PDF，含版本指纹；无法核实时标明待确认，不沿用过期坐标。",
    "论文、范文、imports 和研究报告均不修改、不扫描；不启动子代理、嵌套 Codex 或额外模型。沿用项目现有 draw-proof-map 技能及本地参考，不重装或改变全局配置。",
    "完成后报告新图路径、实际检查与未验证项，更新本论文 CONTINUE 和本轮 comparison 后停止。此请求只绘图，不修改论文。",
  ].join("\n\n");
}

let generationPending = false;

export async function generateProofMap(main: string, mode: "dependency" | "route", theorem: string, previous?: string) {
  const chat = useAgentChatStore.getState();
  if (generationPending || chat.isStreaming || chat.review.active) throw new Error("请等待当前任务完成后再生成证明图");
  if (!useDocumentStore.getState().projectRoot) throw new Error("请先打开论文项目");
  generationPending = true;
  try {
    await chat.sendPrompt(proofMapPrompt(main, mode, theorem, previous));
    const error = useAgentChatStore.getState().error;
    if (error) throw new Error(error);
  } finally {
    generationPending = false;
  }
}

export async function showProofMap(path: string) {
  const state = useDocumentStore.getState();
  if (!state.projectRoot) throw new Error("请先打开论文项目");
  await state.refreshFiles();
  const current = useDocumentStore.getState();
  if (current.projectRoot !== state.projectRoot) return;
  const file = current.files.find(f => f.relativePath === path);
  if (!file) throw new Error("未找到证明图 PDF，请先生成或刷新列表");
  openProjectFile(file.id);
}
