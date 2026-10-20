import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import LanguageSwitcher from "./LanguageSwitcher.js";
import i18n from "../i18n/config.js";

describe("LanguageSwitcher", () => {
  it("shows the current language and switches to another one", async () => {
    const user = userEvent.setup();
    render(<LanguageSwitcher />);

    expect(screen.getByRole("button", { name: /BS/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /English/ })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /BS/ }));
    await user.click(screen.getByRole("button", { name: /English/ }));

    expect(i18n.language).toBe("en");
    expect(screen.getByRole("button", { name: /EN/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Bosanski/ })).not.toBeInTheDocument();
  });
});
