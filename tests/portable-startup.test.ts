import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import {
  PORTABLE_WORKING_LOCAL_STORAGE_KEYS,
  PORTABLE_WORKING_SESSION_STORAGE_KEYS,
  preparePortableLaunch,
} from "../standalone/portable-launch.ts";

class MemoryStorage {
  readonly values = new Map<string, string>();

  constructor(values: Record<string, string> = {}) {
    for (const [key, value] of Object.entries(values)) this.values.set(key, value);
  }

  removeItem(key: string) {
    this.values.delete(key);
  }
}

const root = path.resolve(import.meta.dirname, "..");

test("a launcher visit resets all browser-cached document state before hydration", () => {
  const localStorage = new MemoryStorage({
    "stoa-studio-language": "latin",
    "stoa-studio-settings": "stale settings",
    "stoa-official-sample-open-state-v1": "stale open state",
    "stoa-working-projects-v1": "stale Latin and Chinese projects",
    "stoa-user-token-style-defaults": "durable user preference",
    "stoa.omni.experimental-warning.dismissed": "durable warning preference",
    "unrelated-origin-data": "keep",
  });
  const sessionStorage = new MemoryStorage({
    "stoa-manual-ai-session-v1": "stale session",
    "stoa-manual-ai-drafts-v1": "stale draft",
    "unrelated-session-data": "keep",
  });
  let replacedUrl = "";

  const result = preparePortableLaunch({
    href: "http://127.0.0.1:8765/?stoa-launch=fresh-session&debug=1#preview",
    localStorage,
    sessionStorage,
    replaceUrl: (url) => { replacedUrl = url; },
  });

  assert.deepEqual(result, { reset: true, cleanUrl: "/?debug=1#preview" });
  assert.equal(replacedUrl, "/?debug=1#preview");
  for (const key of PORTABLE_WORKING_LOCAL_STORAGE_KEYS) {
    assert.equal(localStorage.values.has(key), false, key);
  }
  for (const key of PORTABLE_WORKING_SESSION_STORAGE_KEYS) {
    assert.equal(sessionStorage.values.has(key), false, key);
  }
  assert.equal(localStorage.values.get("stoa-user-token-style-defaults"), "durable user preference");
  assert.equal(localStorage.values.get("stoa.omni.experimental-warning.dismissed"), "durable warning preference");
  assert.equal(localStorage.values.get("unrelated-origin-data"), "keep");
  assert.equal(sessionStorage.values.get("unrelated-session-data"), "keep");
});

test("ordinary refreshes and hosted/Desktop loads never reset working state", () => {
  const localStorage = new MemoryStorage({ "stoa-working-projects-v1": "keep" });
  const sessionStorage = new MemoryStorage({ "stoa-manual-ai-session-v1": "keep" });
  let replaceCount = 0;

  const result = preparePortableLaunch({
    href: "http://127.0.0.1:8765/",
    localStorage,
    sessionStorage,
    replaceUrl: () => { replaceCount += 1; },
  });

  assert.deepEqual(result, { reset: false, cleanUrl: null });
  assert.equal(localStorage.values.get("stoa-working-projects-v1"), "keep");
  assert.equal(sessionStorage.values.get("stoa-manual-ai-session-v1"), "keep");
  assert.equal(replaceCount, 0);
});

test("macOS and Windows launchers share one cache-busted portable server path", async () => {
  const [server, macLauncher, windowsLauncher, main] = await Promise.all([
    readFile(path.join(root, "standalone/portable/serve_stoa.py"), "utf8"),
    readFile(path.join(root, "standalone/portable/Start-STOA-macOS.command"), "utf8"),
    readFile(path.join(root, "standalone/portable/Start-STOA-Windows.bat"), "utf8"),
    readFile(path.join(root, "standalone/main.tsx"), "utf8"),
  ]);

  assert.match(server, /LAUNCH_QUERY_PARAMETER = "stoa-launch"/u);
  assert.match(server, /token_hex\(16\)/u);
  assert.match(server, /url = f"http:\/\/\{HOST\}:\{port\}\/\?\{query\}"/u);
  assert.match(macLauncher, /python3 serve_stoa\.py/u);
  assert.match(windowsLauncher, /py -3 serve_stoa\.py/u);
  assert.match(windowsLauncher, /python serve_stoa\.py/u);
  assert.match(windowsLauncher, /sys\.version_info\.major == 3/u);
  assert.match(windowsLauncher, /if not errorlevel 1 goto use_py/u);
  assert.doesNotMatch(windowsLauncher, /%errorlevel%/u);
  assert.match(main, /prepareCurrentPortableLaunch\(\);/u);
});
