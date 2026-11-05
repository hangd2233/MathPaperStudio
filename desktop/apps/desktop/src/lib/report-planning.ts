import { getMupdfClient } from "@/lib/mupdf/mupdf-client";

export interface ReportPage {
  page: number;
  text: string;
  status: "readable" | "empty" | "failed";
}
export interface ReportSource {
  id: string;
  name: string;
  path: string;
  byteSize: number;
  pages: ReportPage[];
  warnings: string[];
}
export interface ReportCitation {
  sourceId: string;
  page: number;
  section: string;
}
export interface MainlineOption {
  id: string;
  title: string;
  coreQuestion: string;
  usableResults: string[];
  tradeoffs: string[];
  gaps: string[];
  sources: ReportCitation[];
}
export interface OutlineClaim {
  label: string;
  kind: string;
  status: string;
  statement: string;
  proofSteps: string[];
  dependsOn: string[];
  sources: ReportCitation[];
  openQuestions: string[];
}
export interface OutlineSection {
  level?: "section" | "subsection";
  parentId?: string;
  id: string;
  title: string;
  purpose: string;
  claims: OutlineClaim[];
  proofSteps: string[];
  dependencies: string[];
  sources: ReportCitation[];
  openQuestions: string[];
}
export interface PaperOutline {
  title: string;
  mainline: string;
  sections: OutlineSection[];
  limitations: string[];
  noveltyStatus: string;
}
export interface PlanningRun {
  id: string;
  kind: "themes" | "outline" | "macros";
  state: string;
  inputDigest: string;
  createdAt: string;
  outlineRun?: string;
  result?:
    | import("@/components/workspace/macro-proposals").MacroList
    | PaperOutline
    | { options: MainlineOption[]; limitations: string[] };
  raw: string;
  error?: string;
}
export interface PlanningData {
  reports: ReportSource[];
  requirements: string;
  mainline: string;
  selectionConfirmed: boolean;
  options: MainlineOption[];
  runs: PlanningRun[];
  applied: {
    runId: string;
    path: string;
    macroRun?: string;
    macroPath?: string;
  }[];
  storageHeads: string[];
  storageStatus: string;
  inputDigest: string;
  mode: string;
}
export interface HeadingsPreview {
  runId: string;
  path: string;
  latex: string;
  previewDigest: string;
  outline: PaperOutline;
}

export function parseEditableOutline(raw: string): PaperOutline {
  const value = JSON.parse(raw) as PaperOutline;
  const strings = (x: unknown): x is string[] =>
    Array.isArray(x) && x.every((s) => typeof s === "string");
  const citations = (x: unknown): boolean =>
    Array.isArray(x) &&
    x.every(
      (c) =>
        c &&
        typeof c.sourceId === "string" &&
        Number.isInteger(c.page) &&
        typeof c.section === "string",
    );
  if (
    !value ||
    typeof value.title !== "string" ||
    typeof value.mainline !== "string" ||
    !strings(value.limitations) ||
    typeof value.noveltyStatus !== "string" ||
    !Array.isArray(value.sections) ||
    !value.sections.every(
      (s) =>
        s &&
        typeof s.id === "string" &&
        typeof s.id === "string" &&
        (s.level === undefined ||
          s.level === "section" ||
          s.level === "subsection") &&
        typeof s.title === "string" &&
        typeof s.purpose === "string" &&
        strings(s.proofSteps) &&
        strings(s.dependencies) &&
        strings(s.openQuestions) &&
        citations(s.sources) &&
        Array.isArray(s.claims) &&
        s.claims.every(
          (c) =>
            c &&
            typeof c.label === "string" &&
            typeof c.kind === "string" &&
            typeof c.status === "string" &&
            typeof c.statement === "string" &&
            strings(c.proofSteps) &&
            strings(c.dependsOn) &&
            strings(c.openQuestions) &&
            citations(c.sources),
        ),
    )
  )
    throw new Error(
      "大纲结构不完整；保留原大纲，请检查节、结果、来源及数组字段。",
    );
  let parent: string | undefined;
  for (const section of value.sections) {
    if ((section.level ?? "section") === "section") {
      if (section.parentId != null) throw new Error("一级章节不能指定父章节。");
      parent = section.id;
    } else if (!section.parentId || section.parentId !== parent) {
      throw new Error("小节必须紧随其所属一级章节，并引用该章节 ID。");
    }
  }
  return value;
}

export async function extractReport(
  bytes: Uint8Array,
  progress?: (page: number, total: number) => void,
  cancelled: () => boolean = () => false,
): Promise<ReportPage[]> {
  if (
    bytes.byteLength > 20_000_000 ||
    new TextDecoder().decode(bytes.slice(0, 5)) !== "%PDF-"
  )
    throw new Error("请选择小于 20 MB 的 PDF。");
  const client = getMupdfClient();
  const timed = async <T>(work: Promise<T>): Promise<T> => {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        work,
        new Promise<T>((_, reject) => {
          timeout = setTimeout(
            () => reject(new Error("PDF 解析超时；未声称读取完整。")),
            35_000,
          );
        }),
      ]);
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  };
  const document = await timed(
    client.openDocument(bytes.slice().buffer as ArrayBuffer),
  );
  try {
    const count = await timed(client.countPages(document));
    if (count < 1 || count > 200)
      throw new Error("PDF 必须包含 1–200 页；请拆分较大的报告。");
    const pages: ReportPage[] = [];
    let total = 0;
    for (let i = 0; i < count; i++) {
      if (cancelled()) throw new Error("PDF 导入已取消；未提交解析结果。");
      progress?.(i + 1, count);
      try {
        const data = await timed(client.getPageText(document, i));
        if (cancelled()) throw new Error("PDF 导入已取消；未提交解析结果。");
        const text = data.blocks
          .flatMap((b) => b.lines?.map((l) => l.text) ?? [])
          .join("\n");
        total += text.length;
        if (total > 300_000) throw new Error("报告提取文本过大，请拆分材料。");
        pages.push({
          page: i + 1,
          text,
          status: text.replace(/\s/g, "").length < 40 ? "empty" : "readable",
        });
      } catch (error) {
        if (cancelled() || String(error).includes("文本过大")) throw error;
        pages.push({ page: i + 1, text: "", status: "failed" });
      }
    }
    return pages;
  } finally {
    await client.closeDocument(document).catch(() => {});
  }
}

export function compareOutlines(
  previous: PaperOutline | undefined,
  next: PaperOutline,
): string[] {
  if (!previous) return ["First complete outline version."];
  const before = new Set(previous.sections.map((s) => s.title));
  const after = new Set(next.sections.map((s) => s.title));
  return [
    previous.mainline === next.mainline
      ? "Mainline retained."
      : "Mainline changed.",
    ...next.sections
      .filter((s) => !before.has(s.title))
      .map((s) => `Added/revised: ${s.title}`),
    ...next.sections
      .filter((s) => {
        const old = previous.sections.find((p) => p.id === s.id);
        return (
          old &&
          ((old.level ?? "section") !== (s.level ?? "section") ||
            old.parentId !== s.parentId)
        );
      })
      .map(
        (s) =>
          `Hierarchy changed: ${s.title} (${s.level ?? "section"}${s.parentId ? ` under ${s.parentId}` : ""})`,
      ),
    ...previous.sections
      .filter((s) => !after.has(s.title))
      .map((s) => `Removed/replaced: ${s.title}`),
  ];
}

export function outlineLabels(sections: OutlineSection[]): string[] {
  let major = 0,
    minor = 0;
  return sections.map((section) => {
    if (section.level === "subsection") return `${major}.${++minor}`;
    minor = 0;
    return `${++major}`;
  });
}
