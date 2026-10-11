import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

// react-markdown escapes raw HTML by default, so member-written debriefs and
// SOPs can't inject markup.
export function Markdown({ children }: { children: string }) {
  return (
    <div className="prose-tac">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{children}</ReactMarkdown>
    </div>
  );
}
