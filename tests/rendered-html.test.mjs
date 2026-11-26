import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { register } from "node:module";
import test from "node:test";

// vinext 1.4+ imports `cloudflare:workers` (for optional tracing) inside the built
// Cloudflare Worker bundle; stub it when exercising the bundle directly in Node.
register(`data:text/javascript,${encodeURIComponent(`
  export async function resolve(specifier, context, nextResolve) {
    if (specifier === "cloudflare:workers") {
      return { shortCircuit: true, url: "data:text/javascript,export const tracing = undefined;" };
    }
    return nextResolve(specifier, context);
  }
`)}`);

async function render(pathname = "/") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request(`http://localhost${pathname}`, { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the STOA marketing site without the retired Web Trial", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>STOA — Interlinear Reading &amp; Scholarly Typesetting<\/title>/i);
  assert.match(html, /Read closely\./);
  assert.match(html, /Download STOA/);
  assert.match(html, /stoa-classical-language-tool\/releases\/latest/);
  assert.match(html, /Ancient Greek/);
  assert.match(html, /Classical Chinese/);
  assert.doesNotMatch(html, /href="\/trial"|Web Trial|trial-app/i);

  for (const pathname of ["/privacy", "/terms"]) {
    const legalResponse = await render(pathname);
    assert.equal(legalResponse.status, 200);
    assert.doesNotMatch(await legalResponse.text(), /href="\/trial"|Web Trial/i);
  }

  const trialResponse = await render("/trial");
  assert.equal(trialResponse.status, 404);
});

test("source keeps classical dictionaries gated and exposes the retained JSON workspace", async () => {
  const page = await readFile(new URL("../app/stoa-studio.tsx", import.meta.url), "utf8");
  const languageConfig = await readFile(new URL("../app/language-config.ts", import.meta.url), "utf8");

  assert.match(page, /dictionaryLookupEnabled \? \(event\)/);
  assert.match(page, /const supportsUserDictionary = isStoaLanguageId\(language\)/);
  assert.match(page, /json-workspace-batches/);
  assert.match(page, /Delete all JSON & start blank/);
  assert.match(page, /Load Analysis into Preview/);
  assert.doesNotMatch(languageConfig, /"spanish"|"french"|"german"|"japanese-to-chinese"|"chinese-to-japanese"|"chinese-to-english"/);
});

test("Step 2 exposes one central five-layer Token Editor and removes the old expanded style panels", async () => {
  const page = await readFile(new URL("../app/stoa-studio.tsx", import.meta.url), "utf8");
  const editor = await readFile(new URL("../app/token-editor.tsx", import.meta.url), "utf8");

  assert.match(page, />More · Token Editor<\/button>/);
  assert.match(page, /selectedTokens=\{selectedTokens\}/);
  assert.match(page, /selectedIds=\{selection\.selectedIds\}/);
  assert.match(page, /documentStyle=\{documentTokenStyle\}/);
  assert.match(page, /onApply=\{applyTokenEditorDraft\}/);
  assert.match(page, /onCancel=\{\(\) => setTokenEditorOpen\(false\)\}/);
  assert.doesNotMatch(page, /Selected Annotation Style|Selected Source-word Style/);

  for (const layer of ["Source", "Gloss", "Lemma", "POS", "Morphology"]) {
    assert.match(editor, new RegExp(`${layer.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`));
  }
  for (const preset of ["Ink", "Rust", "Blue", "Green", "Plum"]) {
    assert.match(editor, new RegExp(`label: "${preset}"`));
  }
  assert.match(editor, /type="color"/);
  assert.match(editor, /type="number"[\s\S]*TOKEN_FONT_SIZE_STEP_PT/);
  assert.match(editor, /data-state=\{state\}[\s\S]*aria-pressed=\{state === "mixed" \? "mixed"/);
  assert.match(editor, /TOKEN_GAP_ANCHORS\.map/);
  assert.match(editor, /Hidden layers do not consume space\./);
  assert.match(editor, /Changes remain a draft until Apply\./);
  assert.match(editor, /Apply to selection/);
  assert.match(editor, /expanded\.has\(layer\)/);
  assert.match(editor, /new Set\(\["source"\]\)/);
});

test("Step 2 layout diagnostics respect five-layer defaults and protect sparse token overrides", async () => {
  const page = await readFile(new URL("../app/stoa-studio.tsx", import.meta.url), "utf8");

  assert.match(page, /tokenStyle: documentTokenStyleFor\(settings\)/);
  assert.match(page, /const effectiveOverrides = analysis\.tokens\.map/);
  assert.match(page, /override: tokenStyleOverrideFor\(item, documentTokenStyleFor\(settings\)\)/);
  assert.match(page, /tokensWithOverrides: effectiveOverrides\.filter\(\(item\) => item\.override\)\.length/);
  assert.match(page, /never emit or overwrite token-level overrides/);
  assert.match(page, /synchronizeExplicitTokenStyle/);
  assert.match(page, /normalizeDocumentTokenStyle\(stylePatch, documentTokenStyleFor\(resolved\)\)/);
});

test("Step 3 separates current-document Composition styles from explicit future defaults", async () => {
  const page = await readFile(new URL("../app/stoa-studio.tsx", import.meta.url), "utf8");
  const editor = await readFile(new URL("../app/composition-style-editor.tsx", import.meta.url), "utf8");

  assert.match(page, /More · Default styles/);
  assert.match(page, /value=\{documentTokenStyle\}/);
  assert.match(page, /builtInStyle=\{builtInTokenStyleFor\(language\)\}/);
  assert.match(page, /savedDefault=\{getUserTokenStyleDefault\(userTokenStyleDefaults, language\) \?\? null\}/);
  assert.match(page, /onUseAsDefault=\{saveCompositionStyleAsDefault\}/);
  assert.match(page, /onClearSavedDefault=\{clearCompositionStyleDefault\}/);
  assert.match(page, /applyUserDefaultTokenStyleToImport\(value, language, userDefaults\)/);
  assert.match(page, /if \(!localPreferencesHydrated\) return;/);

  assert.match(editor, /Edits remain local until Apply\./);
  assert.match(editor, /Use draft for future documents/);
  assert.match(editor, /Imported projects keep explicit styles/);
  assert.match(editor, /TOKEN_STYLE_LAYERS\.map/);
  assert.match(editor, /TOKEN_GAP_ANCHORS\.map/);
  assert.match(editor, /Apply to document/);
  assert.match(editor, /new Set\(\["source"\]\)/);
});
