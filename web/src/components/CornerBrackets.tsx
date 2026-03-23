/**
 * CornerBrackets — Cloudflare Workers signature decorative element.
 *
 * Renders four 8×8px square brackets at the corners of a relatively-positioned
 * parent container. The parent must have `position: relative` (or Tailwind's
 * `relative` class) for the brackets to anchor correctly.
 *
 * Usage:
 *   <div className="relative border border-kumo-line rounded-xl p-6">
 *     <CornerBrackets />
 *     …content…
 *   </div>
 */
export function CornerBrackets() {
  return (
    <div
      className="pointer-events-none absolute inset-0 z-10 select-none"
      aria-hidden="true"
    >
      {/* Top-left */}
      <div className="absolute -top-1 -left-1 w-2 h-2 border border-kumo-line rounded-[1.5px] bg-kumo-base" />
      {/* Top-right */}
      <div className="absolute -top-1 -right-1 w-2 h-2 border border-kumo-line rounded-[1.5px] bg-kumo-base" />
      {/* Bottom-left */}
      <div className="absolute -bottom-1 -left-1 w-2 h-2 border border-kumo-line rounded-[1.5px] bg-kumo-base" />
      {/* Bottom-right */}
      <div className="absolute -bottom-1 -right-1 w-2 h-2 border border-kumo-line rounded-[1.5px] bg-kumo-base" />
    </div>
  );
}
