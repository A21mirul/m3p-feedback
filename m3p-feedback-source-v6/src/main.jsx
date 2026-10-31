import React from "react";
import { createRoot } from "react-dom/client";
import "@excalidraw/excalidraw/index.css";
import "./styles.css";
import App from "./App.jsx";

createRoot(document.getElementById("root")).render(<App />);

// hand-drawn font for the sticky notes (bundled with the Excalidraw assets, so it works offline)
try {
  const f = new FontFace("Virgil", `url(${new URL("./excalidraw-assets/fonts/Virgil/Virgil-Regular.woff2", document.baseURI).href})`);
  f.load().then((ff) => document.fonts.add(ff)).catch(() => {});
} catch (e) { /* fall back to system handwriting fonts */ }
