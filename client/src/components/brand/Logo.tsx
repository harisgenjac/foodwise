import { BRAND_NAME } from "../../utils/brand.js";

// The app's logo (design/brand/):
// - "mark": the full mark (logo.svg): the green arrow over the produce in a hand
// - "full": the mark plus the name as real text, "Još" in brand-800 and "vrijedi" in accent-700
//   (like logo-horizontal.svg, whose SVG text is only a reference)
// - "icon": the simplified mark on a green square (app-icon.svg), for small sizes
// The mark and icon are named "Još vrijedi" for screen readers unless `decorative` (e.g. when the
// name is already next to them); the full logo's text is the name, so its mark is always hidden.
interface LogoProps {
  variant?: "mark" | "full" | "icon";
  // The mark's or icon's size, e.g. "h-10 w-10".
  className?: string;
  // The name's size and weight in the full logo, e.g. "text-xl".
  textClassName?: string;
  decorative?: boolean;
}

const svgProps = (label: string | null) =>
  label ? { role: "img", "aria-label": label } : { "aria-hidden": true, focusable: false };

function Mark({ className, label }: { className: string; label: string | null }) {
  return (
    <svg viewBox="0 0 200 200" className={className} {...svgProps(label)} data-testid="logo-mark">
      <path d="M32 75 A72 72 0 0 1 172 96" fill="none" stroke="#22C55E" strokeWidth="12" strokeLinecap="round" />
      <polygon points="158,96 186,96 172,118" fill="#22C55E" stroke="#22C55E" strokeWidth="3" strokeLinejoin="round" />
      <g transform="translate(0 8)">
        <g transform="rotate(-18 98 112)">
          <path d="M98 116 C80 100 82 74 98 58 C114 74 116 100 98 116 Z" fill="#16A34A" />
          <path d="M98 64 L98 108" stroke="#86EFAC" strokeWidth="3" strokeLinecap="round" />
        </g>
        <ellipse cx="70" cy="104" rx="22" ry="34" transform="rotate(-35 70 104)" fill="#F59E0B" />
        <path d="M58 96 L74 86 M64 110 L82 100" stroke="#D97706" strokeWidth="5" strokeLinecap="round" />
        <circle cx="128" cy="110" r="26" fill="#E4572E" />
        <ellipse cx="117" cy="100" rx="5" ry="3.5" transform="rotate(-30 117 100)" fill="#F8A48A" />
        <path
          d="M128 86 L120 78 M128 86 L136 78 M128 86 L128 75 M128 86 L116 88 M128 86 L140 88"
          stroke="#166534"
          strokeWidth="5"
          strokeLinecap="round"
        />
        <path
          d="M18 166 C32 140 62 128 96 128 L130 130 C143 131 146 144 133 146 L110 149 C120 153 134 153 144 148 L166 132 C176 125 188 132 180 142 C162 166 128 180 92 180 C64 180 38 175 18 166 Z"
          fill="#166534"
        />
      </g>
    </svg>
  );
}

function Icon({ className, label }: { className: string; label: string | null }) {
  return (
    <svg viewBox="0 0 100 100" className={className} {...svgProps(label)} data-testid="logo-icon">
      <rect width="100" height="100" rx="22" fill="#166534" />
      <path d="M22 44 A30 30 0 0 1 78 44" fill="none" stroke="#86EFAC" strokeWidth="8" strokeLinecap="round" />
      <polygon points="70,42 88,42 79,56" fill="#86EFAC" stroke="#86EFAC" strokeWidth="2" strokeLinejoin="round" />
      <circle cx="50" cy="56" r="15" fill="#E4572E" />
      <path d="M50 42 L50 35" stroke="#86EFAC" strokeWidth="3.5" strokeLinecap="round" />
      <path d="M51 39 C55 32 62 32 66 34 C62 40 56 41 51 39 Z" fill="#86EFAC" />
      <path
        d="M14 82 C22 70 36 66 52 66 L66 67 C73 68 73 75 66 75 L56 76 C63 78 70 77 75 74 L84 66 C89 62 95 67 90 72 C82 82 66 88 48 88 C34 88 22 86 14 82 Z"
        fill="#FFFFFF"
      />
    </svg>
  );
}

function Logo({ variant = "mark", className = "h-10 w-10", textClassName = "text-xl", decorative = false }: LogoProps) {
  if (variant === "icon") return <Icon className={className} label={decorative ? null : BRAND_NAME} />;
  if (variant === "mark") return <Mark className={className} label={decorative ? null : BRAND_NAME} />;

  const [first, ...rest] = BRAND_NAME.split(" ");
  return (
    <span className="inline-flex items-center gap-2" data-testid="logo-full">
      <Mark className={`shrink-0 ${className}`} label={null} />
      <span className={`font-bold tracking-tight whitespace-nowrap ${textClassName}`}>
        <span className="text-brand-800">{first}</span> <span className="text-accent-700">{rest.join(" ")}</span>
      </span>
    </span>
  );
}

export default Logo;
