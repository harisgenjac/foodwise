import "@testing-library/jest-dom/vitest";
import { cleanup, configure } from "@testing-library/react";
import i18n from "../i18n/config.js";
import { resetCitiesCache } from "../hooks/useCities.js";

// No test talks to the server: every file gets this mocked axios instance,
// and tests set responses through the helpers in ./utils.tsx.
vi.mock("../api/axios.js", () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
    // AuthContext registers a 401 handler; tests that need it read the handler from use.mock.calls.
    interceptors: { response: { use: vi.fn(), eject: vi.fn() } },
  },
  API_ORIGIN: "http://localhost:3000",
  assetUrl: (path: string) => `http://localhost:3000${path}`,
}));

// Pages debounce their requests by 500ms (useFetch), so allow more than the 1s default.
configure({ asyncUtilTimeout: 3000 });

afterEach(async () => {
  cleanup();
  // Forget the mocked responses and undo vi.spyOn (console, toast) so tests stay independent.
  vi.resetAllMocks();
  vi.restoreAllMocks();
  resetCitiesCache();
  await i18n.changeLanguage("bs");
});
