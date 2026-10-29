import { act, renderHook } from "@testing-library/react";
import { LOGO_ACCEPT, useLogoPreview } from "./useLogoPreview.js";

describe("useLogoPreview", () => {
  const createObjectURL = vi.fn();
  const revokeObjectURL = vi.fn();
  let counter = 0;

  beforeEach(() => {
    counter = 0;
    createObjectURL.mockImplementation(() => `blob:preview-${++counter}`);
    vi.stubGlobal("URL", { createObjectURL, revokeObjectURL });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const image = (type = "image/png", name = "logo.png") => new File(["x"], name, { type });

  it("accepts the server's image types", () => {
    expect(LOGO_ACCEPT).toBe("image/jpeg,image/png,image/webp");
    const { result } = renderHook(() => useLogoPreview());
    for (const type of ["image/jpeg", "image/png", "image/webp"]) {
      let accepted = false;
      act(() => {
        accepted = result.current.select(image(type));
      });
      expect(accepted).toBe(true);
    }
  });

  it("rejects every other type and keeps no file or preview", () => {
    const { result } = renderHook(() => useLogoPreview());
    for (const type of ["image/svg+xml", "text/html", "image/gif", ""]) {
      let accepted = true;
      act(() => {
        accepted = result.current.select(image(type, `<img src=x onerror=alert(1)>.${type}`));
      });
      expect(accepted).toBe(false);
    }
    expect(result.current.file).toBeNull();
    expect(result.current.preview).toBeNull();
    expect(createObjectURL).not.toHaveBeenCalled();
  });

  it("previews only an object URL of the file, never its name", () => {
    const { result } = renderHook(() => useLogoPreview());
    const file = image("image/png", "javascript:alert(1).png");
    act(() => {
      result.current.select(file);
    });
    expect(createObjectURL).toHaveBeenCalledWith(file);
    expect(result.current.file).toBe(file);
    expect(result.current.preview).toBe("blob:preview-1");
  });

  it("revokes the previous preview when it is replaced, cleared or unmounted", () => {
    const { result, unmount } = renderHook(() => useLogoPreview());
    act(() => {
      result.current.select(image());
    });
    act(() => {
      result.current.select(image());
    });
    expect(revokeObjectURL).toHaveBeenLastCalledWith("blob:preview-1");

    act(() => result.current.clear());
    expect(revokeObjectURL).toHaveBeenLastCalledWith("blob:preview-2");
    expect(result.current.preview).toBeNull();

    act(() => {
      result.current.select(image());
    });
    unmount();
    expect(revokeObjectURL).toHaveBeenLastCalledWith("blob:preview-3");
  });
});
