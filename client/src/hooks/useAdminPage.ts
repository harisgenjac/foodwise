import { useCallback, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { ADMIN_PAGE_SIZE } from "../utils/admin.js";

// The page of an admin table, kept in the URL (?page=2) so the back button and shared links
// return to it. Page 1 leaves the parameter out; other parameters (store_id, status, ...) stay.
export function useAdminPage(pageSize = ADMIN_PAGE_SIZE) {
  const [searchParams, setSearchParams] = useSearchParams();
  const parsed = Number(searchParams.get("page"));
  const page = Number.isInteger(parsed) && parsed > 1 ? parsed : 1;

  // Unchanged pages are skipped, so typing in a filter (which calls setPage(1)) adds no history.
  const setPage = useCallback(
    (next: number, options?: { replace?: boolean }) => {
      if (next === page) return;
      setSearchParams((current) => {
        const params = new URLSearchParams(current);
        if (next > 1) params.set("page", String(next));
        else params.delete("page");
        return params;
      }, options);
    },
    [page, setSearchParams],
  );

  return { page, offset: (page - 1) * pageSize, setPage };
}

export type SortDir = "asc" | "desc";

// The sorted column of an admin table, kept in the URL next to ?page= (?sort=expiry_date&dir=asc)
// so refresh, the back button and shared links keep it; the server sorts, since the table is paged.
// `keys` are the table's sortable columns: anything else in the URL counts as unsorted. A click
// cycles unsorted → ascending → descending → unsorted, one column at a time (another column starts
// ascending), and goes back to page 1.
export function useAdminSort(keys: readonly string[]) {
  const [searchParams, setSearchParams] = useSearchParams();
  const param = searchParams.get("sort") ?? "";
  const sort = keys.includes(param) ? param : "";
  const dir: SortDir | "" = !sort ? "" : searchParams.get("dir") === "desc" ? "desc" : "asc";

  const toggleSort = useCallback(
    (key: string) => {
      setSearchParams((current) => {
        const params = new URLSearchParams(current);
        params.delete("page");
        if (sort !== key) {
          params.set("sort", key);
          params.set("dir", "asc");
        } else if (dir === "asc") {
          params.set("dir", "desc");
        } else {
          params.delete("sort");
          params.delete("dir");
        }
        return params;
      });
    },
    [sort, dir, setSearchParams],
  );

  return { sort, dir, toggleSort };
}

// After an action empties the last page (or a link names a page that no longer exists), go back
// to the last page that has rows. `total` is null until the first response.
export function useKeepPageInRange(
  page: number,
  total: number | null,
  setPage: (page: number, options?: { replace?: boolean }) => void,
  pageSize = ADMIN_PAGE_SIZE,
) {
  useEffect(() => {
    if (total === null || page === 1) return;
    const lastPage = Math.max(1, Math.ceil(total / pageSize));
    if (page > lastPage) setPage(lastPage, { replace: true });
  }, [page, total, setPage, pageSize]);
}
