import { useId, type ComponentType } from "react";
import { Trans, useTranslation } from "react-i18next";
import { ChooseDeliveryIllustration, CookTodayIllustration, FindOfferIllustration } from "./HowItWorksIllustrations.js";

interface Step {
  key: "find" | "choose" | "cook";
  Illustration: ComponentType;
}

const STEPS: Step[] = [
  { key: "find", Illustration: FindOfferIllustration },
  { key: "choose", Illustration: ChooseDeliveryIllustration },
  { key: "cook", Illustration: CookTodayIllustration },
];

// The key phrase in a step's text: a soft orange pill that wraps across lines.
const HIGHLIGHT = (
  <span
    data-testid="how-it-works-highlight"
    className="rounded-full bg-[#FED7AA] px-[7px] py-px [-webkit-box-decoration-break:clone] [box-decoration-break:clone]"
  />
);

// "How it works" on the restaurant dashboard (design/restaurant-home/how-it-works.html): three
// numbered steps with an illustration, side by side from md up and stacked on phones. Each text is
// one i18n string with the highlighted phrase marked as <hl>…</hl>.
function HowItWorks() {
  const { t } = useTranslation();
  const titleId = useId();

  return (
    <section aria-labelledby={titleId} data-testid="how-it-works" className="px-4 pt-14 pb-[60px] text-center">
      <h2 id={titleId} className="mb-9 text-[28px] font-bold text-[#1C1917] md:text-[34px]">
        {t("howItWorks.title")}
      </h2>
      <ol className="mx-auto grid max-w-5xl grid-cols-1 gap-10 md:grid-cols-3 md:gap-8">
        {STEPS.map(({ key, Illustration }, index) => (
          <li key={key} data-testid="how-it-works-step">
            <Illustration />
            <span
              aria-hidden="true"
              className="mb-2 inline-flex h-7 w-7 items-center justify-center rounded-full bg-[#0F766E] text-sm font-semibold text-white"
            >
              {index + 1}
            </span>
            <h3 className="mb-2.5 text-xl font-bold text-[#1C1917]">{t(`howItWorks.${key}.title`)}</h3>
            <p className="mx-auto max-w-[300px] text-base leading-[1.7] text-[#44403C]">
              <Trans i18nKey={`howItWorks.${key}.text`} components={{ hl: HIGHLIGHT }} />
            </p>
          </li>
        ))}
      </ol>
    </section>
  );
}

export default HowItWorks;
