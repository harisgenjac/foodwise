import { render, screen } from "@testing-library/react";
import { Mail } from "lucide-react";
import FormField, { inputStyle } from "./FormField.js";

describe("FormField", () => {
  it("marks a required field without adding the asterisk to its name", () => {
    render(
      <FormField label="Email" icon={Mail} required>
        <input className={inputStyle} />
      </FormField>,
    );
    const input = screen.getByLabelText("Email");
    expect(input).toHaveAttribute("aria-required", "true");
    expect(screen.getByText("Email")).toHaveClass("after:content-['*']");
    expect(input).not.toHaveAttribute("aria-invalid");
  });

  it("leaves an optional field unmarked", () => {
    render(
      <FormField label="Notes">
        <textarea className={inputStyle} />
      </FormField>,
    );
    expect(screen.getByLabelText("Notes")).not.toHaveAttribute("aria-required");
    expect(screen.getByText("Notes")).not.toHaveClass("after:content-['*']");
  });

  it("links the error message to the field and turns it red", () => {
    render(
      <FormField label="Email" icon={Mail} required error="This field is required.">
        <input className={inputStyle} />
      </FormField>,
    );
    const input = screen.getByLabelText("Email");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAccessibleDescription("This field is required.");
    expect(input).toHaveClass("border-red-400");
    expect(input).not.toHaveClass("border-gray-200");
    // The message is outside the label, so it is not part of the field's name.
    expect(input).toHaveAccessibleName("Email");
  });
});
