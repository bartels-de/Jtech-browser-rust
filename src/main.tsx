import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { initStorage } from "./store/storage";

// Runde 4: Daten aus Rust (SQLite) laden, bevor die UI rendert (inkl. einmaliger localStorage-Migration).
initStorage().finally(() => {
  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
});
