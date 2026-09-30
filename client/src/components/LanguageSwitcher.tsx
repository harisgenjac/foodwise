// components/LanguageSwitcher.tsx
import { useState } from "react";
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

  const currentLanguage =
    LANGUAGES.find((lang) => lang.code === i18n.language) || LANGUAGES[0];

  const handleLanguageChange = (code: string) => {
    i18n.changeLanguage(code);
    setIsLangOpen(false);
  };

  return (
    <div className="relative">
      <button
        onClick={() => setIsLangOpen(!isLangOpen)}
        className="flex items-center gap-1 px-3 py-2 rounded-lg hover:bg-gray-100 text-sm font-medium"
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
              className={`w-full flex items-center gap-2 px-4 py-2 text-left hover:bg-gray-100 ${
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