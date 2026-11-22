import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";
import { Store } from "lucide-react";
import api, { apiErrorMessage } from "../api/axios.js";
import { useFetch } from "../hooks/useFetch.js";
import { usePagedLimit } from "../hooks/usePagedLimit.js";
import { useAddToCart } from "../hooks/useAddToCart.js";
import LoadingSpinner from "../components/LoadingSpinner.js";
import Breadcrumbs, { BreadcrumbPlaceholder } from "../components/Breadcrumbs.js";
import EmptyState from "../components/product/EmptyState.js";
import Tabs from "../components/common/Tabs.js";
import StoreHeaderCard from "../components/storePage/StoreHeaderCard.js";
import StoreProductsTab from "../components/storePage/StoreProductsTab.js";
import StoreOrdersTab from "../components/storePage/StoreOrdersTab.js";
import StoreCartBar from "../components/storePage/StoreCartBar.js";
import { LIST_PAGE_SIZE } from "../utils/pagination.js";
import type { Favorites, Order, Product, User } from "../types/index.js";

type Tab = "products" | "orders";

// The store page loads its offers at once (up to the server's page limit) to group them by row;
// "Load more" fetches the rest.
const PRODUCTS_PAGE = 100;

// The store page for restaurants (/stores/:id, design/stores/store-products.html and
// store-orders.html): breadcrumbs, the header card with the info row, the Products / My orders
// tabs (both panels stay mounted, so the search and the sort survive a tab switch) and the cart bar.
function StoreDetailsPage() {
  const { id } = useParams();
  const storeId = Number(id);
  const { t } = useTranslation();
  const [store, setStore] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isFavorite, setIsFavorite] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("products");
  const cart = useAddToCart();

  useEffect(() => {
    const fetchStore = async () => {
      try {
        const response = await api.get(`/users/stores/${id}`);
        setStore(response.data.store);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    const fetchFavorites = async () => {
      try {
        const response = await api.get("/favorites");
        setIsFavorite(response.data.favorites.some((favorite: Favorites) => favorite.id === storeId));
      } catch (err) {
        console.error(err);
      }
    };
    fetchStore();
    fetchFavorites();
  }, [id, storeId]);

  // The pill flips at once and a toast confirms it; a failure puts it back and says why.
  const toggleFavorite = async () => {
    const wasFavorite = isFavorite;
    setIsFavorite(!wasFavorite);
    try {
      if (wasFavorite) {
        await api.delete(`/favorites/${storeId}`);
      } else {
        await api.post("/favorites", { store_id: storeId });
      }
      toast.success(t(wasFavorite ? "store.favoriteRemoved" : "store.favoriteAdded", { store: store?.business_name ?? "" }));
    } catch (err) {
      console.error(err);
      setIsFavorite(wasFavorite);
      toast.error(apiErrorMessage(err) || t(wasFavorite ? "store.deleteFavoriteError" : "store.addFavoriteError"));
    }
  };

  // The store's offers through the marketplace (the same rules), soonest expiry first.
  const productPaging = usePagedLimit(PRODUCTS_PAGE, String(id));
  const products = useFetch<Product>("/products", "products", { store_id: id!, sort: "expiry", limit: productPaging.limit });

  // The restaurant's orders at this store, newest first, 10 at a time (the tab's count is the total).
  const orderPaging = usePagedLimit(LIST_PAGE_SIZE, String(id));
  const orders = useFetch<Order>("/orders/mine", "orders", {
    store_id: id!,
    scope: "all",
    sort: "newest",
    limit: orderPaging.limit,
  });

  const section = { label: t("sidebar.stores"), to: "/stores" };
  const page = "mx-auto flex max-w-[1136px] flex-col gap-6 pb-10 font-jakarta text-neutral-900";

  if (loading) {
    return (
      <div className={page}>
        <Breadcrumbs items={[section, { label: <BreadcrumbPlaceholder /> }]} />
        <LoadingSpinner />
      </div>
    );
  }

  if (!store) {
    return (
      <div className={page}>
        <Breadcrumbs items={[section]} />
        <EmptyState
          icon={Store}
          title={t("store.storeNotFound")}
          subtitle={t("store.storeNotFoundSubtitle")}
          action={{ to: "/stores", label: t("store.backToStores") }}
        />
      </div>
    );
  }

  return (
    <div className={page}>
      <Breadcrumbs items={[section, { label: store.business_name }]} />

      <StoreHeaderCard store={store} isFavorite={isFavorite} onToggleFavorite={toggleFavorite} />

      <Tabs
        label={t("storePage.tabsLabel")}
        idPrefix="store"
        active={activeTab}
        onChange={setActiveTab}
        tabs={[
          { key: "products", label: t("storePage.productsTab"), count: products.total ?? products.data.length },
          { key: "orders", label: t("storePage.ordersTab"), count: orders.total ?? orders.data.length },
        ]}
      />

      <div role="tabpanel" id="store-panel-products" aria-labelledby="store-tab-products" hidden={activeTab !== "products"}>
        <StoreProductsTab
          products={products.data}
          total={products.total ?? products.data.length}
          loading={products.loading}
          fetching={products.fetching}
          onLoadMore={productPaging.loadMore}
          cart={cart}
        />
      </div>
      <div role="tabpanel" id="store-panel-orders" aria-labelledby="store-tab-orders" hidden={activeTab !== "orders"}>
        <StoreOrdersTab
          orders={orders.data}
          total={orders.total ?? orders.data.length}
          loading={orders.loading}
          fetching={orders.fetching}
          onLoadMore={orderPaging.loadMore}
        />
      </div>

      <StoreCartBar />
      {cart.confirmDialog}
    </div>
  );
}

export default StoreDetailsPage;
