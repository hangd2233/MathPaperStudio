/** Adapt TeX delimiters before Markdown consumes their backslashes.
 * Code fences and inline code remain literal, including copied LaTeX examples.
 */
export function normalizeChatMath(text: string): string {
  return text.replace(/(`+)[\s\S]*?\1|(^|\n)(~{3,})[^\n]*\n[\s\S]*?\n\3[^\n]*|\\\(([\s\S]*?)\\\)|\\\[([\s\S]*?)\\\]/g,
    (whole, code, fenceStart, fence, inline, display) => {
      if (code || fence) return whole;
      if (inline !== undefined) return `$${inline.trim()}$`;
      if (display !== undefined) return `\n\n$$\n${display.trim()}\n$$\n\n`;
      return whole;
    });
}
