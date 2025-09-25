import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

const fixBold = (text: string) =>
  // ① **xxx**yyy → **xxx** yyy
  text.replace(/\*\*(.+?)\*\*(?=\w)/g, "**$1** ")
      // ② yyy**xxx** → yyy **xxx**
      .replace(/(\w)(\*\*.+?\*\*)/g, "$1 $2");

export function ChatMessage({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        p: ({ children }) => <span>{children}</span>,
        strong: ({ children }) => <strong className="font-bold">{children}</strong>,
        em: ({ children }) => <em className="italic">{children}</em>,
        a: ({ href, children }) => (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 hover:text-blue-800 underline"
          >
            {children}
          </a>
        ),
      }}
    >
      {fixBold(content)}
    </ReactMarkdown>
  );
}
