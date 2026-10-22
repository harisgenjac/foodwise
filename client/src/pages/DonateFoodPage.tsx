import { useState } from "react";
import { Link } from "react-router-dom";
import toast from "react-hot-toast";
import axios from "axios";
import { useTranslation } from "react-i18next";
import {
  AlertTriangle,
  CircleDot,
  Gift,
  HandCoins,
  HandHeart,
  HeartHandshake,
  Info,
  Pencil,
  Search,
  SearchX,
  Trash2,
  Undo2,
} from "lucide-react";
import api from "../api/axios.js";
import LoadingSpinner from "../components/LoadingSpinner.js";
import ProductPageHeader from "../components/product/ProductPageHeader.js";
import FilterBar, { FilterField } from "../components/product/FilterBar.js";
import EmptyState from "../components/product/EmptyState.js";
import LoadErrorState from "../components/product/LoadErrorState.js";
import Modal from "../components/product/Modal.js";
import DonationCard from "../components/donation/DonationCard.js";
import { inputStyle } from "../components/form/FormField.js";
import { useFetch } from "../hooks/useFetch.js";
import { useDonationLabels } from "../hooks/useDonationLabels.js";
import type { DonationOffer } from "../types/index.js";
import InsufficientCreditsNotice from "../components/credits/InsufficientCreditsNotice.js";
import { getCreditError, type CreditError } from "../utils/credits.js";

function DonateFoodPage() {
  const { t } = useTranslation();
  const labels = useDonationLabels();
  const [name, setName] = useState("");
  const [type, setType] = useState("");
  const [status, setStatus] = useState("");
  const [selectedDonation, setSelectedDonation] = useState<DonationOffer | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [creditError, setCreditError] = useState<CreditError | null>(null);
  const { data: donations, error, loading, refetch } = useFetch<DonationOffer>(
    "/donations/mine",
    "donations",
    { name, type, status },
  );

  const handleDelete = async (donation: DonationOffer) => {
    if (deleting) return;
    setDeleting(true);
    try {
      await api.delete(`/donations/${donation.id}`);
      setSelectedDonation(null);
      refetch();
      toast.success(t("donations.delete.success"));
    } catch (err) {
      const message = axios.isAxiosError(err) ? err.response?.data?.error : null;
      toast.error(message || t("donations.delete.error"));
    } finally {
      setDeleting(false);
    }
  };

  // Undoes "move to donations": the quantity goes back to the product on the marketplace.
  const handleReturn = async (donation: DonationOffer) => {
    if (deleting) return;
    setDeleting(true);
    setCreditError(null);
    try {
      await api.post(`/donations/${donation.id}/return-to-product`);
      setSelectedDonation(null);
      refetch();
      toast.success(t("donations.delete.returnSuccess"));
    } catch (err) {
      // A product that had left the offer costs a credit to publish again.
      const credits = getCreditError(err);
      if (credits) {
        setSelectedDonation(null);
        setCreditError(credits);
        return;
      }
      const message = axios.isAxiosError(err) ? err.response?.data?.error : null;
      toast.error(message || t("donations.delete.returnError"));
    } finally {
      setDeleting(false);
    }
  };

  const clearFilters = () => {
    setName("");
    setType("");
    setStatus("");
  };

  if (loading) {
    return <LoadingSpinner />;
  }

  const hasActiveFilters = Boolean(name || type || status);
  // Only an active donation moved from a product can go back to the marketplace.
  const canReturn = Boolean(
    selectedDonation?.source_product_id && selectedDonation.status === "Available",
  );

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-10">
      <ProductPageHeader
        title={t("donations.title")}
        subtitle={t("donations.subtitle")}
        icon={HeartHandshake}
        count={t("donations.count", { count: donations.length })}
        action={{ to: "/donate-food/new", label: t("donations.newButton"), icon: HandHeart }}
      />

      {creditError && <InsufficientCreditsNotice error={creditError} />}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <div className="flex gap-3 rounded-2xl border border-green-100 bg-green-50/60 p-4">
          <Gift className="h-5 w-5 shrink-0 text-green-600" strokeWidth={1.8} />
          <div>
            <p className="text-sm font-semibold text-gray-900">{t("donations.types.FREE")}</p>
            <p className="mt-0.5 text-xs text-gray-600">{t("donations.typeDescriptions.FREE")}</p>
          </div>
        </div>
        <div className="flex gap-3 rounded-2xl border border-violet-100 bg-violet-50/60 p-4">
          <HandCoins className="h-5 w-5 shrink-0 text-violet-600" strokeWidth={1.8} />
          <div>
            <p className="text-sm font-semibold text-gray-900">{t("donations.types.SPONSORED")}</p>
            <p className="mt-0.5 text-xs text-gray-600">{t("donations.typeDescriptions.SPONSORED")}</p>
          </div>
        </div>
        <div className="flex gap-3 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
          <Info className="h-5 w-5 shrink-0 text-orange-500" strokeWidth={1.8} />
          <div>
            <p className="text-sm font-semibold text-gray-900">{t("donations.info.title")}</p>
            <p className="mt-0.5 text-xs text-gray-600">{t("donations.info.text")}</p>
          </div>
        </div>
      </div>

      <FilterBar hasActiveFilters={hasActiveFilters} onClear={clearFilters} columns={3}>
        <FilterField icon={Search}>
          <input
            type="text"
            placeholder={t("filters.searchByName")}
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={inputStyle}
          />
        </FilterField>
        <FilterField icon={HandHeart}>
          <select
            aria-label={t("donations.filters.type")}
            value={type}
            onChange={(e) => setType(e.target.value)}
            className={inputStyle}
          >
            <option value="">{t("donations.filters.allTypes")}</option>
            <option value="FREE">{t("donations.types.FREE")}</option>
            <option value="SPONSORED">{t("donations.types.SPONSORED")}</option>
          </select>
        </FilterField>
        <FilterField icon={CircleDot}>
          <select
            aria-label={t("donations.filters.status")}
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className={inputStyle}
          >
            <option value="">{t("donations.filters.allStatuses")}</option>
            <option value="Available">{labels.statuses.Available}</option>
            <option value="Expired">{labels.statuses.Expired}</option>
          </select>
        </FilterField>
      </FilterBar>

      {error && donations.length === 0 ? (
        <LoadErrorState />
      ) : donations.length === 0 ? (
        hasActiveFilters ? (
          <EmptyState
            icon={SearchX}
            title={t("donations.noResultsTitle")}
            subtitle={t("donations.noResultsSubtitle")}
          />
        ) : (
          <EmptyState
            icon={HeartHandshake}
            title={t("donations.emptyTitle")}
            subtitle={t("donations.emptySubtitle")}
            action={{ to: "/donate-food/new", label: t("donations.newButton") }}
          />
        )
      ) : (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {donations.map((donation) => (
            <DonationCard
              key={donation.id}
              donation={donation}
              actions={
                <>
                  {donation.status === "Available" && (
                    <Link
                      to={`/donate-food/${donation.id}/edit`}
                      className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-orange-50 py-2.5 text-sm font-semibold text-orange-700 transition-colors hover:bg-orange-500 hover:text-white"
                    >
                      <Pencil className="h-4 w-4" />
                      {t("donations.editButton")}
                    </Link>
                  )}
                  <button
                    type="button"
                    onClick={() => setSelectedDonation(donation)}
                    title={t("donations.delete.button")}
                    aria-label={t("donations.delete.button")}
                    className={`inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-gray-200 px-3 py-2.5 text-sm text-gray-600 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-600 ${
                      donation.status === "Available" ? "" : "flex-1"
                    }`}
                  >
                    <Trash2 className="h-4 w-4" />
                    {donation.status !== "Available" && t("donations.delete.button")}
                  </button>
                </>
              }
            />
          ))}
        </div>
      )}

      {selectedDonation && (
        <Modal onClose={() => setSelectedDonation(null)}>
          <div className="flex flex-col items-center text-center">
            <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-50 text-red-600">
              <AlertTriangle className="h-6 w-6" strokeWidth={1.8} />
            </span>
            <h3 className="text-lg font-bold text-gray-900">
              {canReturn ? t("donations.delete.returnTitle") : t("donations.delete.title")}
            </h3>
            <p className="mt-1 text-sm text-gray-500">
              {canReturn
                ? t("donations.delete.returnText", { name: selectedDonation.name })
                : t("donations.delete.text", { name: selectedDonation.name })}
            </p>
          </div>
          {canReturn && (
            <button
              type="button"
              onClick={() => handleReturn(selectedDonation)}
              disabled={deleting}
              className="mt-6 inline-flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-xl bg-orange-500 py-2.5 font-semibold text-white transition-colors hover:bg-orange-600 disabled:cursor-wait disabled:opacity-60"
            >
              <Undo2 className="h-4 w-4" />
              {t("donations.delete.returnButton")}
            </button>
          )}
          <div className={`${canReturn ? "mt-2" : "mt-6"} flex gap-2`}>
            <button
              type="button"
              onClick={() => setSelectedDonation(null)}
              className="flex-1 cursor-pointer rounded-xl bg-gray-100 py-2.5 font-medium text-gray-700 transition-colors hover:bg-gray-200"
            >
              {t("donations.delete.cancel")}
            </button>
            <button
              type="button"
              onClick={() => handleDelete(selectedDonation)}
              disabled={deleting}
              className="flex-1 cursor-pointer rounded-xl bg-red-600 py-2.5 font-semibold text-white transition-colors hover:bg-red-700 disabled:cursor-wait disabled:opacity-60"
            >
              {canReturn ? t("donations.delete.deleteForGood") : t("donations.delete.confirm")}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

export default DonateFoodPage;
