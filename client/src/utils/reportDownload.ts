import axios from "axios";
import { translateServerMessage } from "../i18n/serverMessages.js";

// A report is requested as a blob, so a JSON error body arrives as a blob too.
export const readError = async (err: unknown): Promise<string | null> => {
  if (!axios.isAxiosError(err) || !(err.response?.data instanceof Blob)) return null;
  try {
    const message = JSON.parse(await err.response.data.text()).error;
    return typeof message === "string" ? translateServerMessage(message) : null;
  } catch {
    return null;
  }
};

export const saveFile = (blob: Blob, fileName: string) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
};
