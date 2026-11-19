import { useTranslation } from "react-i18next";

interface LoadMoreProps {
  shown: number;
  total: number;
  fetching: boolean;
  onLoadMore: () => void;
}

// "Showing 12 of 40" with a "Load more" button below a card list; hidden once everything is shown.
function LoadMore({ shown, total, fetching, onLoadMore }: LoadMoreProps) {
  const { t } = useTranslation();
  if (shown >= total) return null;

  return (
    <div className="flex flex-col items-center gap-2">
      <p className="text-sm text-neutral-500">{t("common.showingOf", { shown, total })}</p>
      <button
        type="button"
        onClick={onLoadMore}
        disabled={fetching}
        className="cursor-pointer rounded-xl border border-brand-200 bg-white px-6 py-2.5 text-sm font-semibold text-brand-800 transition-colors hover:bg-brand-50 disabled:cursor-wait disabled:opacity-60"
      >
        {fetching ? t("common.loading") : t("common.loadMore")}
      </button>
    </div>
  );
}

export default LoadMore;
