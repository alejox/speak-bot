import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App";
import { createAppServices } from "./app/composition-root";
import "./styles.css";

const root = document.getElementById("root");
if (!root) throw new Error("Root element #root not found.");

const services = createAppServices();

createRoot(root).render(
  <StrictMode>
    <App services={services} />
  </StrictMode>,
);
