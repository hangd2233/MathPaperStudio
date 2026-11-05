import { describe, expect, it, vi, beforeEach } from "vitest";
const client = vi.hoisted(() => ({
  openDocument: vi.fn(),
  closeDocument: vi.fn(),
  countPages: vi.fn(),
  getPageText: vi.fn(),
}));
vi.mock("@/lib/mupdf/mupdf-client", () => ({ getMupdfClient: () => client }));
import {
  extractReport,
  parseEditableOutline,
  outlineLabels,
  compareOutlines,
} from "@/lib/report-planning";

describe("report PDF extraction", () => {
  it("rejects incomplete user-edited outline structures before rendering them", () => {
    expect(() => parseEditableOutline("{}")).toThrow("大纲结构不完整");
    expect(() => parseEditableOutline('{"sections":[null]}')).toThrow();
  });
  beforeEach(() => {
    vi.clearAllMocks();
    client.openDocument.mockResolvedValue(1);
    client.closeDocument.mockResolvedValue(undefined);
    client.countPages.mockResolvedValue(3);
  });
  it("retains exact page order and marks scanned/failed pages without claiming OCR", async () => {
    client.getPageText
      .mockResolvedValueOnce({
        blocks: [
          {
            lines: [
              {
                text: "A readable research statement with hypotheses, proof and enough text.",
              },
            ],
          },
        ],
      })
      .mockResolvedValueOnce({ blocks: [] })
      .mockRejectedValueOnce(new Error("broken page"));
    const pages = await extractReport(
      new TextEncoder().encode("%PDF-1.4 synthetic fixture"),
    );
    expect(pages.map((p) => [p.page, p.status])).toEqual([
      [1, "readable"],
      [2, "empty"],
      [3, "failed"],
    ]);
    expect(pages[1].text).toBe("");
    expect(client.closeDocument).toHaveBeenCalledWith(1);
  });
  it("stops after an in-flight page resolves following cancellation and releases the document", async () => {
    let cancelled = false;
    client.getPageText.mockImplementationOnce(async () => {
      cancelled = true;
      return { blocks: [] };
    });
    await expect(
      extractReport(
        new TextEncoder().encode("%PDF-fixture"),
        undefined,
        () => cancelled,
      ),
    ).rejects.toThrow("已取消");
    expect(client.getPageText).toHaveBeenCalledTimes(1);
    expect(client.closeDocument).toHaveBeenCalledWith(1);
  });
  it("rejects non-PDF, malformed input and excessive page counts", async () => {
    await expect(
      extractReport(new TextEncoder().encode("plain text")),
    ).rejects.toThrow("PDF");
    client.openDocument.mockRejectedValueOnce(new Error("invalid xref"));
    await expect(
      extractReport(new TextEncoder().encode("%PDF-broken")),
    ).rejects.toThrow("invalid xref");
    client.countPages.mockResolvedValueOnce(201);
    await expect(
      extractReport(new TextEncoder().encode("%PDF-test")),
    ).rejects.toThrow("200");
    expect(client.closeDocument).toHaveBeenCalled();
  });
});

it("numbers broad chapters and subsections and reports reparenting", () => {
  const sections: any[] = [
    { id: "intro", title: "Introduction", level: "section" },
    { id: "scope", title: "Scope", level: "subsection", parentId: "intro" },
    { id: "prelim", title: "Preliminaries", level: "section" },
    {
      id: "data",
      title: "Group data",
      level: "subsection",
      parentId: "prelim",
    },
  ];
  expect(outlineLabels(sections)).toEqual(["1", "1.1", "2", "2.1"]);
  expect(outlineLabels(sections.map(({ level, parentId, ...s }) => s))).toEqual(
    ["1", "2", "3", "4"],
  );
  const old: any = { sections, mainline: "Same" };
  const changed: any = {
    ...old,
    sections: sections.map((s) =>
      s.id === "scope" ? { ...s, parentId: "prelim" } : s,
    ),
  };
  expect(compareOutlines(old, changed).join(" ")).toContain(
    "Hierarchy changed: Scope",
  );
});
