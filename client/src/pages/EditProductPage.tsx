import { useState, useEffect } from "react";
import api from "../api/axios.js";
import axios from "axios";
import { Link, useNavigate, useParams } from "react-router-dom";
import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";
import { AlertCircle, Pencil, Save, SearchX } from "lucide-react";
import { useAuth } from "../context/AuthContext.js";
import LoadingSpinner from "../components/LoadingSpinner.js";
import EmptyState from "../components/product/EmptyState.js";
import ProductFormFields, { EMPTY_PRODUCT_FORM } from "../components/product/ProductFormFields.js";
import ProductPreview from "../components/product/ProductPreview.js";
import type { Product, ProductFormValues } from "../types/index.js";

function EditProductPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [form, setForm] = useState<ProductFormValues>(EMPTY_PRODUCT_FORM);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const { t } = useTranslation();

  const fetchProduct = async () => {
    try {
      const response = await api.get("/products/" + id);
      const data: Product = response.data.product;
      // Only the owner may edit; the server would refuse the PUT anyway.
      if (data.store_id !== user?.id) {
        setNotFound(true);
        return;
      }
      setForm({
        name: data.name,
        description: data.description,
        category: data.category,
        original_price: data.original_price,
        discounted_price: data.discounted_price,
        quantity: data.quantity,
        unit: data.unit,
        expiry_date: data.expiry_date.slice(0, 10),
      });
    } catch (err) {
      console.error("Error fetching product:", err);
      setNotFound(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProduct();
  }, [id]);

  const updateField = (field: keyof ProductFormValues, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const handleSubmit = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (Object.values(form).some((value) => !value)) {
      setError(t("product.fillAllFields"));
      return;
    }
    setSaving(true);
    try {
      const response = await api.put("/products/" + id, form);
      toast.success(response.data.message);
      navigate("/my-products");
    } catch (err) {
      // The server explains why (sold product, invalid field).
      const message = axios.isAxiosError(err)
        ? err.response?.data?.error
        : null;
      setError(message || t("product.editError"));
      toast.error(message || t("product.editError"));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <LoadingSpinner />;
  }

  if (notFound) {
    return (
      <div className="max-w-5xl mx-auto pb-10">
        <EmptyState
          icon={SearchX}
          title={t("myProducts.productNotFoundTitle")}
          subtitle={t("myProducts.notFoundSubtitle")}
          action={{ to: "/my-products", label: t("myProducts.backToList") }}
        />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto pb-16">
      <div className="mb-6">
        <h1 className="flex items-center gap-3 text-2xl font-bold tracking-tight text-gray-900">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-50 text-orange-600">
            <Pencil className="h-5 w-5" strokeWidth={1.8} />
          </span>
          {t("product.editTitle")}
        </h1>
        <p className="mt-2 text-sm text-gray-500">{t("product.editSubtitle")}</p>
      </div>

      {error && (
        <p className="mb-6 flex items-center gap-2 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </p>
      )}

      <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {/* The published quantity and expiry date were paid for with a credit, so they stay fixed. */}
          <ProductFormFields values={form} onChange={updateField} stockLocked />
        </div>

        <aside className="lg:sticky lg:top-0 lg:self-start space-y-4">
          <ProductPreview values={form} />

          <button
            type="submit"
            disabled={saving}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-orange-500 py-3 font-semibold text-white shadow-sm shadow-orange-500/20 transition-all hover:-translate-y-0.5 hover:bg-orange-600 hover:shadow-md disabled:translate-y-0 disabled:opacity-60 cursor-pointer"
          >
            <Save className="h-5 w-5" strokeWidth={1.8} />
            {t("product.saveChanges")}
          </button>
          <Link
            to={`/products/${id}`}
            className="block w-full rounded-xl border border-gray-200 bg-white py-2.5 text-center text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
          >
            {t("product.cancel")}
          </Link>
        </aside>
      </form>
    </div>
  );
}

export default EditProductPage;
