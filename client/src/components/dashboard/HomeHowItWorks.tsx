import { useId, type ReactNode } from "react";
import { Trans, useTranslation } from "react-i18next";

// The steps' drawings (design/restaurant-home/home.dc.html), copied as they are: dark green line
// art with white fills over a light green blob. Decorative.
const SVG = "block h-[138px] w-[170px]";
const BLOB = "#BBF7D0";
const LINE = {
  fill: "none",
  stroke: "#14532D",
  strokeWidth: 2.5,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

// Step 1: a basket of food under a magnifying glass.
function FindOfferIllustration() {
  return (
    <svg viewBox="0 0 160 130" aria-hidden="true" className={SVG}>
      <path d="M30 78 Q22 40 60 30 Q100 18 122 44 Q144 70 124 98 Q104 122 66 116 Q36 110 30 78 Z" fill={BLOB} />
      <g {...LINE}>
        <ellipse cx="66" cy="60" rx="16" ry="8" fill="#FFFFFF" transform="rotate(-25 66 60)" />
        <path d="M58 58 L62 62 M66 55 L70 59 M74 52 L77 56" />
        <circle cx="88" cy="60" r="9" fill="#FFFFFF" />
        <path d="M88 51 Q90 46 94 45" />
        <path d="M34 70 L118 70 L108 112 L44 112 Z" fill="#FFFFFF" />
        <path d="M48 70 Q76 36 104 70" />
        <path d="M56 80 L58 104 M76 80 L76 104 M96 80 L94 104" />
        <circle cx="122" cy="40" r="15" fill="#FFFFFF" />
        <path d="M133 51 L146 64" strokeWidth={5} />
        <path d="M116 40 L128 40 M122 34 L122 46" strokeWidth={2} />
      </g>
    </svg>
  );
}

// Step 2: the store, a dashed route to a map pin, and a bag.
function ChooseDeliveryIllustration() {
  return (
    <svg viewBox="0 0 160 130" aria-hidden="true" className={SVG}>
      <path d="M26 70 Q24 34 62 28 Q104 20 126 50 Q146 78 120 102 Q94 122 60 112 Q28 104 26 70 Z" fill={BLOB} />
      <g {...LINE}>
        <rect x="22" y="60" width="54" height="48" fill="#FFFFFF" />
        <path d="M18 50 L80 50 L76 62 L22 62 Z" fill="#FFFFFF" />
        <path d="M34 50 L32 62 M48 50 L48 62 M62 50 L64 62" />
        <rect x="30" y="78" width="16" height="30" fill="#FFFFFF" />
        <rect x="54" y="74" width="14" height="12" fill="#FFFFFF" />
        <path d="M80 76 Q100 56 116 60" strokeDasharray="4 5" />
        <path d="M124 20 C113 20 108 28 108 35 C108 46 124 60 124 60 C124 60 140 46 140 35 C140 28 135 20 124 20 Z" fill="#FFFFFF" />
        <circle cx="124" cy="35" r="5" />
        <path d="M98 82 L134 82 L138 116 L94 116 Z" fill="#FFFFFF" />
        <path d="M106 82 Q106 70 116 70 Q126 70 126 82" />
      </g>
    </svg>
  );
}

// Step 3: a steaming pot.
function CookTodayIllustration() {
  return (
    <svg viewBox="0 0 160 130" aria-hidden="true" className={SVG}>
      <path d="M32 74 Q26 38 64 30 Q102 22 124 46 Q146 72 126 100 Q104 124 68 116 Q38 110 32 74 Z" fill={BLOB} />
      <g {...LINE}>
        <path d="M62 22 Q58 30 62 36 Q66 42 62 48 M80 18 Q76 27 80 34 Q84 41 80 48 M98 22 Q94 30 98 36 Q102 42 98 48" />
        <ellipse cx="80" cy="60" rx="42" ry="7" fill="#FFFFFF" />
        <path d="M74 53 Q80 47 86 53" />
        <path d="M40 62 L40 98 Q40 112 54 112 L106 112 Q120 112 120 98 L120 62" fill="#FFFFFF" />
        <path d="M40 72 L28 72 M120 72 L132 72" />
        <path d="M56 84 L104 84" strokeDasharray="2 6" />
      </g>
    </svg>
  );
}

const STEPS: { key: "find" | "choose" | "cook"; illustration: () => ReactNode }[] = [
  { key: "find", illustration: FindOfferIllustration },
  { key: "choose", illustration: ChooseDeliveryIllustration },
  { key: "cook", illustration: CookTodayIllustration },
];

// The highlighted phrase inside a step's sentence (<hl> in the translation).
const Highlight = ({ children }: { children?: ReactNode }) => (
  <span
    data-testid="how-it-works-highlight"
    className="rounded-full bg-brand-200 px-2 py-0.5 font-semibold text-brand-900 [box-decoration-break:clone] [-webkit-box-decoration-break:clone]"
  >
    {children}
  </span>
);

// "From the shelf to your kitchen" on the restaurant home page: a light green card with the title,
// the subtitle and three numbered steps with their drawings (three columns from md up, stacked
// below). Each step's text is one translated sentence with its key phrase marked <hl>…</hl>.
function HomeHowItWorks() {
  const { t } = useTranslation();
  const titleId = useId();

  return (
    <section
      aria-labelledby={titleId}
      data-testid="home-how-it-works"
      className="mt-6 mb-8 flex flex-col items-center gap-10 rounded-[28px] border border-brand-100 bg-brand-50 px-5 pt-12 pb-14 text-center sm:px-10 sm:pt-14 sm:pb-16"
    >
      <div className="flex flex-col items-center gap-2">
        <h2 id={titleId} className="text-[28px] leading-tight font-extrabold tracking-[-0.5px] sm:text-[34px]">
          {t("restaurantHome.howItWorks.title")}
        </h2>
        <p className="text-[17px] text-neutral-600">{t("restaurantHome.howItWorks.subtitle")}</p>
      </div>
      <ol className="grid w-full grid-cols-1 gap-10 md:grid-cols-3 md:gap-8">
        {STEPS.map(({ key, illustration: Illustration }, index) => (
          <li key={key} className="flex flex-col items-center gap-2.5">
            <Illustration />
            <span
              aria-hidden="true"
              className="flex h-[30px] w-[30px] items-center justify-center rounded-full bg-brand-800 text-sm font-extrabold text-white"
            >
              {index + 1}
            </span>
            <h3 className="mt-1 text-xl font-extrabold">{t(`restaurantHome.howItWorks.${key}.title`)}</h3>
            <p className="max-w-[300px] text-base leading-[1.75] text-neutral-700">
              <Trans i18nKey={`restaurantHome.howItWorks.${key}.text`} components={{ hl: <Highlight /> }} />
            </p>
          </li>
        ))}
      </ol>
    </section>
  );
}

export default HomeHowItWorks;
