import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import OrderImage from "./OrderImage.js";
import OrderCard from "./OrderCard.js";
import OrderDetailsView from "./OrderDetailsView.js";
import PickupCard from "../pickup/PickupCard.js";
import { assetUrl } from "../../api/axios.js";
import { productImageSrc } from "../../utils/productImages.js";
import { makeOrder, makeOrderDetails, makeOrderItem } from "../../test/utils.js";

const LOGO = "/uploads/logos/2-1-ab.png";

describe("OrderImage", () => {
  it("shows the other party's logo, whole", () => {
    render(<OrderImage logoUrl={LOGO} />);
    const logo = screen.getByTestId("order-logo");
    expect(logo).toHaveAttribute("src", assetUrl(LOGO));
    expect(logo).toHaveClass("object-contain");
  });

  it("shows the generic order image without a logo", () => {
    render(<OrderImage logoUrl={null} />);
    expect(screen.getByTestId("order-generic-image")).toBeInTheDocument();
    expect(screen.queryByTestId("order-logo")).not.toBeInTheDocument();
  });

  it("falls back to the generic order image when the logo fails to load", () => {
    render(<OrderImage logoUrl={LOGO} />);
    fireEvent.error(screen.getByTestId("order-logo"));
    expect(screen.getByTestId("order-generic-image")).toBeInTheDocument();
  });
});

describe("order views", () => {
  const items = [1, 2, 3, 4].map((n) =>
    makeOrderItem({ id: n, product_name: `Proizvod ${n}`, image_url: n === 2 ? null : "suggested:fish" }),
  );

  it("the order card shows the logo and the first three products with +N", () => {
    render(
      <MemoryRouter>
        <OrderCard order={makeOrder({ party_logo_url: LOGO, items, item_count: 4 })} partyLabel="Prodavnica" />
      </MemoryRouter>,
    );
    const card = screen.getByTestId("order-card");
    expect(within(card).getByTestId("order-logo")).toHaveAttribute("src", assetUrl(LOGO));
    expect(within(card).getByAltText("Proizvod 1")).toHaveAttribute("src", productImageSrc("suggested:fish"));
    expect(within(card).getByAltText("Proizvod 2")).toHaveAttribute("src", productImageSrc(null));
    expect(within(card).getByAltText("Proizvod 3")).toBeInTheDocument();
    expect(within(card).queryByAltText("Proizvod 4")).not.toBeInTheDocument();
    expect(within(card).getByText("+1")).toBeInTheDocument();
  });

  it("the order card shows no +N for up to three products", () => {
    render(
      <MemoryRouter>
        <OrderCard order={makeOrder({ items: items.slice(0, 2), item_count: 2 })} partyLabel="Prodavnica" />
      </MemoryRouter>,
    );
    expect(screen.queryByText(/^\+\d/)).not.toBeInTheDocument();
    expect(screen.getByTestId("order-generic-image")).toBeInTheDocument();
  });

  it("the pickup card shows the logo", () => {
    render(
      <MemoryRouter>
        <PickupCard order={makeOrder({ status: "Confirmed", party_logo_url: "/uploads/logos/9-1-cd.png" })} isStore />
      </MemoryRouter>,
    );
    expect(screen.getByTestId("order-logo")).toHaveAttribute("src", assetUrl("/uploads/logos/9-1-cd.png"));
  });

  it("the order page shows the restaurant's logo to the store, the store's to the admin", () => {
    const order = makeOrderDetails();
    order.store.logo_url = "/uploads/logos/store.png";
    order.restaurant.logo_url = "/uploads/logos/restaurant.png";
    const { unmount } = render(
      <MemoryRouter>
        <OrderDetailsView order={order} viewer="ADMIN" />
      </MemoryRouter>,
    );
    expect(screen.getByTestId("order-logo")).toHaveAttribute("src", assetUrl("/uploads/logos/store.png"));
    unmount();

    render(
      <MemoryRouter>
        <OrderDetailsView order={order} viewer="STORE" />
      </MemoryRouter>,
    );
    expect(screen.getByTestId("order-logo")).toHaveAttribute("src", assetUrl("/uploads/logos/restaurant.png"));
  });
});
