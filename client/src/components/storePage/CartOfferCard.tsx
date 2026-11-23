import { useTranslation } from "react-i18next";
import { Plus } from "lucide-react";
import OfferCard from "../dashboard/OfferCard.js";
import CartStepper, { minimumQuantity } from "./CartStepper.js";
import type { Product } from "../../types/index.js";

export interface CartActions {
  quantityOf: (productId: number) => number;
  setQuantity: (product: Pick<Product, "id" | "name">, quantity: number) => void;
  busyId: number | null;
}

// The "+" of a product whose store takes no orders right now: grey and disabled (a real disabled
// button, so it is not clickable), named "<product>: prodavnica trenutno ne prima narudžbe".
export function UnavailableAddButton({ name }: { name: string }) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      disabled
      aria-label={t("search.unavailableAdd", { name })}
      className="relative z-10 flex h-11 w-11 shrink-0 cursor-not-allowed items-center justify-center rounded-full bg-neutral-200 text-neutral-500"
    >
      <Plus className="h-5 w-5" strokeWidth={2.4} aria-hidden="true" />
    </button>
  );
}

interface CartOfferCardProps {
  product: Product;
  cart: CartActions;
  // The store takes no orders right now (paused or closed, on Search): the card turns grayscale and
  // its "+" is a disabled grey button. A product already in the cart keeps its stepper, so the
  // amount can still be lowered or removed.
  unavailable?: boolean;
}

// One offer with the cart controls (the store page and Search, design/stores/store-products.html):
// the OfferCard whose "+" puts the minimum amount in the cart at once and becomes the quantity
// stepper, with the green border while the product is in the cart. Only the name links to the
// product page, so a tap next to "+" or the stepper opens nothing.
function CartOfferCard({ product, cart, unavailable = false }: CartOfferCardProps) {
  const { t } = useTranslation();
  const inCart = cart.quantityOf(product.id);
  const max = parseFloat(product.available_quantity ?? product.quantity);
  const busy = cart.busyId === product.id;

  const addButton = unavailable ? (
    <UnavailableAddButton name={product.name} />
  ) : (
    <button
      type="button"
      disabled={busy || max <= 0}
      onClick={() => cart.setQuantity(product, minimumQuantity(product.unit, max))}
      aria-label={t("stepper.add", { name: product.name })}
      className="relative z-10 flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full bg-brand-800 text-white hover:bg-brand-900 focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-brand-300 disabled:cursor-wait disabled:opacity-60"
    >
      <Plus className="h-5 w-5" strokeWidth={2.4} aria-hidden="true" />
    </button>
  );

  return (
    <div className={`h-full ${unavailable ? "grayscale" : ""}`} data-unavailable={unavailable || undefined}>
      <OfferCard
        product={product}
        testId="store-product-card"
        selected={inCart > 0}
        fromStore
        stretchedLink={false}
        action={inCart > 0 ? undefined : addButton}
        footer={
          inCart > 0 ? (
            <CartStepper
              name={product.name}
              unit={product.unit}
              value={inCart}
              max={max}
              busy={busy}
              onChange={(quantity) => cart.setQuantity(product, quantity)}
            />
          ) : undefined
        }
      />
    </div>
  );
}

export default CartOfferCard;
