import { EditorState, Transaction } from "@codemirror/state";
import { isolateHistory } from "@codemirror/commands";
import { EditorView } from "@codemirror/view";

export interface MathTemplate {
  id: string;
  name: string;
  category: string;
  keywords: string;
  latex: string;
  requires: string;
}
export interface SymbolLibrary {
  templates: MathTemplate[];
  favorites: string[];
  recent: string[];
}
export const emptyLibrary = (): SymbolLibrary => ({
  templates: [],
  favorites: [],
  recent: [],
});
const item = (
  id: string,
  name: string,
  category: string,
  latex: string,
  keywords = "",
  requires = "LaTeX core",
): MathTemplate => ({ id, name, category, latex, keywords, requires });
export const mathTemplates: MathTemplate[] = [
  ...[
    ["alpha", "α 阿尔法"],
    ["beta", "β 贝塔"],
    ["gamma", "γ 伽马"],
    ["delta", "δ 德尔塔"],
    ["epsilon", "ϵ 艾普西龙"],
    ["varepsilon", "ε 变体"],
    ["theta", "θ 西塔"],
    ["lambda", "λ 兰姆达"],
    ["mu", "μ 缪"],
    ["pi", "π 派"],
    ["sigma", "σ 西格玛"],
    ["phi", "ϕ 斐"],
    ["varphi", "φ 变体"],
    ["omega", "ω 欧米伽"],
    ["Gamma", "Γ 大写"],
    ["Delta", "Δ 大写"],
    ["Theta", "Θ 大写"],
    ["Sigma", "Σ 大写"],
    ["Omega", "Ω 大写"],
  ].map(([id, n]) =>
    item(id, n, "希腊字母 Greek", `\\${id}`, `Greek 希腊 ${id}`),
  ),
  ...[
    ["leq", "≤ 小于等于"],
    ["geq", "≥ 大于等于"],
    ["neq", "≠ 不等于"],
    ["equiv", "≡ 恒等"],
    ["cong", "≅ 同构"],
    ["sim", "∼ 等价"],
    ["approx", "≈ 约等于"],
    ["times", "× 乘积"],
    ["otimes", "⊗ 张量积"],
    ["oplus", "⊕ 直和"],
    ["cdot", "· 点乘"],
    ["pm", "± 正负"],
  ].map(([id, n]) => item(id, n, "关系与运算 Relations", `\\${id}`, id)),
  ...[
    ["in", "∈ 属于"],
    ["notin", "∉ 不属于"],
    ["subseteq", "⊆ 子集"],
    ["cup", "∪ 并集"],
    ["cap", "∩ 交集"],
    ["setminus", "∖ 差集"],
    ["emptyset", "∅ 空集"],
    ["forall", "∀ 任意"],
    ["exists", "∃ 存在"],
    ["neg", "¬ 非"],
    ["land", "∧ 且"],
    ["lor", "∨ 或"],
  ].map(([id, n]) => item(id, n, "集合与逻辑 Sets", `\\${id}`, id)),
  ...[
    ["to", "→ 映射"],
    ["mapsto", "↦ 映到"],
    ["hookrightarrow", "↪ 单射"],
    ["twoheadrightarrow", "↠ 满射"],
    ["Rightarrow", "⇒ 蕴含"],
    ["Longleftrightarrow", "⇔ 当且仅当"],
  ].map(([id, n]) =>
    item(
      id,
      n,
      "箭头 Arrows",
      `\\${id}`,
      id,
      id === "twoheadrightarrow" ? "amssymb" : "LaTeX core",
    ),
  ),
  item(
    "fraction",
    "分式 Fraction",
    "结构 Structures",
    "\\frac{ {{numerator}} }{ {{denominator}} }",
    "frac division 除法",
  ),
  item(
    "sqrt",
    "根式 Root",
    "结构 Structures",
    "\\sqrt{ {{radicand}} }",
    "square root",
  ),
  item(
    "power",
    "上标 Superscript",
    "结构 Structures",
    "{{base}}^{ {{exponent}} }",
    "power",
  ),
  item(
    "subscript",
    "下标 Subscript",
    "结构 Structures",
    "{{base}}_{ {{index}} }",
  ),
  item(
    "set",
    "集合构造 Set builder",
    "集合与逻辑 Sets",
    "\\{ {{x}} \\mid {{condition}} \\}",
  ),
  item(
    "sum",
    "求和 Sum",
    "求和与积分 Calculus",
    "\\sum_{ {{i=1}} }^{ {{n}} } {{term}}",
  ),
  item(
    "prod",
    "连乘 Product",
    "求和与积分 Calculus",
    "\\prod_{ {{i=1}} }^{ {{n}} } {{term}}",
  ),
  item(
    "integral",
    "积分 Integral",
    "求和与积分 Calculus",
    "\\int_{ {{a}} }^{ {{b}} } {{f(x)}}\\,\\mathrm{d}x",
  ),
  item(
    "limit",
    "极限 Limit",
    "求和与积分 Calculus",
    "\\lim_{ {{x\\to 0}} } {{f(x)}}",
  ),
  item(
    "matrix",
    "矩阵 Matrix",
    "矩阵与分段 Matrices",
    "\\begin{pmatrix} {{a}} & {{b}} \\\\ {{c}} & {{d}} \\end{pmatrix}",
    "matrix 矩阵",
    "amsmath",
  ),
  item(
    "cases",
    "分段 Cases",
    "矩阵与分段 Matrices",
    "\\begin{cases} {{f(x)}} & {{condition}} \\\\ {{g(x)}} & {{otherwise}} \\end{cases}",
    "piecewise 分段",
    "amsmath",
  ),
  ...["C", "Q", "R", "Z", "N"].map((n) =>
    item(
      `field-${n}`,
      `${n} 数域 Field`,
      "代数几何 Geometry",
      `\\mathbb{${n}}`,
      "number field 数域",
      "amsfonts or amssymb",
    ),
  ),
  item(
    "sheaf",
    "结构层 Structure sheaf",
    "代数几何 Geometry",
    "\\mathcal{O}_{ {{X}} }",
    "sheaf 层",
  ),
  item(
    "canonical",
    "典范层 Canonical sheaf",
    "代数几何 Geometry",
    "\\omega_{ {{X}} }",
    "canonical",
  ),
  item(
    "cohomology",
    "上同调 Cohomology",
    "代数几何 Geometry",
    "H^{ {{i}} }({{X}},{{\\mathcal{F}}})",
    "cohomology",
  ),
  item(
    "spec",
    "仿射谱 Spectrum",
    "代数几何 Geometry",
    "\\operatorname{Spec}({{A}})",
    "spectrum spec",
    "amsmath",
  ),
  item(
    "proj",
    "射影谱 Proj",
    "代数几何 Geometry",
    "\\operatorname{Proj}({{S}})",
    "projective",
    "amsmath",
  ),
  item(
    "hom",
    "态射 Hom",
    "代数几何 Geometry",
    "\\operatorname{Hom}({{X}},{{Y}})",
    "morphism 态射",
    "amsmath",
  ),
  item(
    "pic",
    "Picard 群",
    "代数几何 Geometry",
    "\\operatorname{Pic}({{X}})",
    "picard",
    "amsmath",
  ),
  item(
    "divisor",
    "除子 Divisor",
    "代数几何 Geometry",
    "{{D}} \\sim_{\\mathbb{Q}} {{K_X}}",
    "divisor rational linear equivalence",
    "amsfonts or amssymb",
  ),
];
export function searchTemplates(items: MathTemplate[], query: string) {
  const words = query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
  return items.filter((t) =>
    words.every((w) =>
      `${t.name} ${t.category} ${t.keywords} ${t.latex} ${t.id}`
        .toLocaleLowerCase()
        .includes(w),
    ),
  );
}
export const previewLatex = (latex: string) =>
  latex.replace(/\{\{(.*?)\}\}/gs, "$1");
// Common TeX math delimiters/environments. Ignore comments, escaped dollars and verbatim.
export function mathContext(text: string): boolean {
  let math = false;
  let delimiter = "";
  const tokens =
    /%[^\n]*|\\verb\*?([^a-zA-Z\s])[\s\S]*?\1|\\begin\{(verbatim\*?|lstlisting|minted)\}[\s\S]*?\\end\{\2\}|\\begin\{((?:equation|align|alignat|gather|multline|flalign|displaymath|math)\*?)\}|\\end\{((?:equation|align|alignat|gather|multline|flalign|displaymath|math)\*?)\}|\\\(|\\\)|\\\[|\\\]|\\[\s\S]|\$\$|\$/g;
  for (const match of text.matchAll(tokens)) {
    const t = match[0];
    if (t.startsWith("%") || t.startsWith("\\verb") || match[2]) continue;
    if (match[3]) {
      math = true;
      delimiter = "environment";
    } else if (match[4]) {
      math = false;
      delimiter = "";
    } else if (t === "\\(" || t === "\\[") {
      math = true;
      delimiter = t;
    } else if (t === "\\)" || t === "\\]") {
      math = false;
      delimiter = "";
    } else if (t === "$" || t === "$$") {
      if (!math) {
        math = true;
        delimiter = t;
      } else if (delimiter === t) {
        math = false;
        delimiter = "";
      }
    }
  }
  return math;
}
export type InsertionMode = "auto" | "raw" | "inline" | "display";
export function symbolInsertion(
  state: EditorState,
  template: MathTemplate,
  mode: InsertionMode,
) {
  const { from, to } = state.selection.main;
  let selected = state.sliceDoc(from, to);
  const inside = mathContext(state.sliceDoc(0, from));
  if (mode !== "raw" && inside !== mathContext(state.sliceDoc(0, to)))
    throw new Error("选区跨越数学模式边界，请缩小选区或明确选择原始源码。");
  if (mode !== "raw")
    selected = selected
      .replace(/^\$([^$]*)\$$/s, "$1")
      .replace(/^\\\(([\s\S]*)\\\)$/, "$1");
  let first = true,
    anchor = 0,
    head = 0;
  let rendered = "";
  let last = 0;
  for (const m of template.latex.matchAll(/\{\{(.*?)\}\}/gs)) {
    rendered += template.latex.slice(last, m.index);
    const v = first && selected ? selected : m[1];
    if (first) {
      anchor = rendered.length;
      head = anchor + v.length;
    }
    rendered += v;
    first = false;
    last = m.index! + m[0].length;
  }
  rendered += template.latex.slice(last);
  if (first) {
    anchor = head = rendered.length;
  }
  let prefix = "",
    suffix = "";
  if (mode !== "raw" && !inside) {
    prefix = mode === "display" ? "\\[\n" : "$";
    suffix = mode === "display" ? "\n\\]" : "$";
  }
  // A following letter would merge with a bare control word, e.g. \\alpha x.
  if (
    !suffix &&
    /\\[a-zA-Z]+$/.test(rendered) &&
    /^[a-zA-Z]/.test(state.sliceDoc(to, to + 1))
  ) {
    rendered += "{}";
    if (first) anchor = head = rendered.length;
  }
  return {
    changes: { from, to, insert: prefix + rendered + suffix },
    selection: {
      anchor: from + prefix.length + anchor,
      head: from + prefix.length + head,
    },
    annotations: [
      Transaction.userEvent.of("input.symbol"),
      isolateHistory.of("full"),
    ],
  };
}
export function insertSymbol(
  view: EditorView,
  template: MathTemplate,
  mode: InsertionMode,
) {
  if (view.state.readOnly || !view.state.facet(EditorView.editable))
    throw new Error("当前文档只读，不能插入。");
  view.dispatch(symbolInsertion(view.state, template, mode));
  view.focus();
}
