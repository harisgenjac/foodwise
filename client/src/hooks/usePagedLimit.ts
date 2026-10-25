import { useCallback, useState } from "react";

// "Load more" paging: the list asks for `limit` rows, and each load raises it by a page. A new
// `resetKey` (the filters, e.g. JSON.stringify of them) starts again from the first page.
// Reloading after an action keeps the current limit, so the list does not collapse to one page.
export function usePagedLimit(pageSize: number, resetKey = "") {
  const [state, setState] = useState({ key: resetKey, limit: pageSize });
  const limit = state.key === resetKey ? state.limit : pageSize;

  const loadMore = useCallback(
    () => setState({ key: resetKey, limit: limit + pageSize }),
    [resetKey, limit, pageSize],
  );

  return { limit, loadMore };
}
