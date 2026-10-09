import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import Studio from "../app/stoa-studio";
import "../app/globals.css";
import { prepareCurrentPortableLaunch } from "./portable-launch";

// This is a no-op in hosted/development/Desktop builds. The portable launcher
// supplies the marker that makes each new local-web app session start from the
// immutable developer samples instead of a stale browser working copy.
prepareCurrentPortableLaunch();

const root = document.getElementById("root");

if (!root) {
  throw new Error("STOA could not find its application root.");
}

createRoot(root).render(
  <StrictMode>
    <Studio />
  </StrictMode>,
);
