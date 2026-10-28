import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { MapPin, Search, ShieldCheck, ToggleLeft, UserPlus, Users } from "lucide-react";
import { useFetch } from "../../hooks/useFetch.js";
import { useAdminPage, useAdminSort, useKeepPageInRange } from "../../hooks/useAdminPage.js";
import ProductPageHeader from "../../components/product/ProductPageHeader.js";
import FilterBar, { FilterField } from "../../components/product/FilterBar.js";
import { inputStyle } from "../../components/form/FormField.js";
import CitySelect from "../../components/form/CitySelect.js";
import EmptyState from "../../components/product/EmptyState.js";
import LoadErrorState from "../../components/product/LoadErrorState.js";
import LoadingSpinner from "../../components/LoadingSpinner.js";
import Pagination from "../../components/admin/Pagination.js";
import SortableHeader from "../../components/admin/SortableHeader.js";
import {
  ADMIN_PAGE_SIZE,
  ROLES,
  ROLE_STYLES,
  accountName,
  formatDateTime,
  isEffectivelyBlocked,
} from "../../utils/admin.js";
import { getAccountSetup } from "../../utils/accountSetup.js";
import type { User } from "../../types/index.js";

// Sortable columns (the server whitelist of GET /admin/users).
const SORT_KEYS = ["created_at"];

function AdminUsersPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [role, setRole] = useState("");
  const [blocked, setBlocked] = useState("");
  const [cityId, setCityId] = useState("");
  const { page, offset, setPage } = useAdminPage();
  const { sort, dir, toggleSort } = useAdminSort(SORT_KEYS);

  const { data: users, total, loading, error } = useFetch<User>("/admin/users", "users", {
    q,
    role,
    blocked,
    city_id: cityId,
    sort,
    dir,
    limit: ADMIN_PAGE_SIZE,
    offset,
  });
  useKeepPageInRange(page, total, setPage);

  const roles = t("admin.roles", { returnObjects: true }) as Record<string, string>;
  const hasActiveFilters = Boolean(q || role || blocked || cityId);
  // Any filter change goes back to the first page.
  const filter = (setter: (value: string) => void) => (value: string) => {
    setter(value);
    setPage(1);
  };
  const clearFilters = () => {
    setQ("");
    setRole("");
    setBlocked("");
    setCityId("");
    setPage(1);
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-16">
      <ProductPageHeader
        title={t("admin.users.title")}
        subtitle={t("admin.users.subtitle")}
        icon={Users}
        count={total === null ? undefined : t("admin.users.count", { count: total })}
        action={{ to: "/admin/users/new", label: t("admin.dashboard.newUser"), icon: UserPlus }}
      />

      <FilterBar hasActiveFilters={hasActiveFilters} onClear={clearFilters}>
        <FilterField icon={Search}>
          <input
            type="text"
            value={q}
            onChange={(e) => filter(setQ)(e.target.value)}
            placeholder={t("admin.users.search")}
            aria-label={t("admin.users.search")}
            className={inputStyle}
          />
        </FilterField>
        <FilterField icon={ShieldCheck}>
          <select
            value={role}
            onChange={(e) => filter(setRole)(e.target.value)}
            aria-label={t("admin.users.columnRole")}
            className={inputStyle}
          >
            <option value="">{t("admin.users.allRoles")}</option>
            {ROLES.map((code) => (
              <option key={code} value={code}>
                {roles[code]}
              </option>
            ))}
          </select>
        </FilterField>
        <FilterField icon={ToggleLeft}>
          <select
            value={blocked}
            onChange={(e) => filter(setBlocked)(e.target.value)}
            aria-label={t("admin.users.columnStatus")}
            className={inputStyle}
          >
            <option value="">{t("admin.users.allStatuses")}</option>
            <option value="false">{t("admin.common.active")}</option>
            <option value="true">{t("admin.common.blocked")}</option>
          </select>
        </FilterField>
        <FilterField icon={MapPin}>
          <CitySelect
            value={cityId}
            onChange={filter(setCityId)}
            emptyLabel={t("cities.all")}
            aria-label={t("cities.label")}
            className={inputStyle}
          />
        </FilterField>
      </FilterBar>

      {loading ? (
        <LoadingSpinner />
      ) : error ? (
        <LoadErrorState />
      ) : users.length === 0 ? (
        hasActiveFilters ? (
          <EmptyState icon={Users} title={t("admin.users.noResultsTitle")} subtitle={t("admin.users.noResultsSubtitle")} />
        ) : (
          <EmptyState
            icon={Users}
            title={t("admin.users.emptyTitle")}
            subtitle={t("admin.users.emptySubtitle")}
            action={{ to: "/admin/users/new", label: t("admin.dashboard.newUser") }}
          />
        )
      ) : (
        <>
          <div className="overflow-x-auto rounded-2xl border border-gray-100 bg-white shadow-sm">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-gray-100 bg-gray-50 text-xs font-semibold uppercase tracking-wider text-gray-500">
                <tr>
                  <th className="px-4 py-3">{t("admin.users.columnUser")}</th>
                  <th className="px-4 py-3">{t("admin.users.columnRole")}</th>
                  <th className="hidden px-4 py-3 md:table-cell">{t("admin.users.columnCity")}</th>
                  <th className="px-4 py-3">{t("admin.users.columnStatus")}</th>
                  <SortableHeader
                    label={t("admin.users.columnCreated")}
                    sortKey="created_at"
                    sort={sort}
                    dir={dir}
                    onSort={toggleSort}
                    className="hidden px-4 py-3 md:table-cell"
                  />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {users.map((user) => (
                  <tr
                    key={user.id}
                    onClick={() => navigate(`/admin/users/${user.id}`)}
                    className="cursor-pointer transition-colors hover:bg-orange-50/40"
                  >
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900">{accountName(user)}</p>
                      <p className="text-xs text-gray-500">{user.email}</p>
                      {user.role === "COMPANY" && user.company_name && (
                        <p className="text-xs text-teal-700">{user.company_name}</p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${ROLE_STYLES[user.role]}`}>
                        {roles[user.role]}
                      </span>
                    </td>
                    <td className="hidden px-4 py-3 text-gray-600 md:table-cell">{user.city || "—"}</td>
                    <td className="px-4 py-3">
                      {isEffectivelyBlocked(user) ? (
                        <span className="rounded-full bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-600">
                          {t("admin.common.blocked")}
                        </span>
                      ) : getAccountSetup(user).missingFields.length > 0 ? (
                        <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700">
                          {t("admin.common.incompleteProfile")}
                        </span>
                      ) : (
                        <span className="rounded-full bg-green-50 px-2.5 py-1 text-xs font-semibold text-green-700">
                          {t("admin.common.active")}
                        </span>
                      )}
                      {user.must_change_password && (
                        <span className="mt-1 block w-fit rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">
                          {t("admin.common.pendingPassword")}
                        </span>
                      )}
                    </td>
                    <td className="hidden px-4 py-3 text-gray-500 md:table-cell">
                      {user.created_at ? formatDateTime(user.created_at) : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination total={total ?? 0} limit={ADMIN_PAGE_SIZE} offset={offset} onChange={(next) => setPage(next / ADMIN_PAGE_SIZE + 1)} />
        </>
      )}
    </div>
  );
}

export default AdminUsersPage;
