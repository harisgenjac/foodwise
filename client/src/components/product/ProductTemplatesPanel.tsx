import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Bookmark, Check, Search, Trash2, X } from "lucide-react";
import { getCategoryIcon } from "../../utils/categoryIcons.js";
import type { ProductTemplate } from "../../types/index.js";

const SEARCH_THRESHOLD = 6;

interface ProductTemplatesPanelProps {
  templates: ProductTemplate[];
  appliedId: number | null;
  onApply: (template: ProductTemplate) => void;
  onDelete: (template: ProductTemplate) => void;
}

function ProductTemplatesPanel({ templates, appliedId, onApply, onDelete }: ProductTemplatesPanelProps) {
  const { t } = useTranslation();
  const units = t("units", { returnObjects: true }) as Record<string, string>;
  const [search, setSearch] = useState("");
  const [confirmingId, setConfirmingId] = useState<number | null>(null);

  const visible = templates.filter((template) =>
    template.name.toLowerCase().includes(search.trim().toLowerCase()),
  );

  return (
    <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-orange-50 text-orange-600">
            <Bookmark className="h-4 w-4" strokeWidth={2} />
          </span>
          <div>
            <h2 className="text-base font-semibold leading-8 text-gray-900">{t("templates.title")}</h2>
            <p className="-mt-1 text-sm text-gray-500">{t("templates.subtitle")}</p>
          </div>
        </div>
        {templates.length > SEARCH_THRESHOLD && (
          <label className="relative w-full sm:w-56">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("templates.search")}
              className="w-full rounded-xl border border-gray-200 py-2 pl-9 pr-3 text-sm focus:border-orange-400 focus:outline-none focus:ring-4 focus:ring-orange-100"
            />
          </label>
        )}
      </div>

      {templates.length === 0 ? (
        <p className="rounded-xl border-2 border-dashed border-gray-200 px-4 py-5 text-center text-sm text-gray-500">
          {t("templates.empty")}
        </p>
      ) : (
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {visible.map((template) => {
            const Icon = getCategoryIcon(template.category);
            const applied = appliedId === template.id;
            const confirming = confirmingId === template.id;
            const details = [
              template.discounted_price && `${template.discounted_price} KM`,
              template.quantity && `${template.quantity} ${units[template.unit] ?? template.unit}`,
            ]
              .filter(Boolean)
              .join(" · ");

            return (
              <li
                key={template.id}
                className={`flex items-center gap-2 rounded-xl border p-2 transition-colors ${
                  applied ? "border-orange-400 bg-orange-50 ring-4 ring-orange-100" : "border-gray-200 hover:border-orange-200 hover:bg-orange-50/40"
                }`}
              >
                <button
                  type="button"
                  onClick={() => onApply(template)}
                  className="flex min-w-0 flex-1 items-center gap-3 text-left cursor-pointer"
                >
                  <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${applied ? "bg-white text-orange-600" : "bg-gray-50 text-gray-500"}`}>
                    {applied ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" strokeWidth={1.8} />}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-gray-900">{template.name}</span>
                    {details && <span className="block truncate text-xs text-gray-500">{details}</span>}
                  </span>
                </button>

                {confirming ? (
                  <span className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        setConfirmingId(null);
                        onDelete(template);
                      }}
                      className="rounded-lg bg-red-500 px-2 py-1 text-xs font-semibold text-white hover:bg-red-600 cursor-pointer"
                    >
                      {t("templates.deleteConfirm")}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmingId(null)}
                      aria-label={t("product.cancel")}
                      className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 cursor-pointer"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmingId(template.id)}
                    aria-label={t("templates.delete")}
                    title={t("templates.delete")}
                    className="shrink-0 rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600 cursor-pointer"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </li>
            );
          })}
          {visible.length === 0 && (
            <li className="col-span-full py-3 text-center text-sm text-gray-500">{t("templates.noResults")}</li>
          )}
        </ul>
      )}
    </section>
  );
}

export default ProductTemplatesPanel;
