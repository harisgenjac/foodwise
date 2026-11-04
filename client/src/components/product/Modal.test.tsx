import { useState } from "react";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Modal, { ModalBody, ModalFooter, ModalHeader, modalFormStyle } from "./Modal.js";

function Dialog({ onClose, title = "Naslov" }: { onClose: () => void; title?: string }) {
  return (
    <Modal onClose={onClose} labelledBy={`title-${title}`}>
      <ModalHeader>
        <h3 id={`title-${title}`}>{title}</h3>
      </ModalHeader>
      <form className={modalFormStyle}>
        <ModalBody>
          <input aria-label={`Polje ${title}`} />
        </ModalBody>
        <ModalFooter>
          <button type="button" onClick={onClose}>
            Odustani {title}
          </button>
          <button type="submit">Potvrdi {title}</button>
        </ModalFooter>
      </form>
    </Modal>
  );
}

// A button that opens the dialog, so focus can go back to it.
function Opener({ onClose = () => {} }: { onClose?: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Otvori
      </button>
      {open && (
        <Dialog
          onClose={() => {
            onClose();
            setOpen(false);
          }}
        />
      )}
    </>
  );
}

describe("Modal layout", () => {
  it("fits the visible screen and scrolls only the body, with the title and the buttons outside it", () => {
    render(<Dialog onClose={() => {}} />);
    const backdrop = screen.getByTestId("modal-backdrop");
    const dialog = screen.getByRole("dialog", { name: "Naslov" });
    const body = screen.getByTestId("modal-body");

    expect(backdrop).toHaveClass("fixed", "h-dvh", "p-4");
    expect(dialog).toHaveClass("flex", "flex-col", "max-h-full");
    expect(body).toHaveClass("min-h-0", "flex-1", "overflow-y-auto");
    expect(body.closest("form")).toHaveClass("flex", "min-h-0", "flex-1", "flex-col");

    // The title row and the buttons are not inside the scrolling part and do not shrink.
    const title = screen.getByRole("heading", { name: "Naslov" });
    const confirm = screen.getByRole("button", { name: "Potvrdi Naslov" });
    expect(body).not.toContainElement(title);
    expect(body).not.toContainElement(confirm);
    expect(title.parentElement).toHaveClass("shrink-0");
    expect(confirm.parentElement).toHaveClass("shrink-0");
    expect(body).toContainElement(screen.getByLabelText("Polje Naslov"));
  });

  it("sizes the backdrop to the visible viewport, which the keyboard makes shorter", async () => {
    const listeners: Record<string, () => void> = {};
    const viewport = {
      offsetTop: 0,
      height: 667,
      addEventListener: (type: string, listener: () => void) => {
        listeners[type] = listener;
      },
      removeEventListener: vi.fn(),
    };
    vi.stubGlobal("visualViewport", viewport);
    try {
      render(<Dialog onClose={() => {}} />);
      const backdrop = screen.getByTestId("modal-backdrop");
      expect(backdrop).toHaveStyle({ top: "0px", height: "667px" });

      // The keyboard opens, and iOS scrolls the visible part down.
      viewport.height = 360;
      viewport.offsetTop = 120;
      act(() => listeners.resize?.());
      expect(backdrop).toHaveStyle({ top: "120px", height: "360px" });
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("Modal behaviour", () => {
  // A closed dialog goes back over its history entry asynchronously; the next test starts after it.
  afterEach(async () => {
    cleanup();
    await waitFor(() => expect(window.history.state?.overlayDepth).toBeUndefined());
  });

  it("locks the page scroll while open and restores it after", async () => {
    document.documentElement.style.overflow = "";
    const { unmount } = render(<Dialog onClose={() => {}} />);
    expect(document.documentElement.style.overflow).toBe("hidden");
    unmount();
    expect(document.documentElement.style.overflow).toBe("");
  });

  it("keeps the page locked until the last of two open dialogs closes", () => {
    const first = render(<Dialog onClose={() => {}} title="Prvi" />);
    const second = render(<Dialog onClose={() => {}} title="Drugi" />);
    second.unmount();
    expect(document.documentElement.style.overflow).toBe("hidden");
    first.unmount();
    expect(document.documentElement.style.overflow).toBe("");
  });

  it("closes only the top dialog on Escape", async () => {
    const closeFirst = vi.fn();
    const closeSecond = vi.fn();
    render(
      <>
        <Dialog onClose={closeFirst} title="Prvi" />
        <Dialog onClose={closeSecond} title="Drugi" />
      </>,
    );
    await userEvent.keyboard("{Escape}");
    expect(closeSecond).toHaveBeenCalledTimes(1);
    expect(closeFirst).not.toHaveBeenCalled();
  });

  it("moves focus into the dialog, keeps Tab inside and returns focus to the opener", async () => {
    render(<Opener />);
    const opener = screen.getByRole("button", { name: "Otvori" });
    await userEvent.click(opener);
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveFocus();

    await userEvent.tab();
    expect(screen.getByLabelText("Polje Naslov")).toHaveFocus();
    await userEvent.tab();
    await userEvent.tab();
    expect(screen.getByRole("button", { name: "Potvrdi Naslov" })).toHaveFocus();
    // From the last button Tab goes back to the first field, never to the page behind.
    await userEvent.tab();
    expect(screen.getByLabelText("Polje Naslov")).toHaveFocus();
    await userEvent.tab({ shift: true });
    expect(screen.getByRole("button", { name: "Potvrdi Naslov" })).toHaveFocus();

    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await waitFor(() => expect(opener).toHaveFocus());
  });

  it("closes on Back (the Android back button) instead of leaving the page", async () => {
    const onClose = vi.fn();
    render(<Opener onClose={onClose} />);
    await userEvent.click(screen.getByRole("button", { name: "Otvori" }));
    // An entry for the same page, which Back removes.
    expect(window.history.state).toMatchObject({ overlayDepth: 1 });

    window.history.back();
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(window.history.state?.overlayDepth).toBeUndefined();
  });

  it("removes its history entry when closed another way", async () => {
    render(<Opener />);
    await userEvent.click(screen.getByRole("button", { name: "Otvori" }));
    expect(window.history.state).toMatchObject({ overlayDepth: 1 });

    await userEvent.click(screen.getByRole("button", { name: "Odustani Naslov" }));
    await waitFor(() => expect(window.history.state?.overlayDepth).toBeUndefined());
  });

  it("skips the entry of a dialog that closed by navigating when Back lands on it", async () => {
    render(<Opener />);
    await userEvent.click(screen.getByRole("button", { name: "Otvori" }));
    // A link inside the dialog opens another page (a new entry over the dialog's one), and the dialog closes.
    window.history.pushState({ page: "next" }, "");
    cleanup();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(window.history.state).toMatchObject({ page: "next" });

    // Back from the new page lands on the dialog's entry, which is skipped to the page before it.
    window.history.back();
    await waitFor(() => {
      expect(window.history.state?.page).toBeUndefined();
      expect(window.history.state?.overlayDepth).toBeUndefined();
    });
  });

  it("keeps a history entry for a dialog that replaces another one at once", async () => {
    function Swap() {
      const [second, setSecond] = useState(false);
      return second ? <Dialog onClose={() => {}} title="Drugi" /> : <Dialog onClose={() => setSecond(true)} title="Prvi" />;
    }
    render(<Swap />);
    await userEvent.click(screen.getByRole("button", { name: "Odustani Prvi" }));
    expect(screen.getByRole("dialog", { name: "Drugi" })).toBeInTheDocument();
    // Let the closed dialog's Back run: the open one keeps an entry, so Back would still close it.
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(window.history.state).toMatchObject({ overlayDepth: 1 });
    expect(screen.getByRole("dialog", { name: "Drugi" })).toBeInTheDocument();
  });
});
