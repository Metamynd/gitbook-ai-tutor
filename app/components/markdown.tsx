import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

// Renders assistant responses as formatted markdown instead of raw text —
// the LLM writes headings/lists/code fences, and a plain whitespace-pre-wrap
// div was showing that markup literally instead of rendering it.
export function Markdown({ children }: { children: string }) {
  return (
    <div className="space-y-3 text-sm text-brand-slate [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: (p) => <h1 className="text-base font-semibold text-brand-slate" {...p} />,
          h2: (p) => <h2 className="text-base font-semibold text-brand-slate" {...p} />,
          h3: (p) => <h3 className="text-sm font-semibold text-brand-slate" {...p} />,
          p: (p) => <p className="leading-relaxed" {...p} />,
          ul: (p) => <ul className="list-disc space-y-1 pl-5" {...p} />,
          ol: (p) => <ol className="list-decimal space-y-1 pl-5" {...p} />,
          li: (p) => <li className="leading-relaxed" {...p} />,
          strong: (p) => <strong className="font-semibold text-brand-slate" {...p} />,
          a: (p) => (
            <a
              {...p}
              target="_blank"
              rel="noreferrer"
              className="text-[#6366F1] underline decoration-[#6366F1]/30 underline-offset-2 hover:decoration-[#6366F1]"
            />
          ),
          blockquote: (p) => (
            <blockquote className="border-l-2 border-[#6366F1]/40 pl-3 text-gray-600" {...p} />
          ),
          hr: () => <hr className="border-black/5" />,
          table: (p) => (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-xs" {...p} />
            </div>
          ),
          th: (p) => <th className="border border-gray-200 bg-gray-50 px-2 py-1 text-left font-medium" {...p} />,
          td: (p) => <td className="border border-gray-200 px-2 py-1" {...p} />,
          code: ({ className, children, ...rest }) => {
            const isBlock = /language-/.test(className ?? "");
            if (isBlock) {
              return (
                <code className={`${className ?? ""} font-mono text-xs`} {...rest}>
                  {children}
                </code>
              );
            }
            return (
              <code className="rounded bg-gray-100 px-1 py-0.5 font-mono text-[0.85em] text-brand-slate" {...rest}>
                {children}
              </code>
            );
          },
          pre: (p) => (
            <pre className="overflow-x-auto rounded-xl bg-gradient-brand-dark p-3 text-gray-100" {...p} />
          ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
