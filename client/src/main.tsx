import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
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
