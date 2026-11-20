import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
// Self-hosted fonts of the restaurant home page and the footer (font-jakarta, font-condensed).
import "@fontsource/plus-jakarta-sans/400.css";
import "@fontsource/plus-jakarta-sans/500.css";
import "@fontsource/plus-jakarta-sans/600.css";
import "@fontsource/plus-jakarta-sans/700.css";
import "@fontsource/plus-jakarta-sans/800.css";
import "@fontsource/barlow-condensed/800.css";
import "./index.css";
import App from "./App.js";
import { AuthProvider } from "./context/AuthContext.js";
import AppToaster from "./components/AppToaster.js";
import './i18n/config.js';

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AuthProvider>
      <AppToaster />
      <App />
    </AuthProvider>
  </StrictMode>,
);
