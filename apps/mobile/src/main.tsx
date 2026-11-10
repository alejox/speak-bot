import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App";
import { createAppServices } from "./app/composition-root";
import { DockApp } from "./app/DockApp";
import { isDockPath } from "./app/route";
import "./styles.css";

const root = document.getElementById("root");
if (!root) throw new Error("Root element #root not found.");

const services = createAppServices();
const Root = isDockPath(window.location.pathname, import.meta.env.BASE_URL) ? DockApp : App;

createRoot(root).render(
  <StrictMode>
    <Root services={services} />
  </StrictMode>,
);
