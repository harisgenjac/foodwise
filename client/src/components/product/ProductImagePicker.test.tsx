import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import toast from "react-hot-toast";
import ProductImagePicker from "./ProductImagePicker.js";
import ProductImage from "./ProductImage.js";
import { assetUrl } from "../../api/axios.js";
import { GENERIC_PRODUCT_IMAGE, SUGGESTED_IMAGES, productImageSrc } from "../../utils/productImages.js";
import { apiMock, axiosError, t } from "../../test/utils.js";

const file = (type: string, size = 10) => new File([new Uint8Array(size)], "photo", { type });

describe("productImageSrc", () => {
  it("shows the generic image without an image", () => {
    expect(productImageSrc(null)).toBe(GENERIC_PRODUCT_IMAGE);
    expect(productImageSrc("")).toBe(GENERIC_PRODUCT_IMAGE);
  });

  it("resolves a suggested image and an upload", () => {
    expect(productImageSrc("suggested:fish")).toBe(SUGGESTED_IMAGES[1]!.src);
    expect(productImageSrc("/uploads/products/2-1-ab.png")).toBe(assetUrl("/uploads/products/2-1-ab.png"));
  });

  it("falls back to the generic image for an unknown suggested key", () => {
    expect(productImageSrc("suggested:cake")).toBe(GENERIC_PRODUCT_IMAGE);
  });
});

describe("ProductImage", () => {
  it("shows the generic image when the image fails to load", () => {
    render(<ProductImage imageUrl="/uploads/products/2-1-ab.png" alt="Jogurt" />);
    const image = screen.getByAltText("Jogurt");
    fireEvent.error(image);
    expect(image).toHaveAttribute("src", GENERIC_PRODUCT_IMAGE);
  });
});

describe("ProductImagePicker", () => {
  const renderPicker = (value = "") => {
    const onChange = vi.fn();
    render(<ProductImagePicker value={value} onChange={onChange} />);
    return onChange;
  };

  it("shows the generic image and no remove button without an image", () => {
    renderPicker();
    expect(screen.getByAltText(t("productImage.none"))).toHaveAttribute("src", GENERIC_PRODUCT_IMAGE);
    expect(screen.queryByRole("button", { name: t("productImage.remove") })).not.toBeInTheDocument();
  });

  it("uploads a chosen image and keeps its URL", async () => {
    apiMock.post.mockResolvedValue({ data: { image_url: "/uploads/products/2-1-ab.png" } });
    const onChange = renderPicker();
    await userEvent.upload(screen.getByLabelText(t("productImage.upload")), file("image/png"));

    expect(apiMock.post).toHaveBeenCalledWith("/products/images", expect.any(FormData));
    const sent = apiMock.post.mock.calls[0]![1] as FormData;
    expect(sent.get("image")).toBeInstanceOf(File);
    expect(onChange).toHaveBeenCalledWith("/uploads/products/2-1-ab.png");
  });

  it("refuses another file type before uploading", async () => {
    const error = vi.spyOn(toast, "error");
    const onChange = renderPicker();
    // applyAccept off: the browser's picker filter is not what is tested here.
    await userEvent.setup({ applyAccept: false }).upload(screen.getByLabelText(t("productImage.upload")), file("image/gif"));
    expect(error).toHaveBeenCalledWith(t("productImage.invalidType"));
    expect(apiMock.post).not.toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("refuses an image over 5 MB before uploading", async () => {
    const error = vi.spyOn(toast, "error");
    renderPicker();
    await userEvent.upload(screen.getByLabelText(t("productImage.upload")), file("image/jpeg", 5 * 1024 * 1024 + 1));
    expect(error).toHaveBeenCalledWith(t("productImage.tooLarge"));
    expect(apiMock.post).not.toHaveBeenCalled();
  });

  it("shows the server's error when the upload fails", async () => {
    const error = vi.spyOn(toast, "error");
    apiMock.post.mockRejectedValue(axiosError(400, "Slika može imati najviše 5MB."));
    const onChange = renderPicker();
    await userEvent.upload(screen.getByLabelText(t("productImage.upload")), file("image/webp"));
    expect(error).toHaveBeenCalledWith("Slika može imati najviše 5MB.");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("picks a suggested image from the gallery after confirming", async () => {
    const onChange = renderPicker();
    await userEvent.click(screen.getByRole("button", { name: t("productImage.suggested") }));

    const select = screen.getByRole("button", { name: t("productImage.select") });
    expect(select).toBeDisabled();
    expect(screen.getAllByRole("button", { name: /Predložena slika/ })).toHaveLength(SUGGESTED_IMAGES.length);

    await userEvent.click(screen.getByRole("button", { name: t("productImage.galleryOption", { number: 3 }) }));
    expect(onChange).not.toHaveBeenCalled();
    await userEvent.click(select);

    expect(onChange).toHaveBeenCalledWith(SUGGESTED_IMAGES[2]!.value);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("marks the current suggested image in the gallery", async () => {
    renderPicker("suggested:dairy");
    await userEvent.click(screen.getByRole("button", { name: t("productImage.suggested") }));
    expect(screen.getByRole("button", { name: t("productImage.galleryOption", { number: 3 }) })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("removes the image", async () => {
    const onChange = renderPicker("suggested:dairy");
    await userEvent.click(screen.getByRole("button", { name: t("productImage.remove") }));
    expect(onChange).toHaveBeenCalledWith("");
  });
});
