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
import QuickAccess from "./QuickAccess";
import { isQuickAccessWindow } from "./lib/quickAccessCompat";

const root = document.getElementById("root");

if (!root) {
  throw new Error("index.html has no #root to mount the app into");
}

// Quick access is this same bundle at `/?quickAccess=1`, loaded by its own window.
// Stamped before React mounts so the frosted ground is right from the first frame.
const quickAccess = isQuickAccessWindow(window.location.search);

if (quickAccess) {
  document.documentElement.dataset.quickAccess = "1";
}

createRoot(root).render(quickAccess ? <QuickAccess /> : <App />);
