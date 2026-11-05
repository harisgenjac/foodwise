import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { Bookmark, Check, ChevronDown, Search, Trash2, X } from "lucide-react";
import { getCategoryIcon } from "../../utils/categoryIcons.js";
import type { ProductTemplate } from "../../types/index.js";

const SEARCH_THRESHOLD = 6;

interface ProductTemplatesPanelProps {
  templates: ProductTemplate[];
  appliedId: number | null;
  onApply: (template: ProductTemplate) => void;
  onDelete: (template: ProductTemplate) => void;
}

// Below lg the list starts collapsed into one row ("Templates (6)", and the applied template's
// name), so the form starts on the first screen; applying a template collapses it again. From lg up
// the list is always open and the row is not shown.
function ProductTemplatesPanel({
  templates,
  appliedId,
  onApply,
  onDelete,
}: ProductTemplatesPanelProps) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const bodyId = useId();
  const applied = templates.find((template) => template.id === appliedId);
  const units = t("units", { returnObjects: true }) as Record<string, string>;
  const [search, setSearch] = useState("");
  const [confirmingId, setConfirmingId] = useState<number | null>(null);

  const visible = templates.filter((template) =>
    template.name.toLowerCase().includes(search.trim().toLowerCase()),
  );

  return (
    <section className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm sm:p-6">
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        aria-expanded={expanded}
        aria-controls={bodyId}
        className="flex min-h-11 w-full cursor-pointer items-center gap-2 text-left lg:hidden"
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-orange-50 text-orange-600">
          <Bookmark className="h-4 w-4" strokeWidth={2} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-base font-semibold text-gray-900">
            {t("templates.toggle", { count: templates.length })}
          </span>
          {applied && (
            <span className="block truncate text-sm text-orange-700">
              {t("templates.appliedShort", { name: applied.name })}
            </span>
          )}
        </span>
        <ChevronDown
          className={`h-5 w-5 shrink-0 text-gray-400 transition-transform ${expanded ? "rotate-180" : ""}`}
          aria-hidden="true"
        />
      </button>

      <div
        id={bodyId}
        className={expanded ? "mt-4 lg:mt-0" : "hidden lg:block"}
      >
        {/* Below lg the row above names the panel, so only the search (when there is one) shows here. */}
        <div
          className={`mb-4 flex-wrap items-start justify-between gap-3 ${templates.length > SEARCH_THRESHOLD ? "flex" : "hidden lg:flex"}`}
        >
          <div className="hidden items-start gap-2 lg:flex">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-orange-50 text-orange-600">
              <Bookmark className="h-4 w-4" strokeWidth={2} />
            </span>
            <div>
              <h2 className="text-base font-semibold leading-8 text-gray-900">
                {t("templates.title")}
              </h2>
              <p className="-mt-1 text-sm text-gray-500">
                {t("templates.subtitle")}
              </p>
            </div>
          </div>
          {templates.length > SEARCH_THRESHOLD && (
            <label className="relative w-full sm:w-56">
              <Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-gray-400 sm:top-2.5" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("templates.search")}
                className="w-full rounded-xl border border-gray-200 py-2.5 pl-9 pr-3 text-base sm:py-2 sm:text-sm focus:border-orange-400 focus:outline-none focus:ring-4 focus:ring-orange-100"
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
                template.quantity &&
                  `${template.quantity} ${units[template.unit] ?? template.unit}`,
              ]
                .filter(Boolean)
                .join(" · ");

              return (
                <li
                  key={template.id}
                  className={`flex items-center gap-2 rounded-xl border p-2 transition-colors ${
                    applied
                      ? "border-orange-400 bg-orange-50 ring-4 ring-orange-100"
                      : "border-gray-200 hover:border-orange-200 hover:bg-orange-50/40"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => {
                      onApply(template);
                      setExpanded(false);
                    }}
                    className="flex min-h-11 min-w-0 flex-1 items-center gap-3 text-left cursor-pointer"
                  >
                    <span
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${applied ? "bg-white text-orange-600" : "bg-gray-50 text-gray-500"}`}
                    >
                      {applied ? (
                        <Check className="h-4 w-4" />
                      ) : (
                        <Icon className="h-4 w-4" strokeWidth={1.8} />
                      )}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-gray-900">
                        {template.name}
                      </span>
                      {details && (
                        <span className="block truncate text-xs text-gray-500">
                          {details}
                        </span>
                      )}
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
                        className="min-h-11 rounded-lg bg-red-500 px-3 py-1 text-xs font-semibold sm:min-h-0 sm:px-2 text-white hover:bg-red-600 cursor-pointer"
                      >
                        {t("templates.deleteConfirm")}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmingId(null)}
                        aria-label={t("product.cancel")}
                        className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg p-1 text-gray-400 sm:min-h-0 sm:min-w-0 hover:bg-gray-100 hover:text-gray-600 cursor-pointer"
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
                      className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg p-1.5 text-gray-400 sm:min-h-0 sm:min-w-0 transition-colors hover:bg-red-50 hover:text-red-600 cursor-pointer"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </li>
              );
            })}
            {visible.length === 0 && (
              <li className="col-span-full py-3 text-center text-sm text-gray-500">
                {t("templates.noResults")}
              </li>
            )}
          </ul>
        )}
      </div>
    </section>
  );
}

export default ProductTemplatesPanel;
