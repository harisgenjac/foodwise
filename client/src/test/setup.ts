import "@testing-library/jest-dom/vitest";
import { cleanup, configure } from "@testing-library/react";
import i18n from "../i18n/config.js";

// No test talks to the server: every file gets this mocked axios instance,
// and tests set responses through the helpers in ./utils.tsx.
vi.mock("../api/axios.js", () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

// Pages debounce their requests by 500ms (useFetch), so allow more than the 1s default.
configure({ asyncUtilTimeout: 3000 });

afterEach(async () => {
  cleanup();
  // Forget the mocked responses and undo vi.spyOn (console, toast) so tests stay independent.
  vi.resetAllMocks();
  vi.restoreAllMocks();
  await i18n.changeLanguage("bs");
});
