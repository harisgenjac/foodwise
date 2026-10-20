import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import axios from "axios";
import { useTranslation } from "react-i18next";
import { HandHeart } from "lucide-react";
import api from "../api/axios.js";
import { useAuth } from "../context/AuthContext.js";
import LoadingSpinner from "../components/LoadingSpinner.js";
import DonationForm from "../components/donation/DonationForm.js";
import {
  EMPTY_DONATION_FORM,
  MEAL_CATEGORY,
  PORTION_UNIT,
  donationFormToPayload,
} from "../utils/donations.js";
import { toDateInput } from "../utils/expiry.js";
import type { DonationFormValues } from "../types/index.js";

function AddDonationPage() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const { t } = useTranslation();

  // The starting values depend on the role, so wait for the user before the form takes them.
  if (loading) return <LoadingSpinner />;

  // Restaurants mostly donate meals, so their form starts on meals in portions.
  const initialValues: DonationFormValues =
    user?.role === "RESTAURANT"
      ? { ...EMPTY_DONATION_FORM, category: MEAL_CATEGORY, unit: PORTION_UNIT }
      : EMPTY_DONATION_FORM;

  const handleSubmit = async (values: DonationFormValues) => {
    try {
      await api.post("/donations", donationFormToPayload(values));
      toast.success(t("donations.form.addedSuccess"));
      navigate("/donate-food");
      return null;
    } catch (err) {
      const message = axios.isAxiosError(err) ? err.response?.data?.error : null;
      toast.error(message || t("donations.form.saveError"));
      return message || t("donations.form.saveError");
    }
  };

  return (
    <DonationForm
      title={t("donations.form.addTitle")}
      subtitle={t("donations.form.addSubtitle")}
      icon={HandHeart}
      initialValues={initialValues}
      submitLabel={t("donations.form.submitAdd")}
      minExpiryDate={toDateInput(new Date())}
      onSubmit={handleSubmit}
    />
  );
}

export default AddDonationPage;
