import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ConfirmModal from "./ConfirmModal.js";
import { t } from "../../test/utils.js";

const renderModal = (props: Partial<React.ComponentProps<typeof ConfirmModal>> = {}) => {
  const onConfirm = vi.fn();
  const onClose = vi.fn();
  render(
    <ConfirmModal
      title="Obrisati proizvod?"
      message="Proizvod će biti trajno obrisan."
      confirmLabel="Obriši proizvod"
      variant="danger"
      busy={false}
      onConfirm={onConfirm}
      onClose={onClose}
      {...props}
    />,
  );
  return { onConfirm, onClose };
};

const confirmButton = () => screen.getByRole("button", { name: "Obriši proizvod" });
const cancelButton = () => screen.getByRole("button", { name: t("common.cancel") });

describe("ConfirmModal", () => {
  it("is a dialog named by its title, with the message and an action-named button", () => {
    renderModal();
    expect(screen.getByRole("dialog", { name: "Obrisati proizvod?" })).toHaveTextContent("Proizvod će biti trajno obrisan.");
    expect(confirmButton()).toBeInTheDocument();
    expect(cancelButton()).toBeInTheDocument();
  });

  it("colors the confirm button by variant", () => {
    const { unmount } = render(
      <ConfirmModal title="A" message="m" confirmLabel="Prihvati" variant="success" busy={false} onConfirm={vi.fn()} onClose={vi.fn()} />,
    );
    expect(screen.getByRole("button", { name: "Prihvati" })).toHaveClass("bg-green-600");
    unmount();

    renderModal();
    expect(confirmButton()).toHaveClass("bg-red-600");
  });

  it("starts on Cancel for danger and on the action for success", () => {
    const { unmount } = render(
      <ConfirmModal title="A" message="m" confirmLabel="Prihvati" variant="success" busy={false} onConfirm={vi.fn()} onClose={vi.fn()} />,
    );
    expect(screen.getByRole("button", { name: "Prihvati" })).toHaveFocus();
    unmount();

    renderModal();
    expect(cancelButton()).toHaveFocus();
  });

  it("confirms once with an empty reason when none is asked", async () => {
    const { onConfirm, onClose } = renderModal();
    await userEvent.click(confirmButton());
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledWith("");
    expect(onClose).not.toHaveBeenCalled();
  });

  it("disables the action while busy, so no second request is sent", async () => {
    const { onConfirm } = renderModal({ busy: true });
    expect(confirmButton()).toBeDisabled();
    await userEvent.click(confirmButton());
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("cancels with the Cancel button, Escape and a backdrop click", async () => {
    const { onConfirm, onClose } = renderModal({ cancelLabel: "Zadrži" });
    await userEvent.click(screen.getByRole("button", { name: "Zadrži" }));
    await userEvent.keyboard("{Escape}");
    await userEvent.click(screen.getByRole("dialog").parentElement!);
    expect(onClose).toHaveBeenCalledTimes(3);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("requires a reason when asked and passes it trimmed", async () => {
    const { onConfirm } = renderModal({ reason: true });
    const reason = screen.getByLabelText(t("admin.common.reasonLabel"));
    expect(reason).toHaveAttribute("aria-required", "true");

    await userEvent.click(confirmButton());
    expect(onConfirm).not.toHaveBeenCalled();
    expect(reason).toHaveAttribute("aria-invalid", "true");
    expect(reason).toHaveAccessibleDescription(t("common.fieldRequired"));

    await userEvent.type(reason, "  Kršenje pravila  ");
    await userEvent.click(confirmButton());
    expect(onConfirm).toHaveBeenCalledWith("Kršenje pravila");
  });
});
