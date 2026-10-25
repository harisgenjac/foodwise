import { useEffect } from "react";
import { ToastBar, Toaster, toast, useToasterStore } from "react-hot-toast";
import { useTranslation } from "react-i18next";
import { X } from "lucide-react";

const TOAST_DURATION_MS = 5000;
const MAX_VISIBLE_TOASTS = 3;

// Every toast in the app: top right (full width on phones), 5 seconds, at most three at once,
// above modals, with a close button. Hovering pauses the timer (react-hot-toast's default).
function AppToaster() {
  const { t } = useTranslation();
  const { toasts } = useToasterStore();

  // The store keeps the newest first; older toasts beyond the limit are closed.
  useEffect(() => {
    toasts
      .filter((item) => item.visible)
      .slice(MAX_VISIBLE_TOASTS)
      .forEach((item) => toast.dismiss(item.id));
  }, [toasts]);

  return (
    <Toaster
      position="top-right"
      containerClassName="max-sm:inset-2!"
      containerStyle={{ zIndex: 9999 }}
      toastOptions={{ duration: TOAST_DURATION_MS, className: "max-sm:w-full! max-sm:max-w-none!" }}
    >
      {(item) => (
        <ToastBar toast={item}>
          {({ icon, message }) => (
            <>
              {icon}
              {message}
              {item.type !== "loading" && (
                <button
                  type="button"
                  onClick={() => toast.dismiss(item.id)}
                  aria-label={t("common.closeToast")}
                  className="shrink-0 cursor-pointer rounded-lg p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </>
          )}
        </ToastBar>
      )}
    </Toaster>
  );
}

export default AppToaster;
