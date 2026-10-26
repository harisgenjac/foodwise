import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import toast from "react-hot-toast";
import axios from "axios";
import { useTranslation } from "react-i18next";
import { HandHeart, Pencil } from "lucide-react";
import api from "../api/axios.js";
import LoadingSpinner from "../components/LoadingSpinner.js";
import Breadcrumbs, { BreadcrumbPlaceholder } from "../components/Breadcrumbs.js";
import EmptyState from "../components/product/EmptyState.js";
import DonationForm from "../components/donation/DonationForm.js";
import { donationFormToPayload, donationToForm } from "../utils/donations.js";
import { toDateInput } from "../utils/expiry.js";
import type { DonationFormValues, DonationOffer } from "../types/index.js";

function EditDonationPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [donation, setDonation] = useState<DonationOffer | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchDonation = async () => {
      try {
        const response = await api.get(`/donations/${id}`);
        setDonation(response.data.donation);
      } catch (err) {
        console.error("Error fetching donation:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchDonation();
  }, [id]);

  const handleSubmit = async (values: DonationFormValues) => {
    try {
      const response = await api.put(`/donations/${id}`, donationFormToPayload(values));
      toast.success(response.data.message || t("donations.form.updatedSuccess"));
      navigate("/donate-food");
    } catch (err) {
      const message = axios.isAxiosError(err) ? err.response?.data?.error : null;
      toast.error(message || t("donations.form.saveError"));
    }
  };

  const section = { label: t("sidebar.donateFood"), to: "/donate-food" };

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto">
        <Breadcrumbs items={[section, { label: <BreadcrumbPlaceholder /> }]} />
        <LoadingSpinner />
      </div>
    );
  }

  // Only active donations can be edited; expired ones are shown on the list only.
  if (!donation || donation.status !== "Available") {
    return (
      <div className="max-w-5xl mx-auto space-y-6">
        <Breadcrumbs items={[section]} />
        <EmptyState
          icon={HandHeart}
          title={t("donations.form.notFoundTitle")}
          subtitle={t("donations.form.notFoundSubtitle")}
          action={{ to: "/donate-food", label: t("donations.form.backToList") }}
        />
      </div>
    );
  }

  const today = toDateInput(new Date());

  // There is no donation detail page, so the donation itself is the last item.
  return (
    <>
      <Breadcrumbs className="mx-auto mb-4 max-w-6xl" items={[section, { label: donation.name }]} />
      <DonationForm
        title={t("donations.form.editTitle")}
        subtitle={t("donations.form.editSubtitle")}
        icon={Pencil}
        initialValues={donationToForm(donation)}
        submitLabel={t("donations.form.submitEdit")}
        minExpiryDate={donation.expiry_date < today ? undefined : today}
        onSubmit={handleSubmit}
      />
    </>
  );
}

export default EditDonationPage;
