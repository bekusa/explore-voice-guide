import { ChevronDown, MapPin } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";

/**
 * Shared shell for the museum-highlight-style cards used by
 * /results (ResultCard) and /saved (SavedRow). The two consumers
 * had ~80% of their structure copy-pasted: outer card wrapper,
 * 180px hero image with tap-to-expand toggle, light-theme wash,
 * title row with chevron button, grid-cols actions, CSS-grid
 * height-animated body. Differences live entirely inside the
 * slots — title/meta content, action buttons, and body — so the
 * shell takes the structure and the caller plugs in the parts
 * that vary.
 *
 * Design notes:
 *   - Tag is variable so /results can render <article> (with the
 *     float-up entrance animation) and /saved can render <li>
 *     (inside a <ul>) without losing semantics.
 *   - `actionCount` lets the shell hard-code the grid (2 for
 *     SavedRow's Remove + Details, 3 for ResultCard's Save +
 *     Offline + Details). A free-form className would have
 *     worked but two cases is too few to justify the indirection.
 *   - `topPill` is the small Offline / Cached badge that sits at
 *     top-left of the hero. Both screens render one but the
 *     content differs (Download icon + "Offline" on results,
 *     Headphones + "guide cached" on saved); the shell positions
 *     it, the caller picks what's in it.
 *   - `onImgError` lets each consumer keep its own imgFailed
 *     state (a render-prop here would be over-engineered). When
 *     the resolved photo URL 404s, the caller flips state and
 *     the next render passes photo=null → we render the MapPin
 *     placeholder.
 */
export function AttractionCardShell({
  as: Tag = "article",
  open,
  onToggle,
  photo,
  imgAlt,
  onImgError,
  topPill,
  /** The left half of the title row: h3, optional badges, meta line.
   *  Shell wraps this in `min-w-0 flex-1` and pairs it with the chevron. */
  titleContent,
  /** Action buttons. Shell wraps these in a 2/3-col grid. */
  actions,
  actionCount,
  /** Expandable body — only rendered when `open` is true. */
  body,
  /** Optional inline style for the entrance animation. ResultCard
   *  passes the float-up keyframes per index; SavedRow passes nothing. */
  animationStyle,
  /** Accessibility label for the chevron toggle. Localised by caller. */
  toggleLabel,
}: {
  as?: "article" | "li";
  open: boolean;
  onToggle: () => void;
  photo: string | null;
  imgAlt: string;
  onImgError: () => void;
  topPill?: ReactNode;
  titleContent: ReactNode;
  actions: ReactNode;
  actionCount: 2 | 3;
  body: ReactNode;
  animationStyle?: CSSProperties;
  toggleLabel: { collapse: string; expand: string };
}) {
  const gridClass = actionCount === 3 ? "grid-cols-3" : "grid-cols-2";
  return (
    <Tag
      className={`relative overflow-hidden rounded-2xl border bg-card transition-smooth ${
        open ? "border-primary/60 shadow-glow" : "border-border hover:border-primary/40"
      }`}
      style={animationStyle}
    >
      {/* Hero image — full width, 180px tall. Whole area is the
          expand toggle (keyboard + pointer). The MapPin placeholder
          fills the same space so the card height never shifts when
          the photo arrives late. */}
      <div
        role="button"
        tabIndex={0}
        onClick={onToggle}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onToggle();
          }
        }}
        aria-expanded={open}
        className="relative block h-[180px] w-full cursor-pointer overflow-hidden bg-secondary"
      >
        {photo ? (
          <img
            src={photo}
            alt={imgAlt}
            loading="lazy"
            onError={onImgError}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="grid h-full w-full place-items-center bg-gradient-card">
            <MapPin className="h-7 w-7 text-primary" />
          </div>
        )}
        {/* Light-theme darkening wash — same trick used by Home
            and museum highlight cards so the cinematic photo
            doesn't read pale on daylight. Zero opacity in dark
            theme, 30% in light. */}
        <div className="pointer-events-none absolute inset-0 bg-black/0 [.light_&]:bg-black/30" />
        {topPill && <div className="absolute left-3 top-3">{topPill}</div>}
      </div>

      {/* Title + meta + chevron row. Caller supplies titleContent
          (h3 + meta), shell adds the flex layout and the chevron
          button on the right. */}
      <div className="px-4 pt-3">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">{titleContent}</div>
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={open}
            aria-label={open ? toggleLabel.collapse : toggleLabel.expand}
            className={`grid h-9 w-9 shrink-0 place-items-center rounded-full bg-foreground text-background transition-smooth ${
              open ? "rotate-180" : ""
            }`}
          >
            <ChevronDown className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Always-visible actions. Beka's spec: Save / Offline /
          Details (or Remove / Details on /saved) must be one tap
          away with no expand step. */}
      <div className={`grid ${gridClass} gap-2 px-4 pt-3`}>{actions}</div>

      {/* CSS-grid height animation. grid-rows-[0fr] ↔ 1fr with the
          inner overflow-hidden gives a smooth reveal without
          JS-measured heights — same trick the museum highlights
          use. */}
      <div
        className={`grid transition-all duration-300 ease-out ${
          open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
        }`}
      >
        <div className="overflow-hidden">{body}</div>
      </div>

      {/* Bottom breathing room for the collapsed state. When the
          body is open it already has its own padding; when closed
          the actions row would otherwise sit flush against the
          card's bottom edge. */}
      <div className={`${open ? "pb-0" : "pb-3"}`} />
    </Tag>
  );
}
