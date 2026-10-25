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

  const requestFor = (params: unknown) => ["/products", { params, signal: expect.any(AbortSignal) }];

  it("loads the first page right away from the response key", async () => {
    apiMock.get.mockResolvedValue({ data: { products: [{ id: 1 }], total: 7 } });
    const { result } = renderHook(() => useFetch<{ id: number }>("/products", "products", { category: "Meat" }));

    expect(result.current.loading).toBe(true);
    await act(() => vi.advanceTimersByTimeAsync(0));

    expect(apiMock.get).toHaveBeenCalledWith(...requestFor({ category: "Meat" }));
    expect(result.current.data).toEqual([{ id: 1 }]);
    expect(result.current.total).toBe(7);
    expect(result.current.loading).toBe(false);
  });

  it("debounces later changes into one request", async () => {
    apiMock.get.mockResolvedValue({ data: { products: [] } });
    const { rerender } = renderHook(({ name }) => useFetch("/products", "products", { name }), {
      initialProps: { name: "" },
    });
    await act(() => vi.advanceTimersByTimeAsync(0));

    rerender({ name: "m" });
    await act(() => vi.advanceTimersByTimeAsync(200));
    rerender({ name: "mli" });
    await act(() => vi.advanceTimersByTimeAsync(200));
    rerender({ name: "mlijeko" });
    await flush();

    expect(apiMock.get).toHaveBeenCalledTimes(2);
    expect(apiMock.get).toHaveBeenLastCalledWith(...requestFor({ name: "mlijeko" }));
  });

  it("loads a new page right away, without the filter debounce", async () => {
    apiMock.get.mockResolvedValue({ data: { products: [] } });
    const { rerender } = renderHook(({ limit }) => useFetch("/products", "products", { name: "x", limit }), {
      initialProps: { limit: 12 },
    });
    await act(() => vi.advanceTimersByTimeAsync(0));

    rerender({ limit: 24 });
    await act(() => vi.advanceTimersByTimeAsync(0));

    expect(apiMock.get).toHaveBeenCalledTimes(2);
    expect(apiMock.get).toHaveBeenLastCalledWith(...requestFor({ name: "x", limit: 24 }));
  });

  it("aborts the previous request when a new one starts", async () => {
    let firstSignal: { aborted?: boolean } | undefined;
    apiMock.get.mockImplementationOnce(async (_url, config) => {
      firstSignal = config?.signal;
      return new Promise(() => {});
    });
    apiMock.get.mockResolvedValue({ data: { products: [] } });
    const { result } = renderHook(() => useFetch("/products", "products", {}));
    await act(() => vi.advanceTimersByTimeAsync(0));

    await act(() => result.current.refetch());
    expect(firstSignal?.aborted).toBe(true);
  });

  it("reports a failed load through error", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    apiMock.get.mockRejectedValue(new Error("network"));
    const { result } = renderHook(() => useFetch("/products", "products", {}));
    await flush();
    expect(result.current.error).toBe(true);
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
