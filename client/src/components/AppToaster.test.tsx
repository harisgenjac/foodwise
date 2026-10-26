import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import toast from "react-hot-toast";
import AppToaster from "./AppToaster.js";
import { t } from "../test/utils.js";

describe("AppToaster", () => {
  // jsdom has no matchMedia; react-hot-toast asks it about reduced motion.
  beforeEach(() => {
    vi.stubGlobal("matchMedia", (query: string) => ({ matches: true, media: query }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    // The toast store is global; start every test without toasts.
    act(() => toast.remove());
  });

  it("closes a toast with its close button", async () => {
    render(<AppToaster />);
    act(() => {
      toast.success("Profil uspješno ažuriran.");
    });

    expect(await screen.findByText("Profil uspješno ažuriran.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: t("common.closeToast") }));
    await waitFor(() => expect(screen.queryByText("Profil uspješno ažuriran.")).not.toBeInTheDocument());
  });

  it("gives error toasts a close button too", async () => {
    render(<AppToaster />);
    act(() => {
      toast.error("Greška");
    });

    expect(await screen.findByText("Greška")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: t("common.closeToast") })).toBeInTheDocument();
  });

  it("keeps at most three toasts and closes the oldest", async () => {
    render(<AppToaster />);
    act(() => {
      ["Prva", "Druga", "Treća", "Četvrta"].forEach((message) => toast.success(message));
    });

    expect(await screen.findByText("Četvrta")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText("Prva")).not.toBeInTheDocument());
    expect(screen.getByText("Druga")).toBeInTheDocument();
    expect(screen.getByText("Treća")).toBeInTheDocument();
  });
});
