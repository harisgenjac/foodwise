import { act, renderHook } from "@testing-library/react";
import { useFetch } from "./useFetch.js";
import { apiMock } from "../test/utils.js";

describe("useFetch", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const flush = () => act(() => vi.advanceTimersByTimeAsync(500));

  it("loads data from the response key after the debounce", async () => {
    apiMock.get.mockResolvedValue({ data: { products: [{ id: 1 }] } });
    const { result } = renderHook(() => useFetch<{ id: number }>("/products", "products", { category: "Meat" }));

    expect(result.current.loading).toBe(true);
    expect(apiMock.get).not.toHaveBeenCalled();

    await flush();
    expect(apiMock.get).toHaveBeenCalledWith("/products", { params: { category: "Meat" } });
    expect(result.current.data).toEqual([{ id: 1 }]);
    expect(result.current.loading).toBe(false);
  });

  it("sends one request when params change quickly", async () => {
    apiMock.get.mockResolvedValue({ data: { products: [] } });
    const { rerender } = renderHook(({ name }) => useFetch("/products", "products", { name }), {
      initialProps: { name: "m" },
    });

    await act(() => vi.advanceTimersByTimeAsync(200));
    rerender({ name: "mli" });
    await act(() => vi.advanceTimersByTimeAsync(200));
    rerender({ name: "mlijeko" });
    await flush();

    expect(apiMock.get).toHaveBeenCalledTimes(1);
    expect(apiMock.get).toHaveBeenCalledWith("/products", { params: { name: "mlijeko" } });
  });

  it("does not refetch when the same params are passed as a new object", async () => {
    apiMock.get.mockResolvedValue({ data: { products: [] } });
    const { rerender } = renderHook(() => useFetch("/products", "products", { name: "x" }));
    await flush();
    rerender();
    await flush();
    expect(apiMock.get).toHaveBeenCalledTimes(1);
  });

  it("refetch loads again immediately", async () => {
    apiMock.get.mockResolvedValueOnce({ data: { items: [1] } }).mockResolvedValueOnce({ data: { items: [1, 2] } });
    const { result } = renderHook(() => useFetch<number>("/items", "items", {}));
    await flush();

    await act(() => result.current.refetch());
    expect(result.current.data).toEqual([1, 2]);
  });

  it("stops loading and keeps the previous data when the request fails", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    apiMock.get.mockRejectedValue(new Error("network"));
    const { result } = renderHook(() => useFetch("/products", "products", {}));

    await flush();
    expect(result.current.loading).toBe(false);
    expect(result.current.data).toEqual([]);
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it("cancels the pending request on unmount", async () => {
    const { unmount } = renderHook(() => useFetch("/products", "products", {}));
    unmount();
    await flush();
    expect(apiMock.get).not.toHaveBeenCalled();
  });
});
