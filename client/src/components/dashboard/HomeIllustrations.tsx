// The restaurant home page's drawings (design/restaurant-home/home.dc.html), copied as they are.

// Faint outline food drawings on the hero's dark green, behind its content. Decorative.
export function HeroDoodles() {
  return (
    <svg
      viewBox="0 0 1100 420"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 h-full w-full"
    >
      <g fill="none" stroke="#1F6B3D" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M560 60c18-18 46-14 56 6 8 18-4 40-26 44-20 4-38-10-38-28 0-8 3-16 8-22z" />
        <path d="M588 52c2-10 8-18 18-20" />
        <path d="M660 300l60-60M670 310c-14-4-22-18-16-30l40-40c10-6 26 0 30 14 2 8-2 16-8 22l-30 30c-4 4-10 6-16 4z" />
        <circle cx="740" cy="110" r="28" />
        <path d="M740 82v-14M726 70c6 6 22 6 28 0" />
        <path d="M860 40c-20 10-30 34-20 56 22-6 36-28 30-52-4-2-6-4-10-4z" />
        <path d="M846 92l20-44" />
        <path d="M610 380c10-30 40-46 70-40-4 30-34 50-64 46z" />
        <path d="M960 300c0-26 20-44 44-44s44 18 44 44H960z" />
        <path d="M980 300v-12M1004 300v-20M1028 300v-12" />
        <path d="M1030 90c14 0 26 12 26 26s-12 26-26 26-26-12-26-26 12-26 26-26zM1030 64v26" />
        <path d="M500 250c14-10 34-6 42 8" />
        <circle cx="520" cy="300" r="10" />
        <circle cx="900" cy="370" r="12" />
      </g>
    </svg>
  );
}

// The chef holding a paper bag full of vegetables, on the right of the hero. `label` names it.
export function ChefIllustration({ label }: { label: string }) {
  return (
    <svg
      viewBox="0 0 340 330"
      role="img"
      aria-label={label}
      focusable="false"
      data-testid="home-chef"
      className="relative block h-auto w-full max-w-[340px]"
    >
      <ellipse cx="170" cy="322" rx="130" ry="10" fill="#0F3F22" />
      <path d="M40 330c0-70 40-118 130-118s130 48 130 118z" fill="#FFFFFF" />
      <path d="M150 214l20 26 20-26z" fill="#E4572E" />
      <g fill="#A8A29E">
        <circle cx="146" cy="262" r="4" />
        <circle cx="146" cy="290" r="4" />
        <circle cx="194" cy="262" r="4" />
        <circle cx="194" cy="290" r="4" />
      </g>
      <path d="M170 240v90" stroke="#E7E5E4" strokeWidth="2" />
      <rect x="152" y="176" width="36" height="40" rx="10" fill="#D99A6C" />
      <circle cx="170" cy="150" r="44" fill="#E9B48A" />
      <circle cx="126" cy="152" r="9" fill="#E0A579" />
      <circle cx="214" cy="152" r="9" fill="#E0A579" />
      <circle cx="154" cy="146" r="4.5" fill="#1C1917" />
      <circle cx="186" cy="146" r="4.5" fill="#1C1917" />
      <path d="M150 166c10-6 30-6 40 0-4 6-12 8-20 8s-16-2-20-8z" fill="#5B3A22" />
      <path d="M158 178c6 6 18 6 24 0" fill="none" stroke="#9A3412" strokeWidth="3" strokeLinecap="round" />
      <circle cx="146" cy="162" r="6" fill="#F4A07A" opacity="0.6" />
      <circle cx="194" cy="162" r="6" fill="#F4A07A" opacity="0.6" />
      <rect x="124" y="98" width="92" height="22" rx="6" fill="#FFFFFF" stroke="#E7E5E4" strokeWidth="2" />
      <circle cx="136" cy="86" r="24" fill="#FFFFFF" />
      <circle cx="170" cy="72" r="32" fill="#FFFFFF" />
      <circle cx="204" cy="86" r="24" fill="#FFFFFF" />
      <rect x="128" y="92" width="84" height="12" fill="#FFFFFF" />
      <g>
        <circle cx="222" cy="222" r="20" fill="#22C55E" />
        <circle cx="246" cy="214" r="22" fill="#16A34A" />
        <circle cx="270" cy="224" r="18" fill="#4ADE80" />
        <path d="M276 232l26-46" stroke="#F97316" strokeWidth="12" strokeLinecap="round" />
        <path d="M300 186l8-12M302 190l12-6" stroke="#22C55E" strokeWidth="4" strokeLinecap="round" />
        <circle cx="236" cy="240" r="15" fill="#DC2626" />
        <circle cx="231" cy="235" r="3.5" fill="#FCA5A5" />
        <path d="M200 232h112l-10 98H210z" fill="#C68B59" />
        <path d="M200 232h112l-3 16H203z" fill="#A86F42" />
        <path d="M246 262c0-8 6-14 14-14s14 6 14 14" fill="none" stroke="#A86F42" strokeWidth="3" />
      </g>
      <path d="M110 250c-20 18-24 44-8 60 10 10 30 8 42-2l60-30-10-24-50 18z" fill="#FFFFFF" />
      <circle cx="208" cy="266" r="14" fill="#E9B48A" />
    </svg>
  );
}

// The "Track delivery" button's scooter. Decorative.
export function ScooterIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <circle cx="5.5" cy="17.5" r="3" />
      <circle cx="18.5" cy="17.5" r="3" />
      <path d="M8.5 17.5h5l3-7h3M12 10.5h4M5.5 17.5 9 8h3" />
    </svg>
  );
}
