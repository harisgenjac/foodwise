import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import WeeklyHoursEditor from "./WeeklyHoursEditor.js";
import { t } from "../../test/utils.js";
import type { Schedule } from "../../utils/schedule.js";

let latest: Schedule | null = null;

function Harness({ initial = null }: { initial?: Schedule | null }) {
  const [value, setValue] = useState<Schedule | null>(initial);
  return (
    <WeeklyHoursEditor
      label="Radno vrijeme"
      value={value}
      onChange={(next) => {
        latest = next;
        setValue(next);
      }}
    />
  );
}

const day = (key: string) => t(`schedule.days.${key}`);

describe("WeeklyHoursEditor", () => {
  beforeEach(() => {
    latest = null;
  });

  it("starts from the default hours with a note while nothing is entered", () => {
    render(<Harness />);
    expect(screen.getByText(t("schedule.notEntered"))).toBeInTheDocument();
    expect(screen.getByLabelText(t("schedule.opensAt", { day: day("mon") }))).toHaveValue("08:00");
  });

  it("closes a day and copies Monday to every day", async () => {
    render(<Harness />);
    await userEvent.click(screen.getByLabelText(t("schedule.openOn", { day: day("sun") })));
    expect(latest!.sun).toBeNull();
    expect(screen.queryByLabelText(t("schedule.opensAt", { day: day("sun") }))).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: t("schedule.copyMonday") }));
    expect(latest!.sun).toEqual({ open: "08:00", close: "20:00" });
  });

  it("stores a midnight closing as 24:00 and shows it as 00:00", () => {
    render(<Harness />);
    const close = screen.getByLabelText(t("schedule.closesAt", { day: day("fri") }));
    // jsdom has no time picker; a change event is what the browser sends.
    fireEvent.change(close, { target: { value: "00:00" } });
    expect(latest!.fri).toEqual({ open: "08:00", close: "24:00" });
    expect(close).toHaveValue("00:00");
  });
});
