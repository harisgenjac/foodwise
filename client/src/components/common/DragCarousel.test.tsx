import { fireEvent, screen } from "@testing-library/react";
import { Link } from "react-router-dom";
import DragCarousel from "./DragCarousel.js";
import { renderWithProviders } from "../../test/utils.js";

const renderCarousel = () =>
  renderWithProviders(
    <DragCarousel previousLabel="Previous" nextLabel="Next" trackTestId="track">
      {[1, 2, 3, 4].map((id) => (
        <li key={id} className="w-[200px] flex-none">
          <Link to={`/items/${id}`}>Item {id}</Link>
        </li>
      ))}
    </DragCarousel>,
    { route: "/home", path: "/home" },
  );

// jsdom has no layout: give the track a size and a scroll position.
const setTrack = (track: HTMLElement, { scrollLeft = 0, clientWidth = 500, scrollWidth = 860 } = {}) => {
  Object.defineProperty(track, "clientWidth", { configurable: true, value: clientWidth });
  Object.defineProperty(track, "scrollWidth", { configurable: true, value: scrollWidth });
  track.scrollLeft = scrollLeft;
  fireEvent.scroll(track);
};

const mouse = { pointerId: 1, pointerType: "mouse", button: 0 };

describe("DragCarousel", () => {
  it("opens an item on a click", () => {
    renderCarousel();

    const item = screen.getByRole("link", { name: "Item 2" });
    fireEvent.pointerDown(item, { ...mouse, clientX: 300 });
    fireEvent.pointerUp(item, { ...mouse, clientX: 302 });
    fireEvent.click(item);
    expect(screen.getByTestId("location")).toHaveTextContent("/items/2");
  });

  it("scrolls with a mouse drag and does not open the item under the pointer", () => {
    renderCarousel();

    const track = screen.getByTestId("track");
    track.scrollTo = vi.fn();
    // Items 200 px wide (jsdom has no layout), so the drag can settle on one.
    track.firstElementChild!.getBoundingClientRect = () => ({ width: 200 }) as DOMRect;
    const item = screen.getByRole("link", { name: "Item 2" });
    fireEvent.pointerDown(item, { ...mouse, clientX: 300 });
    fireEvent.pointerMove(item, { ...mouse, clientX: 280 });
    // Snap is off and the cursor grabs while dragging; the track follows the pointer.
    expect(track).toHaveClass("cursor-grabbing", "snap-none");
    fireEvent.pointerMove(item, { ...mouse, clientX: 200 });
    expect(track.scrollLeft).toBe(100);
    fireEvent.pointerUp(item, { ...mouse, clientX: 200 });
    fireEvent.click(item);

    expect(screen.queryByTestId("location")).not.toBeInTheDocument();
    expect(track).toHaveClass("cursor-grab", "snap-mandatory");
    // It settles on the nearest item after the drag (100 px of a 200 px step rounds to the next one).
    expect(track.scrollTo).toHaveBeenCalledWith({ left: 200, behavior: "smooth" });

    // The next plain click opens its item again.
    fireEvent.pointerDown(item, { ...mouse, clientX: 300 });
    fireEvent.pointerUp(item, { ...mouse, clientX: 300 });
    fireEvent.click(item);
    expect(screen.getByTestId("location")).toHaveTextContent("/items/2");
  });

  it("leaves touch to the native swipe", () => {
    renderCarousel();

    const track = screen.getByTestId("track");
    const item = screen.getByRole("link", { name: "Item 1" });
    fireEvent.pointerDown(item, { pointerId: 2, pointerType: "touch", clientX: 300 });
    fireEvent.pointerMove(item, { pointerId: 2, pointerType: "touch", clientX: 200 });
    expect(track.scrollLeft).toBe(0);
    expect(track).not.toHaveClass("snap-none");
  });

  it("hides each arrow at its end of the track", () => {
    renderCarousel();

    const track = screen.getByTestId("track");
    // A hidden button has no accessible name for the role query: find them by their labels.
    const previous = document.querySelector('[aria-label="Previous"]')!;
    const next = document.querySelector('[aria-label="Next"]')!;

    setTrack(track, { scrollLeft: 0 });
    expect(previous).toHaveAttribute("hidden");
    expect(next).not.toHaveAttribute("hidden");

    setTrack(track, { scrollLeft: 180 });
    expect(previous).not.toHaveAttribute("hidden");
    expect(next).not.toHaveAttribute("hidden");

    setTrack(track, { scrollLeft: 360 });
    expect(previous).not.toHaveAttribute("hidden");
    expect(next).toHaveAttribute("hidden");
  });

  it("scrolls by about two items with the arrows, which control the track", () => {
    renderCarousel();

    const track = screen.getByTestId("track");
    setTrack(track, { scrollLeft: 180 });
    const scrollBy = vi.fn();
    track.scrollBy = scrollBy;
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.click(screen.getByRole("button", { name: "Previous" }));
    expect(scrollBy).toHaveBeenCalledTimes(2);
    expect(scrollBy.mock.calls[0]![0]).toMatchObject({ behavior: "smooth" });
    expect(scrollBy.mock.calls[0]![0].left).toBeGreaterThanOrEqual(0);
    expect(scrollBy.mock.calls[1]![0].left).toBeLessThanOrEqual(0);
    expect(screen.getByRole("button", { name: "Next" })).toHaveAttribute("aria-controls", track.id);
  });

  it("scrolls a focused item into view", () => {
    renderCarousel();

    const item = screen.getByRole("link", { name: "Item 4" });
    item.scrollIntoView = vi.fn();
    item.focus();
    expect(item.scrollIntoView).toHaveBeenCalledWith({ block: "nearest", inline: "nearest" });
  });
});
