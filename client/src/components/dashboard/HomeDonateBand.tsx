import { useId } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Heart, Star } from "lucide-react";

const BUTTON =
  "inline-flex h-[52px] items-center gap-2.5 rounded-full bg-brand-800 px-7 text-base font-bold text-white transition-colors hover:bg-brand-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-800";

// The warm band at the end of the restaurant home page: the uppercase Barlow Condensed heading, a
// sentence and two green pills, "Donate a meal" (the donate food page) and "Become a sponsor" (the
// coming-soon sponsor page). It spans the content area edge to edge (it cancels the layout's side
// padding), and its tall bottom padding leaves room for the footer's arch, which overlaps it.
function HomeDonateBand() {
  const { t } = useTranslation();
  const titleId = useId();

  return (
    <section
      aria-labelledby={titleId}
      data-testid="home-donate"
      className="-mx-4 flex flex-col items-center gap-3.5 bg-[#F3F1EA] px-6 pt-14 pb-28 text-center sm:-mx-6 sm:px-8 sm:pt-[72px] sm:pb-32"
    >
      <h2
        id={titleId}
        className="max-w-[900px] font-condensed text-[34px] leading-[1.05] font-extrabold tracking-[0.5px] text-brand-900 uppercase sm:text-[44px]"
      >
        {t("restaurantHome.donate.title")}
      </h2>
      <p className="max-w-[560px] text-[17px] leading-[1.6] text-neutral-700">{t("restaurantHome.donate.text")}</p>
      <div className="mt-[18px] flex flex-wrap justify-center gap-4">
        <Link to="/donate-food" className={BUTTON}>
          <Heart className="h-5 w-5" strokeWidth={2} aria-hidden="true" />
          {t("restaurantHome.donate.donate")}
        </Link>
        <Link to="/sponsor" className={BUTTON}>
          <Star className="h-5 w-5" strokeWidth={2} aria-hidden="true" />
          {t("restaurantHome.donate.sponsor")}
        </Link>
      </div>
    </section>
  );
}

export default HomeDonateBand;
