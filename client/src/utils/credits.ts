import axios from "axios";

// The server's 402 when a product or reservation needs a credit the user does not have.
export interface CreditError {
  hasActiveSubscription: boolean;
  // Where the user can fix it: the subscription or the top-up section of My profile.
  actionUrl: string;
}

export const getCreditError = (err: unknown): CreditError | null => {
  if (!axios.isAxiosError(err) || err.response?.status !== 402) return null;
  const data = err.response.data;
  if (data?.code !== "INSUFFICIENT_CREDITS") return null;
  return {
    hasActiveSubscription: Boolean(data.hasActiveSubscription),
    actionUrl: typeof data.actionUrl === "string" ? data.actionUrl : "/my-profile",
  };
};
