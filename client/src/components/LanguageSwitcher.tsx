// components/LanguageSwitcher.tsx
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

interface Language {
  code: string;
  label: string;
  flag: string;
}

const LANGUAGES: Language[] = [
  { code: "bs", label: "Bosanski", flag: "https://flagcdn.com/24x18/ba.png" },
  { code: "en", label: "English", flag: "https://flagcdn.com/24x18/gb.png" },
];

function LanguageSwitcher() {
  const { i18n } = useTranslation();
  const [isLangOpen, setIsLangOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const currentLanguage =
    LANGUAGES.find((lang) => lang.code === i18n.language) || LANGUAGES[0];

  // Like the header's other dropdowns: an outside tap or Escape closes it.
  useEffect(() => {
    if (!isLangOpen) return;
    const handleMouseDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setIsLangOpen(false);
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setIsLangOpen(false);
      buttonRef.current?.focus();
    };
    document.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isLangOpen]);

  const handleLanguageChange = (code: string) => {
    i18n.changeLanguage(code);
    setIsLangOpen(false);
  };

  return (
    <div className="relative" ref={rootRef}>
      <button
        ref={buttonRef}
        onClick={() => setIsLangOpen(!isLangOpen)}
        aria-expanded={isLangOpen}
        // 44 px high touch target below md.
        className="flex min-h-11 items-center gap-1 px-2 py-2 rounded-lg hover:bg-gray-100 text-sm font-medium md:min-h-0 md:px-3"
      >
        <img src={currentLanguage.flag} alt={currentLanguage.label} className="w-5 h-4 object-cover rounded-sm" />
        <span>{currentLanguage.code.toUpperCase()}</span>
      </button>

      {isLangOpen && (
        <div className="absolute right-0 top-full mt-2 w-40 bg-white border border-gray-200 rounded-lg shadow-lg z-50">
          {LANGUAGES.map((lang) => (
            <button
              key={lang.code}
              onClick={() => handleLanguageChange(lang.code)}
              className={`w-full flex min-h-11 items-center gap-2 px-4 py-2 text-left hover:bg-gray-100 md:min-h-0 ${
                lang.code === i18n.language ? "bg-orange-50 text-orange-600" : ""
              }`}
            >
              <img src={lang.flag} alt={lang.label} className="w-5 h-4 object-cover rounded-sm" />
              <span>{lang.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default LanguageSwitcher;
