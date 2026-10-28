import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Building2, PencilLine, Store } from "lucide-react";
import api, { assetUrl } from "../../api/axios.js";
import { useAuth } from "../../context/AuthContext.js";
import LoadingSpinner from "../../components/LoadingSpinner.js";
import LoadErrorState from "../../components/product/LoadErrorState.js";
import EmptyState from "../../components/product/EmptyState.js";
import type { Company } from "../../types/index.js";

// The headquarters' start page ("Pregled"): its company and, from the next step, its branches.
function CompanyOverviewPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [company, setCompany] = useState<Company | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get("/company/me")
      .then((response) => setCompany(response.data.company))
      .catch((err) => console.error("Error loading company:", err))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingSpinner />;
  if (!company) return <LoadErrorState />;

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-16">
      <section className="overflow-hidden rounded-2xl border border-orange-100 bg-linear-to-br from-orange-50 via-amber-50/50 to-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-4">
            <span className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl border-4 border-white bg-orange-100 text-orange-700 shadow-sm">
              {company.logo_url ? (
                <img src={assetUrl(company.logo_url)} alt={company.name} className="h-full w-full object-cover" />
              ) : (
                <Building2 className="h-7 w-7" />
              )}
            </span>
            <div className="min-w-0">
              {user?.first_name && (
                <p className="text-sm text-gray-600">{t("company.overview.greeting", { name: user.first_name })}</p>
              )}
              <h1 className="truncate text-2xl font-bold tracking-tight text-gray-900">{company.name}</h1>
              <p className="mt-0.5 text-sm text-gray-500">
                {t("company.overview.branchCount", { count: company.branch_count })}
              </p>
            </div>
          </div>
          <Link
            to="/company/profile"
            className="inline-flex w-fit items-center gap-2 rounded-xl bg-orange-500 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-orange-600"
          >
            <PencilLine className="h-4 w-4" />
            {t("company.overview.editProfile")}
          </Link>
        </div>
        {company.description && <p className="mt-4 whitespace-pre-line text-sm text-gray-700">{company.description}</p>}
      </section>

      <section>
        <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold text-gray-900">
          <Store className="h-5 w-5 text-orange-600" />
          {t("company.overview.branchesTitle")}
        </h2>
        <EmptyState
          icon={Store}
          title={t("company.overview.noBranchesTitle")}
          subtitle={t("company.overview.noBranchesSubtitle")}
        />
      </section>
    </div>
  );
}

export default CompanyOverviewPage;
