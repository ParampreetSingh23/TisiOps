import ReactMarkdown, { type Components } from "react-markdown"
import remarkGfm from "remark-gfm"

/**
 * Renders assistant replies. react-markdown ignores raw HTML by default, so
 * model output cannot inject markup — do not add rehype-raw here.
 */
const components: Components = {
  p: ({ children }) => <p className="my-2 first:mt-0 last:mb-0">{children}</p>,
  h1: ({ children }) => (
    <h3 className="mt-4 mb-2 text-base font-semibold tracking-[-0.01em] text-ink-strong first:mt-0">
      {children}
    </h3>
  ),
  h2: ({ children }) => (
    <h3 className="mt-4 mb-2 text-base font-semibold tracking-[-0.01em] text-ink-strong first:mt-0">
      {children}
    </h3>
  ),
  h3: ({ children }) => (
    <h4 className="mt-4 mb-1.5 text-sm font-semibold tracking-[-0.01em] text-ink-strong first:mt-0">
      {children}
    </h4>
  ),
  h4: ({ children }) => (
    <h5 className="mt-3 mb-1.5 text-sm font-semibold text-ink-strong first:mt-0">
      {children}
    </h5>
  ),
  strong: ({ children }) => (
    <strong className="font-semibold text-ink-strong">{children}</strong>
  ),
  em: ({ children }) => <em className="italic">{children}</em>,
  ul: ({ children }) => (
    <ul className="my-2 list-disc space-y-1 pl-5 marker:text-ink-muted">
      {children}
    </ul>
  ),
  ol: ({ children }) => (
    <ol className="my-2 list-decimal space-y-1 pl-5 marker:text-ink-muted">
      {children}
    </ol>
  ),
  li: ({ children }) => <li className="pl-0.5">{children}</li>,
  a: ({ children, href }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-brand underline underline-offset-2 hover:text-brand-hover"
    >
      {children}
    </a>
  ),
  blockquote: ({ children }) => (
    <blockquote className="my-2 border-l-2 border-line-warm pl-3 text-ink-muted">
      {children}
    </blockquote>
  ),
  hr: () => <hr className="my-4 border-line" />,
  code: ({ className, children }) => {
    // Fenced blocks carry a language class; inline code does not.
    const isBlock =
      typeof className === "string" && className.includes("language-")

    if (isBlock) {
      return (
        <code className="block font-mono text-xs leading-relaxed">
          {children}
        </code>
      )
    }

    return (
      <code className="rounded-[4px] border border-line bg-canvas px-1.5 py-0.5 font-mono text-[0.8em] text-ink-strong">
        {children}
      </code>
    )
  },
  pre: ({ children }) => (
    <pre className="my-3 scrollbar-subtle overflow-x-auto rounded-[6px] border border-line bg-canvas px-3.5 py-3 text-ink-strong">
      {children}
    </pre>
  ),
  table: ({ children }) => (
    <div className="my-3 scrollbar-subtle overflow-x-auto">
      <table className="w-full border-collapse text-left text-sm">
        {children}
      </table>
    </div>
  ),
  th: ({ children }) => (
    <th className="border-b border-line py-1.5 pr-4 font-semibold text-ink-strong">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="border-b border-line py-1.5 pr-4 align-top">{children}</td>
  ),
}

export function Markdown({ children }: { children: string }) {
  const safe = children
    .replace(/<svg[\s\S]*?<\/svg>/gi, "")
    .replace(/^\s*(?:svg\s*)+$/gim, "")

  return (
    <div className="text-sm leading-relaxed text-ink-default">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {safe}
      </ReactMarkdown>
    </div>
  )
}
