import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles.css";
import "./theme.css";
import "./lists.css";
import { initCued } from "./net/cuedPlayer";

// Opened from cued: read who plays before anything else looks at the address.
initCued();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
