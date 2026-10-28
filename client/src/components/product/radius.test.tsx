import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import i18n from "../../i18n/config.js";
import RadiusSelect from "./RadiusSelect.js";
import OutsideRadiusHint from "./OutsideRadiusHint.js";
import { t } from "../../test/utils.js";

describe("RadiusSelect", () => {
  it("offers 5, 10, 20, 50 km and all cities, and reports the choice", async () => {
    const onChange = vi.fn();
    render(<RadiusSelect value="10" onChange={onChange} />);

    const select = screen.getByLabelText("Udaljenost");
    expect(select).toHaveDisplayValue("Do 10 km");
    expect(screen.getAllByRole("option").map((option) => option.textContent)).toEqual([
      "Do 5 km",
      "Do 10 km",
      "Do 20 km",
      "Do 50 km",
      "Svi gradovi",
    ]);
    await userEvent.selectOptions(select, "Svi gradovi");
    expect(onChange).toHaveBeenCalledWith("all");
  });
});

describe("OutsideRadiusHint", () => {
  it.each([
    [1, "Još 1 ponuda je dalje od 10 km."],
    [3, "Još 3 ponude su dalje od 10 km."],
    [5, "Još 5 ponuda je dalje od 10 km."],
  ])("counts %i offers in Bosnian", (count, text) => {
    render(<OutsideRadiusHint count={count} radius="10" kind="offers" onWiden={() => {}} />);
    expect(screen.getByText(text)).toBeInTheDocument();
  });

  it.each([
    [1, "Još 1 prodavnica je dalje od 5 km."],
    [2, "Još 2 prodavnice su dalje od 5 km."],
    [11, "Još 11 prodavnica je dalje od 5 km."],
  ])("counts %i stores in Bosnian", (count, text) => {
    render(<OutsideRadiusHint count={count} radius="5" kind="stores" onWiden={() => {}} />);
    expect(screen.getByText(text)).toBeInTheDocument();
  });

  it("pluralizes in English", async () => {
    await i18n.changeLanguage("en");
    const { rerender } = render(<OutsideRadiusHint count={1} radius="20" kind="offers" onWiden={() => {}} />);
    expect(screen.getByText("1 more offer is further than 20 km.")).toBeInTheDocument();
    rerender(<OutsideRadiusHint count={4} radius="20" kind="stores" onWiden={() => {}} />);
    expect(screen.getByText("4 more stores are further than 20 km.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Show up to 50 km" })).toBeInTheDocument();
  });

  it.each([
    ["5", "Prikaži do 10 km", "10"],
    ["10", "Prikaži do 20 km", "20"],
    ["20", "Prikaži do 50 km", "50"],
    ["50", "Prikaži sve gradove", "all"],
  ] as const)("at %s km offers %s and widens to %s", async (radius, label, next) => {
    const onWiden = vi.fn();
    render(<OutsideRadiusHint count={2} radius={radius} kind="offers" onWiden={onWiden} />);
    await userEvent.click(screen.getByRole("button", { name: label }));
    expect(onWiden).toHaveBeenCalledWith(next);
  });

  it("shows nothing when nothing lies beyond the radius, or with all cities", () => {
    const { container, rerender } = render(
      <OutsideRadiusHint count={0} radius="10" kind="offers" onWiden={() => {}} />,
    );
    expect(container).toBeEmptyDOMElement();
    rerender(<OutsideRadiusHint count={3} radius="all" kind="offers" onWiden={() => {}} />);
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByText(t("radius.showAll"))).not.toBeInTheDocument();
  });
});
