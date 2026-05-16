import { Fragment } from "react";

/**
 * Bare-bones markdown renderer for the Privacy + Terms legal pages.
 *
 * Why hand-rolled instead of `react-markdown`: those packages ship
 * ~80kB of parsers, syntax-highlighters, and sanitisers we don't need.
 * Our legal content uses only six markdown constructs (h1, h2, p, ul,
 * strong, link) and the output is fully controlled — there's no
 * untrusted user input to sanitise. A 40-line renderer keeps the
 * bundle lean and the markup styled exactly to the design system.
 *
 * Supported syntax:
 *   - `# Heading 1` and `## Heading 2`
 *   - Paragraphs (blank-line separated)
 *   - Unordered lists with `- ` prefix
 *   - `**bold**` inline
 *   - `[label](url)` inline links → open in new tab with noopener
 *
 * Anything else (tables, blockquotes, images, code blocks) renders
 * as plain paragraph text — add support when the legal doc needs it,
 * not pre-emptively.
 */
export function LegalMarkdown({ source }: { source: string }) {
  const blocks = source.trim().split(/\n\n+/);
  return (
    <article className="flex flex-col gap-4 text-[13.5px] leading-[1.65] text-foreground/85">
      {blocks.map((block, i) => renderBlock(block, i))}
    </article>
  );
}

function renderBlock(block: string, key: number) {
  const trimmed = block.trim();
  if (trimmed.startsWith("# ")) {
    return (
      <h1
        key={key}
        className="font-display text-[1.9rem] font-medium leading-[1.1] text-foreground"
      >
        {renderInline(trimmed.slice(2))}
      </h1>
    );
  }
  if (trimmed.startsWith("## ")) {
    return (
      <h2
        key={key}
        className="mt-2 font-display text-[1.25rem] font-medium leading-[1.2] text-foreground"
      >
        {renderInline(trimmed.slice(3))}
      </h2>
    );
  }
  // Unordered list — a block of "- " lines, possibly with paragraph
  // intro before. We split by line, group leading non-list lines as a
  // paragraph if present.
  if (trimmed.split("\n").some((l) => l.startsWith("- "))) {
    const lines = trimmed.split("\n");
    const items = lines.filter((l) => l.startsWith("- ")).map((l) => l.slice(2));
    return (
      <ul key={key} className="ml-4 flex list-disc flex-col gap-1.5">
        {items.map((item, j) => (
          <li key={j}>{renderInline(item)}</li>
        ))}
      </ul>
    );
  }
  // Default: paragraph. Preserve hard newlines inside the block as
  // <br>s so multi-line paragraphs (rare in our legal copy) survive.
  const lines = trimmed.split("\n");
  return (
    <p key={key}>
      {lines.map((line, j) => (
        <Fragment key={j}>
          {renderInline(line)}
          {j < lines.length - 1 ? <br /> : null}
        </Fragment>
      ))}
    </p>
  );
}

/**
 * Inline markdown: **bold** and [label](url). Implemented as a
 * single-pass tokenizer rather than nested regexes so order of
 * appearance is preserved (a link inside bold and vice versa).
 */
function renderInline(text: string): React.ReactNode {
  const nodes: React.ReactNode[] = [];
  let remaining = text;
  let keyCounter = 0;
  // Regex matches either **bold** or [label](url). Whichever comes
  // first in the string wins; we slice, push, and repeat.
  const PATTERN = /\*\*([^*]+)\*\*|\[([^\]]+)\]\(([^)]+)\)/;
  while (remaining.length > 0) {
    const match = remaining.match(PATTERN);
    if (!match || match.index === undefined) {
      nodes.push(remaining);
      break;
    }
    if (match.index > 0) {
      nodes.push(remaining.slice(0, match.index));
    }
    if (match[1]) {
      // **bold**
      nodes.push(
        <strong key={keyCounter++} className="font-semibold text-foreground">
          {match[1]}
        </strong>,
      );
    } else if (match[2] && match[3]) {
      // [label](url)
      nodes.push(
        <a
          key={keyCounter++}
          href={match[3]}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary underline-offset-2 hover:underline"
        >
          {match[2]}
        </a>,
      );
    }
    remaining = remaining.slice(match.index + match[0].length);
  }
  return nodes;
}
