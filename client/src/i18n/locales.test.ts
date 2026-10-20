import bs from "./locales/bs.json";
import en from "./locales/en.json";

// Values are strings, nested objects or arrays of strings (e.g. weekday names).
type Tree = { [key: string]: string | Tree } | string[];

const PLURAL_SUFFIX = /_(zero|one|two|few|many|other)$/;

const flatten = (tree: Tree, prefix = ""): string[] =>
  Object.entries(tree).flatMap(([key, value]) =>
    typeof value === "string" ? [`${prefix}${key}`] : flatten(value, `${prefix}${key}.`),
  );

// Plural keys differ per language (Bosnian has one/few/other, English one/other), so compare their base keys.
const baseKeys = (tree: Tree) => new Set(flatten(tree).map((key) => key.replace(PLURAL_SUFFIX, "")));

const pluralBases = (tree: Tree) =>
  new Set(flatten(tree).filter((key) => PLURAL_SUFFIX.test(key)).map((key) => key.replace(PLURAL_SUFFIX, "")));

describe("translation files", () => {
  const locales: Record<string, Tree> = { bs, en };

  it("have the same keys in Bosnian and English", () => {
    const bsKeys = baseKeys(locales.bs);
    const enKeys = baseKeys(locales.en);
    expect([...bsKeys].filter((key) => !enKeys.has(key)), "missing in en.json").toEqual([]);
    expect([...enKeys].filter((key) => !bsKeys.has(key)), "missing in bs.json").toEqual([]);
  });

  it.each(Object.entries(locales))("%s has every plural form its language needs", (lng, tree) => {
    const keys = new Set(flatten(tree));
    const forms = new Intl.PluralRules(lng).resolvedOptions().pluralCategories;
    const missing = [...pluralBases(tree)].flatMap((base) =>
      forms.filter((form) => !keys.has(`${base}_${form}`)).map((form) => `${base}_${form}`),
    );
    expect(missing).toEqual([]);
  });

  it.each(Object.entries(locales))("%s has no empty translations", (_lng, tree) => {
    const empty = flatten(tree).filter((key) => {
      const value = key.split(".").reduce<string | Tree>((node, part) => (node as Record<string, string | Tree>)[part]!, tree);
      return typeof value === "string" && value.trim() === "";
    });
    expect(empty).toEqual([]);
  });
});
