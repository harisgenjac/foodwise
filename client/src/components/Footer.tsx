import { Fragment, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Leaf } from "lucide-react";
import api from "../api/axios.js";

interface FooterLink {
  key: string;
  // An in-app route or an external href; without either the item is plain text (its page does not exist yet).
  to?: string;
  href?: string;
}

const FOOTER_LINKS: FooterLink[] = [
  { key: "help" },
  { key: "contact", href: "mailto:foodwize@testing.com" },
  { key: "terms" },
  { key: "privacy" },
];

const linkStyle = "text-gray-700 transition-colors hover:text-orange-600";

interface FooterProps {
  // The impact counter needs a login, so the login page leaves it out.
  showImpact?: boolean;
}

// Slim footer at the end of every page: the platform's food-saved counter, help and legal
// links, copyright and the app version.
function Footer({ showImpact = true }: FooterProps) {
  const { t, i18n } = useTranslation();
  const [kg, setKg] = useState(0);

  useEffect(() => {
    if (!showImpact) return;
    let active = true;
    api
      .get("/stats/impact")
      .then((response) => {
        if (active) setKg(Number(response?.data?.kg) || 0);
      })
      .catch((err) => console.error("Error loading impact statistics:", err));
    return () => {
      active = false;
    };
  }, [showImpact]);

  const roundedKg = Math.round(kg);
  const formattedKg = roundedKg.toLocaleString(i18n.language === "en" ? "en-US" : "bs-BA");

  return (
    <footer className="mx-auto mt-auto w-full max-w-6xl border-t border-gray-200 pt-4 text-sm text-gray-500">
      <div className="flex flex-col items-center gap-2 text-center sm:flex-row sm:justify-between sm:text-left">
        {showImpact && roundedKg > 0 ? (
          <p className="flex items-center gap-1.5">
            <Leaf className="h-4 w-4 shrink-0 text-green-600" strokeWidth={1.8} aria-hidden="true" />
            {t("footer.impact", { kg: formattedKg })}
          </p>
        ) : (
          <span className="hidden sm:block" />
        )}
        <nav aria-label={t("footer.linksLabel")} className="flex flex-wrap items-center justify-center gap-x-1 sm:gap-x-4">
          {FOOTER_LINKS.map(({ key, to, href }, index) => (
            <Fragment key={key}>
              {index > 0 && (
                <span aria-hidden="true" className="sm:hidden">
                  ·
                </span>
              )}
              {to ? (
                <Link to={to} className={linkStyle}>
                  {t(`footer.${key}`)}
                </Link>
              ) : href ? (
                <a href={href} className={linkStyle}>
                  {t(`footer.${key}`)}
                </a>
              ) : (
                <span>{t(`footer.${key}`)}</span>
              )}
            </Fragment>
          ))}
        </nav>
      </div>
      <div className="mt-2 flex flex-col items-center gap-1 text-xs text-gray-400 sm:flex-row sm:justify-between">
        <span>© {new Date().getFullYear()} FoodWise · Još vrijedi</span>
        <span>v{__APP_VERSION__}</span>
      </div>
    </footer>
  );
}

export default Footer;
