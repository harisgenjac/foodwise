// A number in the interface language: bs "1.246,50", en "1,246.50", with `maxDigits` decimals at
// most and `minDigits` at least (by default exactly `maxDigits`). Bosnian swaps the English
// separators instead of asking Intl for "bs-BA": browsers built with a reduced ICU (Playwright's
// Chromium, some WebViews) know the locale but format it like English.
export const formatNumber = (value: number, language: string, maxDigits: number, minDigits = maxDigits) => {
  const english = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: minDigits,
    maximumFractionDigits: maxDigits,
  }).format(value);
  return language === "en" ? english : english.replace(/[.,]/g, (separator) => (separator === "." ? "," : "."));
};
