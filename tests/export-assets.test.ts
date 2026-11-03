import assert from "node:assert/strict";
import test from "node:test";

import {
  ExportAssetError,
  PORTABLE_LAUNCH_INSTRUCTIONS,
  fetchExportAsset,
  formatExportFailure,
  getExportRuntimeWarning,
  isExportAssetFailure,
  resolveExportAssetUrl,
} from "../app/lib/export-assets.ts";

test("file URLs fail before any export asset request and explain the portable launcher", async () => {
  let requestCount = 0;
  await assert.rejects(
    fetchExportAsset("fonts/NotoSerif-Regular.ttf", "Noto Serif font", {
      protocol: "file:",
      baseUri: "file:///Users/example/STOA/index.html",
      fetcher: async () => {
        requestCount += 1;
        return new Response();
      },
    }),
    (error: unknown) => {
      assert.ok(error instanceof ExportAssetError);
      assert.equal(error.code, "launcher-required");
      assert.match(error.message, /Start-STOA-macOS\.command/u);
      assert.match(error.message, /Start-STOA-Windows\.bat/u);
      assert.doesNotMatch(error.message, /Failed to fetch/u);
      return true;
    },
  );
  assert.equal(requestCount, 0);
  assert.equal(getExportRuntimeWarning("file:"), PORTABLE_LAUNCH_INSTRUCTIONS);
  assert.equal(getExportRuntimeWarning("http:"), null);
});

test("runtime export assets resolve relative to the active STOA page", async () => {
  let requestedUrl = "";
  const response = await fetchExportAsset("fonts/NotoSerif-Regular.ttf", "Noto Serif font", {
    protocol: "http:",
    baseUri: "http://127.0.0.1:8765/subdirectory/index.html",
    fetcher: async (url) => {
      requestedUrl = url;
      return new Response(new Uint8Array([1, 2, 3]), { status: 200 });
    },
  });
  assert.equal(requestedUrl, "http://127.0.0.1:8765/subdirectory/fonts/NotoSerif-Regular.ttf");
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), new Uint8Array([1, 2, 3]));
  assert.equal(
    resolveExportAssetUrl("vendor/pdf.worker.min.mjs", "http://127.0.0.1:8765/"),
    "http://127.0.0.1:8765/vendor/pdf.worker.min.mjs",
  );
  assert.equal(
    resolveExportAssetUrl("vendor/pdf.worker.min.mjs", "stoa://app/index.html"),
    "stoa://app/vendor/pdf.worker.min.mjs",
  );
  assert.equal(getExportRuntimeWarning("stoa:"), null);
});

test("the packaged desktop protocol can fetch export assets without file URL warnings", async () => {
  let requestedUrl = "";
  const response = await fetchExportAsset("fonts/NotoSerif-Regular.ttf", "Noto Serif font", {
    protocol: "stoa:",
    baseUri: "stoa://app/index.html",
    fetcher: async (url) => {
      requestedUrl = url;
      return new Response(new Uint8Array([7, 8]), { status: 200 });
    },
  });
  assert.equal(requestedUrl, "stoa://app/fonts/NotoSerif-Regular.ttf");
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), new Uint8Array([7, 8]));
});

test("network and missing-asset errors provide recovery actions instead of raw fetch errors", async () => {
  await assert.rejects(
    fetchExportAsset("fonts/NotoSerif-Regular.ttf", "Noto Serif font", {
      protocol: "http:",
      baseUri: "http://127.0.0.1:8765/",
      fetcher: async () => {
        throw new TypeError("Failed to fetch");
      },
      retryDelayMs: 0,
    }),
    (error: unknown) => {
      assert.ok(error instanceof ExportAssetError);
      assert.equal(error.code, "network-unavailable");
      assert.match(error.message, /keep the launcher window open/iu);
      assert.doesNotMatch(error.message, /Failed to fetch/u);
      return true;
    },
  );

  await assert.rejects(
    fetchExportAsset("fonts/missing.ttf", "test font", {
      protocol: "http:",
      baseUri: "http://127.0.0.1:8765/",
      fetcher: async () => new Response(null, { status: 404 }),
    }),
    (error: unknown) => {
      assert.ok(error instanceof ExportAssetError);
      assert.equal(error.code, "asset-missing");
      assert.match(error.message, /HTTP 404/u);
      assert.match(error.message, /portable folder may be incomplete/u);
      return true;
    },
  );

  assert.doesNotMatch(
    formatExportFailure(new TypeError("Failed to fetch dynamically imported module: pdf.worker.min.mjs")),
    /Failed to fetch/u,
  );
  assert.match(
    formatExportFailure(new TypeError("Failed to fetch dynamically imported module: pdf.worker.min.mjs")),
    /local export resources/u,
  );
  assert.equal(isExportAssetFailure(new TypeError("Load failed")), true);
});

test("a transient network failure is retried once and can recover", async () => {
  let attempts = 0;
  const response = await fetchExportAsset("fonts/NotoSerif-Regular.ttf", "Noto Serif font", {
    protocol: "http:",
    baseUri: "http://127.0.0.1:8765/",
    retryDelayMs: 0,
    fetcher: async () => {
      attempts += 1;
      if (attempts === 1) throw new TypeError("Failed to fetch");
      return new Response(new Uint8Array([9]), { status: 200 });
    },
  });
  assert.equal(attempts, 2);
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), new Uint8Array([9]));
});
