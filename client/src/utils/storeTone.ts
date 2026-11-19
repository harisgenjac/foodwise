// A store without a logo shows its initials on a colour: the strong colour on the soft one (the
// home page's store slider) or white on the strong one. The strong colours are the palette's
// 700/800 shades plus a purple, so both pass WCAG AA.
export interface StoreTone {
  soft: string;
  strong: string;
}

const TONES: StoreTone[] = [
  { soft: "#FEE2E2", strong: "#B91C1C" },
  { soft: "#DCFCE7", strong: "#166534" },
  { soft: "#FFEDD5", strong: "#C2410C" },
  { soft: "#E0F2FE", strong: "#0369A1" },
  { soft: "#FEF3C7", strong: "#B45309" },
  { soft: "#F3E8FF", strong: "#7E22CE" },
];

// The same store always gets the same tone (a multiplicative hash of its id, so neighbouring ids
// differ).
export const storeTone = (id: number): StoreTone => TONES[(Math.imul(id, 2654435761) >>> 0) % TONES.length]!;
