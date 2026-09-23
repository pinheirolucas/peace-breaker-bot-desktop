import { createRoot } from "react-dom/client";

// Self-hosted: the packaged app loads over file:// with no network
// guarantee, so a fonts.googleapis.com link would work all through
// development and fall back to the system sans in the built app. The
// variable cut is what makes weight 650 in the type ramp reachable —
// the static 400/500/600/700 cut rounds it to 700.
import "@fontsource-variable/archivo";

import "./styles/tokens.css";
import "./styles/base.css";
import "./i18n";
import App from "./App";
import QuickPanel from "./QuickPanel";

const root = document.getElementById("root");

if (!root) {
  throw new Error("index.html has no #root to mount the app into");
}

// The quick access is this same bundle at `/?panel=1`, loaded by its own window.
// Stamped before React mounts so the frosted ground is right from the first frame.
const panel = new URLSearchParams(window.location.search).get("panel") === "1";

if (panel) {
  document.documentElement.dataset.panel = "1";
}

createRoot(root).render(panel ? <QuickPanel /> : <App />);
