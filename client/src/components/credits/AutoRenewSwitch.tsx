import { useTranslation } from "react-i18next";
import AutoRenewTooltip from "./AutoRenewTooltip.js";

interface AutoRenewSwitchProps {
  checked: boolean;
  disabled?: boolean;
  onChange: () => void;
  // Accessible name when the visible label is left out (a table row names its branch).
  label?: string;
  hideLabel?: boolean;
}

// The auto-renew switch with its tooltip (the user's own subscription, and a headquarters
// switching it for a branch).
function AutoRenewSwitch({ checked, disabled = false, onChange, label, hideLabel = false }: AutoRenewSwitchProps) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center gap-2 text-sm">
      <label className="flex cursor-pointer items-center gap-2 font-medium text-gray-800">
        <input
          type="checkbox"
          role="switch"
          checked={checked}
          onChange={onChange}
          disabled={disabled}
          aria-label={label}
          className="h-4 w-4 accent-orange-500"
        />
        {!hideLabel && t("credits.profile.autoRenew")}
      </label>
      <AutoRenewTooltip />
    </div>
  );
}

export default AutoRenewSwitch;
