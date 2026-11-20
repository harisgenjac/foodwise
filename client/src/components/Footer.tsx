import type { MouseEvent, ReactNode } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import Logo from "./brand/Logo.js";
import { BRAND_NAME } from "../utils/brand.js";

// A footer link. TODO: none of these pages or accounts exist yet; give each its `href` (or turn it
// into a router link) once it does. Until then they render as links that do not navigate.
interface FooterLink {
  key: string;
  href?: string;
}

export const FOOTER_INFO_LINKS: FooterLink[] = [{ key: "about" }, { key: "support" }, { key: "contact" }, { key: "partner" }];
export const FOOTER_LEGAL_LINKS: FooterLink[] = [
  { key: "terms" },
  { key: "privacy" },
  { key: "cookies" },
  { key: "impact" },
  { key: "help" },
];

const ICON = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
  className: "h-7 w-7",
} as const;

// The social accounts (the names are brands, the same in every language); `href` as above.
export const FOOTER_SOCIAL_LINKS: { name: string; href?: string; icon: ReactNode }[] = [
  {
    name: "Instagram",
    icon: (
      <svg {...ICON}>
        <rect x="3" y="3" width="18" height="18" rx="5" />
        <circle cx="12" cy="12" r="4" />
        <path d="M17.5 6.5h.01" />
      </svg>
    ),
  },
  {
    name: "Facebook",
    icon: (
      <svg {...ICON}>
        <path d="M15 3h-2.5A3.5 3.5 0 0 0 9 6.5V10H6v3h3v8h3.5v-8h3l.5-3h-3.5V7a1 1 0 0 1 1-1H15z" />
      </svg>
    ),
  },
  {
    name: "LinkedIn",
    icon: (
      <svg {...ICON}>
        <path d="M4 9h4v11H4zM6 4.5h.01M11 20V9h3.6v1.6c.7-1.1 2-1.9 3.4-1.9 2.2 0 3 1.5 3 4V20h-4v-6c0-1-.4-1.8-1.5-1.8S14 13 14 14v6z" />
      </svg>
    ),
  },
  {
    name: "TikTok",
    icon: (
      <svg {...ICON}>
        <path d="M14 3v11.5a3.5 3.5 0 1 1-3.5-3.5M14 3c.5 2.6 2.4 4.4 5 4.6" />
      </svg>
    ),
  },
  {
    name: "YouTube",
    icon: (
      <svg {...ICON}>
        <rect x="2.5" y="5.5" width="19" height="13" rx="4" />
        <path d="M10 9.5v5l4.5-2.5z" />
      </svg>
    ),
  },
];

// A link whose page does not exist yet stays on the page.
const stayHere = (href: string | undefined) => (event: MouseEvent<HTMLAnchorElement>) => {
  if (!href) event.preventDefault();
};

const FOCUS = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime";

// The faint outline food drawings behind the footer (as in the hero). Decorative.
function FooterDoodles() {
  return (
    <svg
      viewBox="0 0 1100 260"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 h-full w-full"
    >
      <g fill="none" stroke="#1F6B3D" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M60 60c18-18 46-14 56 6 8 18-4 40-26 44-20 4-38-10-38-28 0-8 3-16 8-22z" />
        <path d="M88 52c2-10 8-18 18-20" />
        <circle cx="260" cy="190" r="26" />
        <path d="M260 164v-12M247 154c6 6 20 6 26 0" />
        <path d="M420 40c-20 10-30 34-20 56 22-6 36-28 30-52-4-2-6-4-10-4z" />
        <path d="M406 92l20-44" />
        <path d="M700 200c0-26 20-44 44-44s44 18 44 44H700z" />
        <path d="M720 200v-12M744 200v-20M768 200v-12" />
        <path d="M880 60l50-50M890 70c-12-4-20-16-14-26l34-34c8-6 22 0 26 12 2 6-2 14-6 18l-26 26c-4 4-8 6-14 4z" />
        <path d="M1010 160c14 0 26 12 26 26s-12 26-26 26-26-12-26-26 12-26 26-26zM1010 134v26" />
        <path d="M560 230c10-24 34-38 58-32-4 24-28 40-52 36z" />
        <circle cx="160" cy="230" r="10" />
        <circle cx="980" cy="40" r="12" />
      </g>
    </svg>
  );
}

interface FooterProps {
  // The restaurant home page's donation band ends right where the footer starts, so the arch
  // overlaps it; elsewhere the footer keeps room above it for the arch.
  flush?: boolean;
  // Room under the legal bar for the phone's bottom navigation bar.
  bottomNavSpace?: boolean;
}

// The footer of every page (design/restaurant-home/home.dc.html), in Plus Jakarta Sans: dark green
// with faint food drawings and a top edge that rises in a soft arch; the logo with the name, the
// uppercase information links (Barlow Condensed) and the social icons, then a darker bar with the
// legal links and the copyright. Side by side from md up, stacked and centred on phones.
function Footer({ flush = false, bottomNavSpace = false }: FooterProps) {
  const { t } = useTranslation();
  const [firstWord, ...rest] = BRAND_NAME.split(" ");

  return (
    <footer className={`relative bg-brand-900 font-jakarta text-white ${flush ? "" : "mt-14"}`}>
      <svg
        viewBox="0 0 1440 57"
        preserveAspectRatio="none"
        aria-hidden="true"
        data-testid="footer-arch"
        className="pointer-events-none absolute inset-x-0 -top-14 block h-[57px] w-full"
      >
        <path d="M0 57C360 0 1080 0 1440 57z" className="fill-brand-900" />
      </svg>
      <FooterDoodles />

      <div className="relative grid grid-cols-1 items-center justify-items-center gap-6 px-6 pt-7 pb-10 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] md:px-12">
        <Link
          to="/dashboard"
          aria-label={t("footer.home")}
          className={`inline-flex items-center gap-3 rounded-lg text-white md:justify-self-start ${FOCUS}`}
        >
          <Logo variant="mark" decorative className="h-14 w-14" />
          <span className="text-[22px] font-extrabold tracking-[-0.3px]">
            {firstWord} <span className="text-lime">{rest.join(" ")}</span>
          </span>
        </Link>

        <div className="flex flex-col items-center gap-[18px]">
          <nav
            aria-label={t("footer.infoLabel")}
            className="flex flex-wrap justify-center gap-x-8 font-condensed text-[21px] font-extrabold tracking-[0.6px] uppercase"
          >
            {FOOTER_INFO_LINKS.map(({ key, href }) => (
              <a key={key} href={href ?? "#"} onClick={stayHere(href)} className={`inline-flex min-h-11 items-center text-white hover:text-lime ${FOCUS}`}>
                {t(`footer.${key}`)}
              </a>
            ))}
          </nav>
          <ul aria-label={t("footer.socialLabel")} className="flex flex-wrap justify-center gap-2.5">
            {FOOTER_SOCIAL_LINKS.map(({ name, href, icon }) => (
              <li key={name}>
                <a
                  href={href ?? "#"}
                  onClick={stayHere(href)}
                  aria-label={name}
                  className={`flex h-11 w-11 items-center justify-center rounded-full text-brand-300 hover:text-lime ${FOCUS}`}
                >
                  {icon}
                </a>
              </li>
            ))}
          </ul>
        </div>
        <div aria-hidden="true" className="hidden md:block" />
      </div>

      <div
        className={`relative flex flex-col items-center gap-3.5 bg-[#0F4423] px-6 pt-[22px] md:px-12 ${
          bottomNavSpace ? "pb-[calc(6.5rem+env(safe-area-inset-bottom))] md:pb-[26px]" : "pb-[26px]"
        }`}
      >
        <nav aria-label={t("footer.legalLabel")} className="flex flex-wrap justify-center gap-x-11 text-sm font-medium">
          {FOOTER_LEGAL_LINKS.map(({ key, href }) => (
            <a key={key} href={href ?? "#"} onClick={stayHere(href)} className={`inline-flex min-h-11 items-center text-brand-100 hover:text-white ${FOCUS}`}>
              {t(`footer.${key}`)}
            </a>
          ))}
        </nav>
        <p className="text-[13px] text-brand-200">{t("footer.copyright", { year: new Date().getFullYear() })}</p>
      </div>
    </footer>
  );
}

export default Footer;
