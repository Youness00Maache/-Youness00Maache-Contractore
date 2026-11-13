import React from 'react';
import { Link } from 'react-router-dom';

/**
 * Tiny, safe Markdown-subset renderer for blog content (see content/blog/types.ts).
 * Produces React elements only (no innerHTML), deterministic on server and client.
 */

export const slugify = (text: string): string =>
  text
    .toLowerCase()
    .replace(/\*\*|\*/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[’'"]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);

const INLINE_RE = /(\*\*[^*]+\*\*|\[[^\]]+\]\([^)\s]+\)|\*[^*\s][^*]*?\*)/g;

export function renderInline(text: string, keyPrefix = 'i'): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  let last = 0;
  let idx = 0;
  for (const match of text.matchAll(INLINE_RE)) {
    const token = match[0];
    const start = match.index ?? 0;
    if (start > last) out.push(text.slice(last, start));
    const key = `${keyPrefix}-${idx++}`;
    if (token.startsWith('**')) {
      out.push(<strong key={key}>{renderInline(token.slice(2, -2), key)}</strong>);
    } else if (token.startsWith('[')) {
      const m = token.match(/^\[([^\]]+)\]\(([^)\s]+)\)$/);
      const label = m ? m[1] : token;
      const href = m ? m[2] : '#';
      if (href.startsWith('/')) {
        out.push(<Link key={key} to={href}>{renderInline(label, key)}</Link>);
      } else if (/^https:\/\//.test(href)) {
        out.push(
          <a key={key} href={href} target="_blank" rel="noopener noreferrer">
            {renderInline(label, key)}
          </a>,
        );
      } else {
        out.push(label);
      }
    } else {
      out.push(<em key={key}>{renderInline(token.slice(1, -1), key)}</em>);
    }
    last = start + token.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

type Block =
  | { type: 'h2' | 'h3'; text: string; id: string }
  | { type: 'p'; text: string }
  | { type: 'ul' | 'ol' | 'check'; items: string[] }
  | { type: 'quote'; lines: string[] }
  | { type: 'table'; head: string[]; rows: string[][] };

const splitRow = (line: string): string[] =>
  line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());

export function parseMarkdown(src: string): Block[] {
  const lines = src.replace(/\r\n/g, '\n').split('\n');
  const blocks: Block[] = [];
  const usedIds = new Map<string, number>();
  const uniqueId = (text: string) => {
    const base = slugify(text) || 'section';
    const n = usedIds.get(base) || 0;
    usedIds.set(base, n + 1);
    return n ? `${base}-${n + 1}` : base;
  };
  let para: string[] = [];
  const flushPara = () => {
    if (para.length) blocks.push({ type: 'p', text: para.join(' ') });
    para = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const line = raw.trim();
    if (!line) { flushPara(); continue; }

    if (line.startsWith('### ')) { flushPara(); const text = line.slice(4).trim(); blocks.push({ type: 'h3', text, id: uniqueId(text) }); continue; }
    if (line.startsWith('## ')) { flushPara(); const text = line.slice(3).trim(); blocks.push({ type: 'h2', text, id: uniqueId(text) }); continue; }

    if (line.startsWith('|')) {
      flushPara();
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        const r = lines[i].trim();
        if (!/^\|?\s*:?-{2,}/.test(r)) rows.push(splitRow(r));
        i++;
      }
      i--;
      if (rows.length) blocks.push({ type: 'table', head: rows[0], rows: rows.slice(1) });
      continue;
    }

    if (line.startsWith('> ') || line === '>') {
      flushPara();
      const quote: string[] = [];
      while (i < lines.length && (lines[i].trim().startsWith('> ') || lines[i].trim() === '>')) {
        const t = lines[i].trim().replace(/^>\s?/, '');
        if (t) quote.push(t);
        i++;
      }
      i--;
      blocks.push({ type: 'quote', lines: quote });
      continue;
    }

    const listKind = /^- \[[ xX]\] /.test(line) ? 'check' : /^[-*] /.test(line) ? 'ul' : /^\d+[.)] /.test(line) ? 'ol' : null;
    if (listKind) {
      flushPara();
      const items: string[] = [];
      while (i < lines.length) {
        const t = lines[i].trim();
        const kind = /^- \[[ xX]\] /.test(t) ? 'check' : /^[-*] /.test(t) ? 'ul' : /^\d+[.)] /.test(t) ? 'ol' : null;
        if (kind !== listKind) break;
        items.push(t.replace(/^- \[[ xX]\] /, '').replace(/^[-*] /, '').replace(/^\d+[.)] /, ''));
        i++;
      }
      i--;
      blocks.push({ type: listKind, items });
      continue;
    }

    para.push(line);
  }
  flushPara();
  return blocks;
}

export const extractHeadings = (src: string): { id: string; text: string }[] =>
  parseMarkdown(src)
    .filter((b): b is Extract<Block, { id: string }> => b.type === 'h2')
    .map((b) => ({ id: b.id, text: b.text.replace(/\*\*|\*/g, '') }));

export const Markdown: React.FC<{ source: string; className?: string }> = ({ source, className = 'prose-cd' }) => {
  const blocks = parseMarkdown(source);
  return (
    <div className={className}>
      {blocks.map((b, i) => {
        const k = `b${i}`;
        switch (b.type) {
          case 'h2':
            return <h2 key={k} id={b.id} className="scroll-mt-24">{renderInline(b.text, k)}</h2>;
          case 'h3':
            return <h3 key={k} id={b.id} className="scroll-mt-24">{renderInline(b.text, k)}</h3>;
          case 'p':
            return <p key={k}>{renderInline(b.text, k)}</p>;
          case 'ul':
            return <ul key={k}>{b.items.map((it, j) => <li key={j}>{renderInline(it, `${k}-${j}`)}</li>)}</ul>;
          case 'ol':
            return <ol key={k}>{b.items.map((it, j) => <li key={j}>{renderInline(it, `${k}-${j}`)}</li>)}</ol>;
          case 'check':
            return (
              <ul key={k} className="!list-none !pl-0">
                {b.items.map((it, j) => (
                  <li key={j} className="flex items-start gap-3">
                    <span aria-hidden="true" className="mt-[0.4em] inline-block h-[1.05em] w-[1.05em] flex-none rounded-[5px] border-2 border-brand-500/70 bg-card" />
                    <span>{renderInline(it, `${k}-${j}`)}</span>
                  </li>
                ))}
              </ul>
            );
          case 'quote':
            return <blockquote key={k}>{b.lines.map((l, j) => <p key={j} className="!my-1">{renderInline(l, `${k}-${j}`)}</p>)}</blockquote>;
          case 'table':
            return (
              <div key={k} className="not-prose relative my-6 overflow-x-auto rounded-xl border border-border">
                <table className="!my-0 w-full min-w-[480px] text-left text-[15px]">
                  <thead className="bg-muted/70">
                    <tr>{b.head.map((h, j) => <th key={j} scope="col" className="!border-b !border-border !px-4 !py-3 text-sm font-semibold text-foreground">{renderInline(h, `${k}-h${j}`)}</th>)}</tr>
                  </thead>
                  <tbody>
                    {b.rows.map((row, r) => (
                      <tr key={r} className="even:bg-muted/30">
                        {row.map((cell, c) => <td key={c} className="!border-b !border-border/70 !px-4 !py-3 align-top leading-6">{renderInline(cell, `${k}-${r}-${c}`)}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          default:
            return null;
        }
      })}
    </div>
  );
};

export default Markdown;
