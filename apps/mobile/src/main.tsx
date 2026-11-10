import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { applyAppearance } from "./adapters/appearance-dom";
import { DEFAULT_APPEARANCE } from "./adapters/local-storage-appearance-store";
import { App } from "./app/App";
import { createAppServices } from "./app/composition-root";
import { DockApp } from "./app/DockApp";
import { isDockPath } from "./app/route";
import "./styles.css";

const root = document.getElementById("root");
if (!root) throw new Error("Root element #root not found.");

const services = createAppServices();
const isDock = isDockPath(window.location.pathname, import.meta.env.BASE_URL);
const Root = isDock ? DockApp : App;

// The OBS dock is always dark and compact, whatever this browser chose for the app.
applyAppearance(isDock ? DEFAULT_APPEARANCE : services.appearance.load());

createRoot(root).render(
  <StrictMode>
    <Root services={services} />
  </StrictMode>,
);
