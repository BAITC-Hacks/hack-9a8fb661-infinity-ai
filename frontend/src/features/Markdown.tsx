import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

/** Ответ агента: заголовки, списки, жирный, таблицы — аккуратно, в стиле интерфейса. */
export function Markdown({ text }: { text: string }) {
  return (
    <div className="md space-y-2 text-[15px] leading-relaxed">
      <ReactMarkdown remarkPlugins={[remarkGfm]}
        components={{
          h1: (p) => <h3 className="text-[16px] font-semibold" {...p} />,
          h2: (p) => <h3 className="text-[16px] font-semibold" {...p} />,
          h3: (p) => <h4 className="text-[15px] font-semibold" {...p} />,
          p: (p) => <p {...p} />,
          ul: (p) => <ul className="list-disc space-y-1 pl-5 marker:text-blue" {...p} />,
          ol: (p) => <ol className="list-decimal space-y-1 pl-5 marker:text-mute" {...p} />,
          strong: (p) => <strong className="font-semibold text-text" {...p} />,
          code: (p) => <code className="rounded bg-sunk px-1 py-0.5 font-mono text-[13px]" {...p} />,
          table: (p) => <div className="scroll-thin overflow-x-auto rounded-lg border border-line"><table className="num w-full text-[13px]" {...p} /></div>,
          thead: (p) => <thead className="bg-sunk text-[11px] uppercase tracking-wider text-mute" {...p} />,
          th: (p) => <th className="border-b border-line px-3 py-1.5 text-left font-medium" {...p} />,
          td: (p) => <td className="border-b border-line/50 px-3 py-1.5" {...p} />,
          hr: () => <hr className="border-line" />,
          blockquote: (p) => <blockquote className="border-l-2 border-warn pl-3 text-mute" {...p} />,
        }}>{text.trim()}</ReactMarkdown>
    </div>
  )
}
