import "katex/dist/katex.min.css";
import { normalizeChatMath } from "@/lib/chat-math";
import { memo } from "react";
import ReactMarkdown from "react-markdown";
import { openProjectLink, projectUrlTransform } from "@/lib/project-file-links";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { cn } from "@/lib/utils";
import type { ChatItem } from "@/stores/agent-chat-store";
import { toast } from "sonner";

export const Message = memo(function Message({ item: m }: { item: ChatItem }) {
  if (m.type !== "agentMessage" && m.type !== "userMessage") return null;
  return (
    <article
      className={cn(
        "text-sm leading-relaxed",
        m.type === "userMessage"
          ? "ml-auto w-fit max-w-[90%] rounded-2xl rounded-br-md bg-muted px-3.5 py-2.5"
          : m.phase === "commentary"
            ? "min-w-0 px-1 text-muted-foreground"
            : "min-w-0 px-1 text-foreground",
      )}
      aria-label={m.type === "userMessage" ? "You" : "Codex"}
    >
      <div className="break-words [&_p]:my-2 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0 [&_pre]:my-2 [&_pre]:overflow-auto [&_pre]:rounded-lg [&_pre]:bg-muted [&_pre]:p-3 [&_code]:font-mono [&_code]:text-xs [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_a]:underline [&_h1]:font-semibold [&_h2]:font-semibold [&_h3]:font-semibold">
        <ReactMarkdown
          remarkPlugins={[remarkGfm, remarkMath]}
          rehypePlugins={[rehypeKatex]}
          urlTransform={projectUrlTransform}
          components={{
            a: ({ href, children }) => (
              <a href={href} onClick={(event) => {
                event.preventDefault();
                void openProjectLink(href ?? "").catch((error) => toast.error(String(error)));
              }}>{children}</a>
            ),
          }}
        >
          {normalizeChatMath(m.text)}
        </ReactMarkdown>
      </div>
    </article>
  );
});
