import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import DateInput from "./DateInput.js";
import { t } from "../../test/utils.js";

const renderInput = (value = "2026-03-05") => {
  const onChange = vi.fn();
  render(<DateInput label="Od" value={value} onChange={onChange} />);
  return { onChange, input: screen.getByLabelText("Od") };
};

describe("DateInput", () => {
  it("shows the date as dd/mm/yyyy", () => {
    const { input } = renderInput();
    expect(input).toHaveValue("05/03/2026");
    expect(input).toHaveAttribute("placeholder", t("common.datePlaceholder"));
  });

  it("sends a typed date as YYYY-MM-DD when the field loses focus", async () => {
    const { input, onChange } = renderInput();
    await userEvent.clear(input);
    await userEvent.type(input, "1/12/2026");
    expect(onChange).not.toHaveBeenCalled();

    await userEvent.tab();
    expect(onChange).toHaveBeenCalledWith("2026-12-01");
  });

  it("sends a typed date on Enter", async () => {
    const { input, onChange } = renderInput();
    await userEvent.clear(input);
    await userEvent.type(input, "31.12.2026{Enter}");
    expect(onChange).toHaveBeenCalledWith("2026-12-31");
  });

  it("goes back to the current date after invalid text", async () => {
    const { input, onChange } = renderInput();
    await userEvent.clear(input);
    await userEvent.type(input, "31/02/2026");
    await userEvent.tab();

    expect(onChange).not.toHaveBeenCalled();
    expect(input).toHaveValue("05/03/2026");
  });

  it("sends the date picked in the calendar", async () => {
    const { onChange } = renderInput();
    await userEvent.click(screen.getByRole("button", { name: t("common.pickDate") }));
    fireEvent.change(screen.getByTestId("date-picker"), { target: { value: "2026-04-10" } });
    expect(onChange).toHaveBeenCalledWith("2026-04-10");
  });
});
