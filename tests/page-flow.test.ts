import assert from "node:assert/strict";
import test from "node:test";

import {
  appendTrailingTextPages,
  appendTrailingTextSections,
  paginateFlowLines,
  SMART_ROW_GAP_MAXIMUM_RATIO,
  SMART_ROW_GAP_MINIMUM_RATIO,
  wrapMeasuredText,
} from "../app/lib/page-flow.ts";

const approximately = (actual: number | undefined, expected: number, tolerance = 0.0001) => {
  assert.ok(typeof actual === "number");
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} is not within ${tolerance} of ${expected}`);
};

test("paragraph spacing is preserved within a page and collapsed after a physical page break", () => {
  const withinPage = paginateFlowLines([
    { value: "first", height: 40, spacingBefore: 0 },
    { value: "second", height: 40, spacingBefore: 19 },
  ], 100, 0);
  assert.equal(withinPage.length, 1);
  assert.equal(withinPage[0].lines[1].spacingBefore, 19);
  assert.equal(withinPage[0].usedHeight, 99);

  const acrossPages = paginateFlowLines([
    { value: "first", height: 40, spacingBefore: 0 },
    { value: "second", height: 40, spacingBefore: 21 },
  ], 100, 0);
  assert.equal(acrossPages.length, 2);
  assert.equal(acrossPages[1].lines[0].spacingBefore, 0);
  assert.equal(acrossPages[1].usedHeight, 40);
});

test("a one-pixel threshold change never carries a large paragraph gap onto page two", () => {
  const atThreshold = paginateFlowLines([
    { value: "previous", height: 68, spacingBefore: 0 },
    { value: "paragraph", height: 31, spacingBefore: 1 },
  ], 100, 0);
  assert.equal(atThreshold.length, 1);
  assert.equal(atThreshold[0].lines[1].spacingBefore, 1);

  const onePixelOver = paginateFlowLines([
    { value: "previous", height: 68, spacingBefore: 0 },
    { value: "paragraph", height: 31, spacingBefore: 2 },
  ], 100, 0);
  assert.equal(onePixelOver.length, 2);
  assert.equal(onePixelOver[1].lines[0].spacingBefore, 0);
});

test("smart packing keeps one more atomic row when safe gap compression makes it fit", () => {
  const pages = paginateFlowLines(
    ["a", "b", "c"].map((value) => ({ value, height: 30, spacingBefore: 0 })),
    110,
    12,
    { smart: true },
  );

  assert.equal(pages.length, 1);
  assert.deepEqual(pages[0].lines.map((line) => line.value), ["a", "b", "c"]);
  approximately(pages[0].lines[1].gapBefore, 10);
  approximately(pages[0].lines[2].gapBefore, 10);
  assert.ok((pages[0].lines[1].gapBefore ?? 0) >= 12 * SMART_ROW_GAP_MINIMUM_RATIO);
});

test("small non-final-page surplus is shared evenly and stays inside the gap bounds", () => {
  const preferred = 6;
  const pages = paginateFlowLines(
    ["a", "b", "c", "d"].map((value) => ({ value, height: 20, spacingBefore: 0 })),
    73,
    preferred,
    { smart: true },
  );

  assert.equal(pages.length, 2);
  const resolved = pages[0].lines.slice(1).map((line) => line.gapBefore ?? -1);
  resolved.forEach((gap) => approximately(gap, 6.5));
  assert.ok(resolved.every((gap) => gap >= preferred * SMART_ROW_GAP_MINIMUM_RATIO));
  assert.ok(resolved.every((gap) => gap <= preferred * SMART_ROW_GAP_MAXIMUM_RATIO));
  approximately(pages[0].remainingHeight, 0);
});

test("the final page keeps preferred spacing and is not vertically stretched", () => {
  const pages = paginateFlowLines([
    { value: "a", height: 20, spacingBefore: 0 },
    { value: "b", height: 20, spacingBefore: 0 },
  ], 100, 10, { smart: true });

  assert.equal(pages.length, 1);
  approximately(pages[0].lines[1].gapBefore, 10);
  approximately(pages[0].usedHeight, 50);
  approximately(pages[0].remainingHeight, 50);
});

test("explicit break hints override packing and a short heading stays with following content", () => {
  const explicit = paginateFlowLines([
    { value: "first", height: 20, spacingBefore: 0 },
    { value: "second", height: 20, spacingBefore: 0, forcePageBreakBefore: true },
    { value: "third", height: 20, spacingBefore: 0 },
  ], 100, 5, { smart: true });
  assert.deepEqual(explicit.map((page) => page.lines.map((line) => line.value)), [
    ["first"],
    ["second", "third"],
  ]);
  assert.equal(explicit[0].breakReason, "explicit");

  const heading = paginateFlowLines([
    { value: "previous", height: 40, spacingBefore: 0 },
    { value: "heading", height: 20, spacingBefore: 0, keepWithNext: true },
    { value: "body", height: 30, spacingBefore: 0 },
  ], 70, 5, { smart: true });
  assert.deepEqual(heading.map((page) => page.lines.map((line) => line.value)), [
    ["previous"],
    ["heading", "body"],
  ]);
  assert.equal(heading[0].breakReason, "keep-with-next");
});

test("oversized atomic rows always make progress and pagination is stable", () => {
  const source = [
    { value: "oversized", height: 240, spacingBefore: 0 },
    { value: "normal", height: 20, spacingBefore: 0 },
  ];
  const first = paginateFlowLines(source, 100, 8, { smart: true });
  const second = paginateFlowLines(source, 100, 8, { smart: true });
  assert.deepEqual(first, second);
  assert.deepEqual(first.map((page) => page.lines.map((line) => line.value)), [
    ["oversized"],
    ["normal"],
  ]);
  assert.equal(first[0].remainingHeight, 0);
});

test("measured wrapping preserves explicit blank lines and splits long unspaced text", () => {
  const wrapped = wrapMeasuredText("alpha beta\n\n日本語の長い文章", 6, (value) => Array.from(value).length);
  assert.deepEqual(wrapped.slice(0, 3), ["alpha", "beta", ""]);
  assert.equal(wrapped.slice(3).join(""), "日本語の長い文章");
  assert.ok(wrapped.slice(3).every((line) => Array.from(line).length <= 6));
});

test("long trailing text uses remaining room and creates true continuation pages", () => {
  const pages = appendTrailingTextPages([
    {
      lines: [{ value: "tokens", height: 55, spacingBefore: 0 }],
      usedHeight: 55,
    },
  ], Array.from({ length: 12 }, (_, index) => `line-${index + 1}`), {
    pageCapacity: 100,
    lineHeight: 10,
    blockChromeHeight: 15,
    gapAfterContent: 10,
    minimumFirstFragmentLines: 2,
  });

  assert.equal(pages.length, 3);
  assert.deepEqual(pages[0].trailingText?.lines, ["line-1", "line-2"]);
  assert.equal(pages[0].trailingText?.startsAtPageTop, false);
  assert.deepEqual(pages[1].trailingText?.lines, [
    "line-3", "line-4", "line-5", "line-6", "line-7", "line-8", "line-9", "line-10",
  ]);
  assert.equal(pages[1].trailingText?.continued, true);
  assert.equal(pages[1].trailingText?.startsAtPageTop, true);
  assert.deepEqual(pages[2].trailingText?.lines, ["line-11", "line-12"]);
  assert.equal(pages[2].trailingText?.continued, true);
  assert.deepEqual(pages.map((page) => page.breakReason), ["capacity", "capacity", "end"]);
});

test("trailing text rebalances a safe 8 plus 1 split into 7 plus 2", () => {
  const sourceLines = Array.from({ length: 9 }, (_, index) => `line-${index + 1}`);
  const pages = appendTrailingTextPages([], sourceLines, {
    pageCapacity: 100,
    lineHeight: 10,
    blockChromeHeight: 20,
    gapAfterContent: 0,
    minimumFirstFragmentLines: 2,
  });

  assert.deepEqual(pages.map((page) => page.trailingText?.lines.length), [7, 2]);
  assert.deepEqual(
    pages.flatMap((page) => page.trailingText?.lines ?? []),
    sourceLines,
  );
  assert.ok(pages.every((page) => page.usedHeight <= 100));
  assert.deepEqual(pages.map((page) => page.breakReason), ["capacity", "end"]);
});

test("partial content page rebalances a safe 3 plus 1 split into 2 plus 2", () => {
  const pages = appendTrailingTextPages([
    {
      lines: [{ value: "tokens", height: 45, spacingBefore: 0 }],
      usedHeight: 45,
      breakReason: "end",
    },
  ], ["one", "two", "three", "four"], {
    pageCapacity: 100,
    lineHeight: 10,
    blockChromeHeight: 20,
    gapAfterContent: 5,
    minimumFirstFragmentLines: 2,
  });

  assert.deepEqual(pages.map((page) => page.trailingText?.lines), [
    ["one", "two"],
    ["three", "four"],
  ]);
  assert.ok(pages.every((page) => page.usedHeight <= 100));
  assert.deepEqual(pages.map((page) => page.breakReason), ["capacity", "end"]);
});

test("trailing text still progresses when a one-line fragment is mathematically unavoidable", () => {
  const sourceLines = ["one", "two", "three"];
  const pages = appendTrailingTextPages([], sourceLines, {
    pageCapacity: 36,
    lineHeight: 10,
    blockChromeHeight: 16,
    gapAfterContent: 0,
    minimumFirstFragmentLines: 2,
  });

  assert.deepEqual(pages.map((page) => page.trailingText?.lines.length), [2, 1]);
  assert.deepEqual(
    pages.flatMap((page) => page.trailingText?.lines ?? []),
    sourceLines,
  );
  assert.ok(pages.every((page) => page.usedHeight <= 36));
  assert.deepEqual(pages.map((page) => page.breakReason), ["capacity", "end"]);
});

test("a content-only page before a moved translation is marked as a capacity break", () => {
  const pages = appendTrailingTextPages([
    {
      lines: [{ value: "tokens", height: 80, spacingBefore: 0 }],
      usedHeight: 80,
      breakReason: "end",
    },
  ], ["one", "two", "three"], {
    pageCapacity: 100,
    lineHeight: 10,
    blockChromeHeight: 15,
    gapAfterContent: 10,
    minimumFirstFragmentLines: 2,
  });

  assert.equal(pages[0].trailingText, undefined);
  assert.deepEqual(pages[1].trailingText?.lines, ["one", "two", "three"]);
  assert.deepEqual(pages.map((page) => page.breakReason), ["capacity", "end"]);
});

test("sequential trailing-text sections share remaining page space with independent metrics", () => {
  const pages = appendTrailingTextSections([], [
    {
      id: "literal",
      lines: ["literal-1", "literal-2"],
      lineHeight: 5,
      blockChromeHeight: 7,
      gapAfterContent: 3,
      minimumFirstFragmentLines: 2,
    },
    {
      id: "natural",
      lines: ["natural-1", "natural-2"],
      lineHeight: 4,
      blockChromeHeight: 6,
      gapAfterContent: 4,
      minimumFirstFragmentLines: 2,
    },
  ], { pageCapacity: 50 });

  assert.equal(pages.length, 1);
  assert.deepEqual(pages[0].trailingTextSections, [
    {
      sectionId: "literal",
      lines: ["literal-1", "literal-2"],
      lineStart: 0,
      continued: false,
      startsAtPageTop: true,
    },
    {
      sectionId: "natural",
      lines: ["natural-1", "natural-2"],
      lineStart: 0,
      continued: false,
      startsAtPageTop: false,
    },
  ]);
  assert.equal(pages[0].usedHeight, 35);
  assert.equal(pages[0].remainingHeight, 15);
  assert.equal(pages[0].breakReason, "end");
});

test("a later trailing-text section continues without overwriting an earlier section", () => {
  const pages = appendTrailingTextSections([], [
    {
      id: "literal",
      lines: ["literal-1", "literal-2"],
      lineHeight: 10,
      blockChromeHeight: 10,
      gapAfterContent: 0,
      minimumFirstFragmentLines: 2,
    },
    {
      id: "natural",
      lines: Array.from({ length: 8 }, (_, index) => `natural-${index + 1}`),
      lineHeight: 10,
      blockChromeHeight: 10,
      gapAfterContent: 5,
      minimumFirstFragmentLines: 2,
    },
  ], { pageCapacity: 100 });

  assert.equal(pages.length, 2);
  assert.deepEqual(
    pages[0].trailingTextSections.map((fragment) => fragment.sectionId),
    ["literal", "natural"],
  );
  assert.deepEqual(pages[0].trailingTextSections[0].lines, ["literal-1", "literal-2"]);
  assert.deepEqual(pages[0].trailingTextSections[1].lines, [
    "natural-1", "natural-2", "natural-3", "natural-4", "natural-5",
  ]);
  assert.deepEqual(pages[1].trailingTextSections, [{
    sectionId: "natural",
    lines: ["natural-6", "natural-7", "natural-8"],
    lineStart: 5,
    continued: true,
    startsAtPageTop: true,
  }]);
  assert.deepEqual(pages.map((page) => page.breakReason), ["capacity", "end"]);
});

test("multi-section pagination preserves every section ID and line in source order", () => {
  const literalLines = Array.from({ length: 11 }, (_, index) => `literal-${index + 1}`);
  const naturalLines = Array.from({ length: 13 }, (_, index) => `natural-${index + 1}`);
  const pages = appendTrailingTextSections([], [
    {
      id: "literal",
      lines: literalLines,
      lineHeight: 8,
      blockChromeHeight: 16,
      gapAfterContent: 6,
      minimumFirstFragmentLines: 2,
    },
    {
      id: "natural",
      lines: naturalLines,
      lineHeight: 7,
      blockChromeHeight: 12,
      gapAfterContent: 5,
      minimumFirstFragmentLines: 2,
    },
  ], { pageCapacity: 64 });

  const fragments = pages.flatMap((page) => page.trailingTextSections);
  assert.deepEqual(
    fragments.filter((fragment) => fragment.sectionId === "literal")
      .flatMap((fragment) => fragment.lines),
    literalLines,
  );
  assert.deepEqual(
    fragments.filter((fragment) => fragment.sectionId === "natural")
      .flatMap((fragment) => fragment.lines),
    naturalLines,
  );
  assert.ok(
    fragments.findIndex((fragment) => fragment.sectionId === "natural")
      > fragments.map((fragment) => fragment.sectionId).lastIndexOf("literal"),
  );
  assert.ok(pages.every((page) => page.usedHeight <= 64));
});

test("multi-section pagination makes bounded progress on one-line tiny pages", () => {
  const literalLines = ["literal-1", "literal-2", "literal-3"];
  const naturalLines = ["natural-1", "natural-2"];
  const pages = appendTrailingTextSections([], [
    {
      id: "literal",
      lines: literalLines,
      lineHeight: 10,
      blockChromeHeight: 16,
      gapAfterContent: 2,
      minimumFirstFragmentLines: 2,
    },
    {
      id: "natural",
      lines: naturalLines,
      lineHeight: 8,
      blockChromeHeight: 18,
      gapAfterContent: 2,
      minimumFirstFragmentLines: 2,
    },
  ], { pageCapacity: 26 });

  assert.equal(pages.length, 5);
  assert.deepEqual(
    pages.flatMap((page) => page.trailingTextSections)
      .filter((fragment) => fragment.sectionId === "literal")
      .flatMap((fragment) => fragment.lines),
    literalLines,
  );
  assert.deepEqual(
    pages.flatMap((page) => page.trailingTextSections)
      .filter((fragment) => fragment.sectionId === "natural")
      .flatMap((fragment) => fragment.lines),
    naturalLines,
  );
  assert.deepEqual(
    pages.flatMap((page) => page.trailingTextSections).map((fragment) => fragment.continued),
    [false, true, true, false, true],
  );
  assert.ok(pages.every((page) => page.usedHeight <= 26));
  assert.deepEqual(pages.map((page) => page.breakReason), [
    "capacity", "capacity", "capacity", "capacity", "end",
  ]);
});

for (const translationKind of ["literal", "natural"] as const) {
  test(`long ${translationKind} translation uses the generic safe line splitter`, () => {
    const sourceLines = Array.from({ length: 31 }, (_, index) => `${translationKind}-${index + 1}`);
    const pages = appendTrailingTextPages([], sourceLines, {
      pageCapacity: 64,
      lineHeight: 8,
      blockChromeHeight: 16,
      gapAfterContent: 10,
      minimumFirstFragmentLines: 2,
    });
    assert.ok(pages.length > 1);
    assert.deepEqual(
      pages.flatMap((page) => page.trailingText?.lines ?? []),
      sourceLines,
    );
    assert.ok(pages.every((page) => page.usedHeight <= 64));
  });
}
