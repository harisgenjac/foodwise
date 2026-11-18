import { useId, type CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import styles from "./RestaurantHero.module.css";

// The restaurant dashboard's decorative hero: a shopkeeper hands a crate to a "Još vrijedi" rider
// who rides it to the restaurant's chef (an 11 s CSS loop, a still scene with reduced motion).
// The approved references are design/restaurant-home/hero.svg (md and up) and hero-mobile.svg
// (phones); both layouts are in the DOM and CSS shows one. Coordinates follow the references.

const FONT = "system-ui, sans-serif";

// A bubble's two lines, centred at `x`.
function BubbleText({ x, y, gap, size, fill, lines }: { x: number; y: number; gap: number; size: number; fill: string; lines: [string, string] }) {
  return (
    <>
      <text x={x} y={y} textAnchor="middle" fontSize={size} fill={fill}>
        {lines[0]}
      </text>
      <text x={x} y={y + gap} textAnchor="middle" fontSize={size} fill={fill}>
        {lines[1]}
      </text>
    </>
  );
}

function Crate() {
  return (
    <>
      <rect x="452" y="208" width="24" height="18" rx="3" fill="#D97706" />
      <rect x="452" y="215" width="24" height="3" fill="#92400E" />
      <circle cx="458" cy="206" r="4" fill="#EF4444" />
      <circle cx="466" cy="205" r="4" fill="#22C55E" />
      <circle cx="472" cy="207" r="3" fill="#F97316" />
    </>
  );
}

function Shopkeeper() {
  return (
    <g>
      <rect x="484" y="212" width="5" height="14" rx="2" fill="#1E3A8A" />
      <rect x="491" y="212" width="5" height="14" rx="2" fill="#1E3A8A" />
      <rect x="479" y="184" width="22" height="31" rx="9" fill="#2563EB" />
      <rect x="483" y="191" width="14" height="22" rx="3" fill="#F97316" />
      <rect x="476" y="190" width="5" height="16" rx="2.5" fill="#F2C29B" />
      <rect x="499" y="190" width="5" height="16" rx="2.5" fill="#F2C29B" />
      <circle cx="490" cy="174" r="9" fill="#F2C29B" />
      <path d="M481 172 Q482 162 490 162 Q499 162 499 172 Q494 167 481 172 Z" fill="#78350F" />
    </g>
  );
}

function Chef() {
  return (
    <g>
      <rect x="187" y="212" width="5" height="14" rx="2" fill="#44403C" />
      <rect x="194" y="212" width="5" height="14" rx="2" fill="#44403C" />
      <rect x="182" y="184" width="22" height="31" rx="9" fill="#FFFFFF" stroke="#D6D3D1" strokeWidth="1" />
      <circle cx="193" cy="194" r="1.5" fill="#A8A29E" />
      <circle cx="193" cy="202" r="1.5" fill="#A8A29E" />
      <rect x="179" y="190" width="5" height="16" rx="2.5" fill="#E0AC85" />
      <rect className={styles.wave} x="202" y="176" width="5" height="16" rx="2.5" fill="#E0AC85" />
      <circle cx="193" cy="174" r="9" fill="#E0AC85" />
      <rect x="185" y="160" width="16" height="9" rx="2" fill="#FFFFFF" stroke="#D6D3D1" strokeWidth="1" />
      <circle cx="188" cy="158" r="5" fill="#FFFFFF" />
      <circle cx="196" cy="156" r="6" fill="#FFFFFF" />
      <circle cx="201" cy="159" r="4" fill="#FFFFFF" />
    </g>
  );
}

function Wheel({ cx }: { cx: number }) {
  return (
    <g className={styles.wheel}>
      <circle cx={cx} cy="272" r="15" fill="none" stroke="#1C1917" strokeWidth="4" />
      <circle cx={cx} cy="272" r="2.5" fill="#78716C" />
      <rect x={cx - 0.6} y="258" width="1.2" height="28" fill="#A8A29E" />
      <rect x={cx - 14} y="271.4" width="28" height="1.2" fill="#A8A29E" />
    </g>
  );
}

// The rider and the bicycle at the store; the parent moves them to the restaurant.
function Rider({ backpack }: { backpack: [string, string] }) {
  return (
    <>
      <Wheel cx={412} />
      <Wheel cx={478} />
      <path
        d="M478 272 L446 272 L464 248 Z M446 272 L424 248 L464 248 M424 248 L412 272"
        fill="none"
        stroke="#16A34A"
        strokeWidth="3.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <path d="M424 248 L421 238 L414 237" fill="none" stroke="#1C1917" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="458" y="243" width="14" height="4" rx="2" fill="#1C1917" />
      <g className={styles.wheel}>
        <circle cx="446" cy="272" r="5" fill="#44403C" />
        <rect x="445" y="263" width="2" height="18" fill="#44403C" />
      </g>
      <g className={styles.bob}>
        <path d="M462 244 L448 258 L446 266" fill="none" stroke="#1E3A8A" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M462 244 L440 228" fill="none" stroke="#F97316" strokeWidth="11" strokeLinecap="round" />
        <path d="M438 230 L418 238" fill="none" stroke="#C68863" strokeWidth="4" strokeLinecap="round" />
        <circle cx="432" cy="216" r="8" fill="#C68863" />
        <path d="M423 215 Q423 204 433 204 Q442 204 442 214 Z" fill="#16A34A" />
        <rect x="420" y="213" width="6" height="3" rx="1.5" fill="#16A34A" />
        <rect x="446" y="204" width="46" height="34" rx="6" fill="#16A34A" />
        <rect x="446" y="211" width="46" height="2" fill="#15803D" />
        <BubbleText x={469} y={225} gap={11} size={12} fill="#FFFFFF" lines={backpack} />
      </g>
    </>
  );
}

function Cloud({ cx, cy, big }: { cx: number; cy: number; big: boolean }) {
  return big ? (
    <g>
      <ellipse cx={cx} cy={cy} rx="30" ry="11" />
      <ellipse cx={cx - 12} cy={cy - 7} rx="14" ry="11" />
      <ellipse cx={cx + 10} cy={cy - 10} rx="16" ry="13" />
    </g>
  ) : (
    <g>
      <ellipse cx={cx} cy={cy} rx="26" ry="9" />
      <ellipse cx={cx - 10} cy={cy - 6} rx="12" ry="9" />
      <ellipse cx={cx + 10} cy={cy - 9} rx="14" ry="11" />
    </g>
  );
}

function RoadMarkings({ from, to, step, width }: { from: number; to: number; step: number; width: number }) {
  const xs: number[] = [];
  for (let x = from; x <= to; x += step) xs.push(x);
  return (
    <g fill="#F5F5F4">
      {xs.map((x) => (
        <rect key={x} x={x} y="291" width={width} height="3" rx="1.5" />
      ))}
    </g>
  );
}

const bubbleOrigin = (x: string): CSSProperties => ({ transformOrigin: `${x} 100%` });

interface SceneText {
  restaurant: string;
  store: string;
  storeBubble: [string, string];
  chefBubble: [string, string];
  backpack: [string, string];
}

// md and up: hero.svg. The sky, hills and street reach far past the 680-wide view box, so a box
// wider than the scene's ratio (it is at most 320 px tall) shows more street instead of empty sides.
function WideScene({ text }: { text: SceneText }) {
  return (
    <>
      <rect x="-1000" y="0" width="2680" height="310" fill="#FFF7ED" />
      <circle cx="340" cy="62" r="24" fill="#FED7AA" />
      <circle cx="340" cy="62" r="16" fill="#FDBA74" />
      <g className={styles.clouds} fill="#FFFFFF">
        {[-700, 0, 700, 1400].map((dx) => (
          <g key={dx}>
            <Cloud cx={140 + dx} cy={54} big />
            <Cloud cx={520 + dx} cy={40} big={false} />
          </g>
        ))}
      </g>
      <path
        d="M-1000 150 Q-900 110 -800 150 Q-690 104 -590 150 Q-490 112 -390 156 Q-290 108 -190 150 Q-90 120 0 180 Q90 112 190 160 Q280 104 390 156 Q490 108 590 150 Q640 128 680 140 Q780 104 880 150 Q980 112 1080 156 Q1180 108 1280 150 Q1380 112 1480 156 Q1580 110 1680 150 L1680 226 L-1000 226 Z"
        fill="#DCFCE7"
      />
      <path
        d="M-1000 196 Q-880 166 -760 198 Q-640 168 -520 196 Q-400 162 -280 198 Q-160 166 -60 196 Q-30 200 0 205 Q120 160 240 196 Q360 168 460 198 Q570 170 680 190 Q790 166 900 198 Q1010 168 1120 196 Q1230 166 1340 198 Q1450 168 1560 196 Q1620 186 1680 196 L1680 226 L-1000 226 Z"
        fill="#BBF7D0"
      />
      <g>
        <rect x="247" y="196" width="6" height="30" rx="2" fill="#92400E" />
        <circle cx="250" cy="186" r="18" fill="#4ADE80" />
        <circle cx="242" cy="192" r="10" fill="#22C55E" />
      </g>
      <g>
        <rect x="427" y="196" width="6" height="30" rx="2" fill="#92400E" />
        <circle cx="430" cy="186" r="18" fill="#4ADE80" />
        <circle cx="438" cy="192" r="10" fill="#22C55E" />
      </g>
      <rect x="-1000" y="226" width="2680" height="14" fill="#E7E5E4" />
      <rect x="-1000" y="240" width="2680" height="54" fill="#57534E" />
      <RoadMarkings from={-970} to={1640} step={90} width={36} />
      <rect x="-1000" y="294" width="2680" height="16" fill="#E7E5E4" />

      {/* The restaurant. */}
      <g>
        <rect x="30" y="112" width="140" height="114" rx="6" fill="#FEF3C7" />
        <rect x="24" y="104" width="152" height="12" rx="4" fill="#15803D" />
        <g fill="#16A34A">
          {[34, 52, 70, 88, 106, 124, 142, 160].map((cx) => (
            <circle key={cx} cx={cx} cy="118" r="8" />
          ))}
        </g>
        <rect x="54" y="76" width="92" height="24" rx="12" fill="#FFFFFF" stroke="#16A34A" strokeWidth="1.5" />
        <text x="100" y="93" textAnchor="middle" fontSize="14" fontWeight="500" fill="#15803D">
          {text.restaurant}
        </text>
        <rect x="42" y="140" width="62" height="46" rx="6" fill="#BAE6FD" />
        <rect x="50" y="166" width="46" height="4" rx="2" fill="#78716C" />
        <rect x="58" y="170" width="3" height="12" fill="#78716C" />
        <rect x="86" y="170" width="3" height="12" fill="#78716C" />
        <circle cx="64" cy="161" r="5" fill="#FFFFFF" />
        <circle cx="82" cy="161" r="5" fill="#FFFFFF" />
        <rect x="72" y="150" width="2" height="12" fill="#F97316" />
        <rect x="116" y="150" width="40" height="76" rx="5" fill="#B45309" />
        <rect x="122" y="156" width="28" height="22" rx="3" fill="#FDE68A" />
        <circle cx="148" cy="190" r="2.5" fill="#FDE68A" />
      </g>

      {/* The store. */}
      <g>
        <rect x="510" y="112" width="140" height="114" rx="6" fill="#FFEDD5" />
        <rect x="504" y="102" width="152" height="20" rx="4" fill="#F97316" />
        {[519, 549, 579, 609, 639].map((x) => (
          <rect key={x} x={x} y="102" width="15" height="20" fill="#FFFFFF" />
        ))}
        <rect x="526" y="72" width="108" height="26" rx="13" fill="#FFFFFF" stroke="#F97316" strokeWidth="1.5" />
        <text x="580" y="90" textAnchor="middle" fontSize="14" fontWeight="500" fill="#C2410C">
          {text.store}
        </text>
        <rect x="576" y="138" width="62" height="50" rx="6" fill="#BAE6FD" />
        <rect x="580" y="160" width="54" height="3" fill="#78716C" />
        <rect x="580" y="180" width="54" height="3" fill="#78716C" />
        <circle cx="588" cy="154" r="5" fill="#EF4444" />
        <circle cx="600" cy="154" r="5" fill="#F97316" />
        <circle cx="612" cy="154" r="5" fill="#EAB308" />
        <rect x="620" y="146" width="10" height="13" rx="2" fill="#FFFFFF" />
        <rect x="584" y="168" width="12" height="11" rx="2" fill="#22C55E" />
        <rect x="600" y="168" width="12" height="11" rx="2" fill="#F59E0B" />
        <rect x="616" y="168" width="12" height="11" rx="2" fill="#A3E635" />
        <rect x="522" y="150" width="40" height="76" rx="5" fill="#B45309" />
        <rect x="528" y="156" width="28" height="22" rx="3" fill="#FDE68A" />
        <circle cx="530" cy="190" r="2.5" fill="#FDE68A" />
      </g>

      <g className={styles.storeCrate}>
        <Crate />
      </g>
      <Shopkeeper />
      <Chef />
      <g className={styles.restaurantCrate}>
        <g transform="translate(-240 0)">
          <Crate />
        </g>
      </g>

      <g className={styles.storeBubble} style={bubbleOrigin("85%")}>
        <rect x="372" y="118" width="122" height="42" rx="12" fill="#FFFFFF" stroke="#FDBA74" strokeWidth="1.5" />
        <polygon points="472,159 484,159 488,168" fill="#FFFFFF" stroke="#FDBA74" strokeWidth="1.5" />
        <rect x="471" y="156" width="14" height="4" fill="#FFFFFF" />
        <BubbleText x={433} y={135} gap={16} size={12} fill="#9A3412" lines={text.storeBubble} />
      </g>
      <g className={styles.chefBubble} style={bubbleOrigin("10%")}>
        <rect x="194" y="118" width="128" height="42" rx="12" fill="#FFFFFF" stroke="#86EFAC" strokeWidth="1.5" />
        <polygon points="200,159 212,159 197,168" fill="#FFFFFF" stroke="#86EFAC" strokeWidth="1.5" />
        <rect x="199" y="156" width="14" height="4" fill="#FFFFFF" />
        <BubbleText x={258} y={135} gap={16} size={12} fill="#166534" lines={text.chefBubble} />
      </g>

      <g className={styles.rider}>
        <Rider backpack={text.backpack} />
      </g>
    </>
  );
}

// Below md: hero-mobile.svg. The buildings closer together, no trees, one cloud, and bigger
// bubbles (13.5 units, about 12.9 px on a 375 px phone) placed so both fit side by side when
// reduced motion shows them together. People, crates and the rider are the wide scene's, moved.
function PhoneScene({ text }: { text: SceneText }) {
  return (
    <>
      <rect x="0" y="20" width="360" height="290" fill="#FFF7ED" />
      <circle cx="180" cy="58" r="22" fill="#FED7AA" />
      <circle cx="180" cy="58" r="15" fill="#FDBA74" />
      <g className={styles.cloudsMobile} fill="#FFFFFF">
        <Cloud cx={110} cy={48} big />
        <Cloud cx={530} cy={48} big />
      </g>
      <path d="M0 176 Q60 122 130 160 Q200 112 270 156 Q320 126 360 140 L360 226 L0 226 Z" fill="#DCFCE7" />
      <path d="M0 205 Q90 166 180 196 Q270 170 360 190 L360 226 L0 226 Z" fill="#BBF7D0" />
      <rect x="0" y="226" width="360" height="14" fill="#E7E5E4" />
      <rect x="0" y="240" width="360" height="54" fill="#57534E" />
      <RoadMarkings from={14} to={344} step={90} width={36} />
      <rect x="0" y="294" width="360" height="16" fill="#E7E5E4" />

      {/* The restaurant. */}
      <g>
        <rect x="6" y="112" width="118" height="114" rx="6" fill="#FEF3C7" />
        <rect x="0" y="104" width="130" height="12" rx="4" fill="#15803D" />
        <g fill="#16A34A">
          {[11, 29, 47, 65, 83, 101, 119].map((cx) => (
            <circle key={cx} cx={cx} cy="118" r="8" />
          ))}
        </g>
        <rect x="13" y="74" width="104" height="26" rx="13" fill="#FFFFFF" stroke="#16A34A" strokeWidth="1.5" />
        <text x="65" y="92" textAnchor="middle" fontSize="14.5" fontWeight="500" fill="#15803D">
          {text.restaurant}
        </text>
        <rect x="16" y="140" width="52" height="46" rx="6" fill="#BAE6FD" />
        <rect x="22" y="166" width="40" height="4" rx="2" fill="#78716C" />
        <rect x="28" y="170" width="3" height="12" fill="#78716C" />
        <rect x="53" y="170" width="3" height="12" fill="#78716C" />
        <circle cx="34" cy="161" r="5" fill="#FFFFFF" />
        <circle cx="50" cy="161" r="5" fill="#FFFFFF" />
        <rect x="41" y="150" width="2" height="12" fill="#F97316" />
        <rect x="78" y="150" width="36" height="76" rx="5" fill="#B45309" />
        <rect x="83" y="156" width="26" height="22" rx="3" fill="#FDE68A" />
        <circle cx="107" cy="190" r="2.5" fill="#FDE68A" />
      </g>

      {/* The store. */}
      <g>
        <rect x="236" y="112" width="118" height="114" rx="6" fill="#FFEDD5" />
        <rect x="230" y="102" width="130" height="20" rx="4" fill="#F97316" />
        {[243, 269, 295, 321, 347].map((x) => (
          <rect key={x} x={x} y="102" width="13" height="20" fill="#FFFFFF" />
        ))}
        <rect x="239" y="72" width="112" height="26" rx="13" fill="#FFFFFF" stroke="#F97316" strokeWidth="1.5" />
        <text x="295" y="90" textAnchor="middle" fontSize="14.5" fontWeight="500" fill="#C2410C">
          {text.store}
        </text>
        <rect x="288" y="138" width="58" height="50" rx="6" fill="#BAE6FD" />
        <rect x="292" y="160" width="50" height="3" fill="#78716C" />
        <rect x="292" y="180" width="50" height="3" fill="#78716C" />
        <circle cx="299" cy="154" r="4.5" fill="#EF4444" />
        <circle cx="310" cy="154" r="4.5" fill="#F97316" />
        <circle cx="321" cy="154" r="4.5" fill="#EAB308" />
        <rect x="329" y="146" width="9" height="13" rx="2" fill="#FFFFFF" />
        <rect x="295" y="168" width="11" height="11" rx="2" fill="#22C55E" />
        <rect x="309" y="168" width="11" height="11" rx="2" fill="#F59E0B" />
        <rect x="323" y="168" width="11" height="11" rx="2" fill="#A3E635" />
        <rect x="246" y="150" width="36" height="76" rx="5" fill="#B45309" />
        <rect x="251" y="156" width="26" height="22" rx="3" fill="#FDE68A" />
        <circle cx="253" cy="190" r="2.5" fill="#FDE68A" />
      </g>

      <g className={styles.storeCrate}>
        <g transform="translate(-264 0)">
          <Crate />
        </g>
      </g>
      <g transform="translate(-264 0)">
        <Shopkeeper />
      </g>
      <g transform="translate(-59 0)">
        <Chef />
      </g>
      <g className={styles.restaurantCrate}>
        <g transform="translate(-299 0)">
          <Crate />
        </g>
      </g>

      <g className={styles.chefBubble} style={bubbleOrigin("90%")}>
        <rect x="6" y="102" width="136" height="48" rx="12" fill="#FFFFFF" stroke="#86EFAC" strokeWidth="1.5" />
        <polygon points="116,149 128,149 134,158" fill="#FFFFFF" stroke="#86EFAC" strokeWidth="1.5" />
        <rect x="115" y="146" width="14" height="4" fill="#FFFFFF" />
        <BubbleText x={74} y={122} gap={18} size={13.5} fill="#166534" lines={text.chefBubble} />
      </g>
      <g className={styles.storeBubble} style={bubbleOrigin("15%")}>
        <rect x="218" y="102" width="136" height="48" rx="12" fill="#FFFFFF" stroke="#FDBA74" strokeWidth="1.5" />
        <polygon points="236,149 248,149 230,159" fill="#FFFFFF" stroke="#FDBA74" strokeWidth="1.5" />
        <rect x="235" y="146" width="14" height="4" fill="#FFFFFF" />
        <BubbleText x={286} y={122} gap={18} size={13.5} fill="#9A3412" lines={text.storeBubble} />
      </g>

      <g transform="translate(-200 0)">
        <g className={styles.riderMobile}>
          <Rider backpack={text.backpack} />
        </g>
      </g>
    </>
  );
}

function RestaurantHero() {
  const { t } = useTranslation();
  const id = useId();
  const text: SceneText = {
    restaurant: t("restaurantHero.restaurant"),
    store: t("restaurantHero.store"),
    storeBubble: [t("restaurantHero.storeBubble1"), t("restaurantHero.storeBubble2")],
    chefBubble: [t("restaurantHero.chefBubble1"), t("restaurantHero.chefBubble2")],
    backpack: [t("restaurantHero.backpack1"), t("restaurantHero.backpack2")],
  };

  // Decorative and still announced once: role="img" with the title and description, its text and
  // shapes hidden from the accessibility tree, nothing focusable.
  const scene = (layout: "wide" | "phone") => {
    const titleId = `${id}-${layout}-title`;
    const descId = `${id}-${layout}-desc`;
    const wide = layout === "wide";
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox={wide ? "0 0 680 310" : "0 20 360 290"}
        role="img"
        aria-labelledby={titleId}
        aria-describedby={descId}
        focusable="false"
        fontFamily={FONT}
        data-testid={`restaurant-hero-${layout}`}
        className={wide ? "hidden aspect-[680/310] max-h-80 w-full md:block" : "block aspect-[360/290] w-full md:hidden"}
      >
        <title id={titleId}>{t("restaurantHero.title")}</title>
        <desc id={descId}>{t("restaurantHero.desc")}</desc>
        {wide ? <WideScene text={text} /> : <PhoneScene text={text} />}
      </svg>
    );
  };

  return (
    <div className="overflow-hidden rounded-2xl bg-[#FFF7ED]">
      {scene("wide")}
      {scene("phone")}
    </div>
  );
}

export default RestaurantHero;
