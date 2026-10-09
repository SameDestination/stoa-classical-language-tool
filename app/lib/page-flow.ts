export type FlowLine<T> = {
  value: T;
  height: number;
  spacingBefore: number;
  /** Resolved inter-row gap. It is zero for the first row on a page. */
  gapBefore?: number;
  /** Optional semantic hints for bounded nearby break selection. */
  paragraphId?: string;
  keepWithNext?: boolean;
  forcePageBreakBefore?: boolean;
};

export type FlowPage<T> = {
  lines: FlowLine<T>[];
  usedHeight: number;
  remainingHeight?: number;
  breakReason?: "end" | "capacity" | "explicit" | "keep-with-next";
  preferredGap?: number;
  minimumGap?: number;
  maximumGap?: number;
};

export type FlexibleGapOptions = {
  smart?: boolean;
  minimumRatio?: number;
  maximumRatio?: number;
  /** Last pages compress only when needed and are never expanded. */
  stretchFinalPage?: boolean;
  nearbyBreakSearch?: number;
};

export const SMART_ROW_GAP_MINIMUM_RATIO = 0.72;
export const SMART_ROW_GAP_MAXIMUM_RATIO = 1.25;

export type TrailingTextFragment = {
  lines: string[];
  /** Zero-based offset of the first fragment line within its source section. */
  lineStart?: number;
  continued: boolean;
  startsAtPageTop: boolean;
};

export type DocumentFlowPage<T> = FlowPage<T> & {
  trailingText?: TrailingTextFragment;
};

export type TrailingTextSection = {
  id: string;
  lines: string[];
  lineHeight: number;
  blockChromeHeight: number;
  gapAfterContent: number;
  minimumFirstFragmentLines?: number;
};

export type TrailingTextSectionFragment = TrailingTextFragment & {
  sectionId: string;
};

export type MultiSectionDocumentFlowPage<T> = FlowPage<T> & {
  trailingTextSections: TrailingTextSectionFragment[];
};

export type AppendTrailingTextSectionsOptions = {
  pageCapacity: number;
};

export type ResolvedTranslationBlockPlan = {
  sectionId: string;
  lines: string[];
  yTopPx: number;
  continued: boolean;
  startsAtPageTop: boolean;
};

export type ResolvedNoteLinePlan = {
  noteId: string;
  tokenId: string | null;
  /** One-based publication number derived from note array order. */
  ordinal: number;
  text: string;
  /** True only for the first wrapped line of this note. */
  firstLine: boolean;
};

export type ResolvedNoteBlockPlan = {
  lines: ResolvedNoteLinePlan[];
  yTopPx: number;
  /** Zero-based offset into the flattened Notes section. */
  lineStart: number;
  continued: boolean;
  startsAtPageTop: boolean;
};

/** Browser-resolved, serializable page plan reused by vector PDF export.
 * Distances are CSS pixels and convert exactly at 96 px per inch. */
export type ResolvedInterlinearPagePlan = {
  pageIndex: number;
  tokenRows: Array<{
    tokenIds: string[];
    yTopPx: number;
    measuredHeightPx: number;
    gapBeforePx: number;
    paragraphSpacingBeforePx: number;
  }>;
  translationLines: string[];
  translationYTopPx: number | null;
  translationContinued: boolean;
  translationStartsAtPageTop: boolean;
  /** Ordered literal/natural blocks. Legacy singular fields above remain readable. */
  translationBlocks?: ResolvedTranslationBlockPlan[];
  /** Ordered scholarly-note fragments rendered before translations. */
  noteBlocks?: ResolvedNoteBlockPlan[];
  breakReason: FlowPage<unknown>["breakReason"];
  remainingBottomPx: number;
};

export type ResolvedInterlinearPaginationPlan = {
  unit: "css-px-96dpi";
  /** Compact fingerprint of every input that can affect pagination. */
  sourceKey?: string;
  /**
   * Exact translation sources used to build the browser line fragments.
   * The browser's measured lines are authoritative; this metadata lets the
   * vector renderer validate content and section order without rewrapping the
   * prose with a second font engine.
   */
  translationSources?: Array<{
    sectionId: string;
    text: string;
  }>;
  /** Exact ordered note sources used to validate a browser-resolved plan. */
  noteSources?: Array<{
    noteId: string;
    tokenId: string | null;
    text: string;
  }>;
  contentWidthPx?: number;
  contentHeightPx?: number;
  /** Explicit readable measure shared by Notes and translation prose. */
  trailingTextMeasurePx?: number;
  rowGapBounds: {
    minimumPx: number;
    preferredPx: number;
    maximumPx: number;
  };
  pages: ResolvedInterlinearPagePlan[];
};

const finiteNonNegative = (value: number) =>
  Number.isFinite(value) ? Math.max(0, value) : 0;

/**
 * Paginates measured lines while applying the standard page-boundary rule:
 * paragraph spacing is preserved within a page and collapses at the top of a
 * newly created physical page.
 */
export const paginateFlowLines = <T>(
  lines: FlowLine<T>[],
  pageCapacity: number,
  lineGap: number,
  options: FlexibleGapOptions = {},
): FlowPage<T>[] => {
  const capacity = Math.max(1, finiteNonNegative(pageCapacity));
  const preferredGap = finiteNonNegative(lineGap);
  const smart = options.smart === true;
  const minimumRatio = Number.isFinite(options.minimumRatio)
    ? Math.min(1, Math.max(0, options.minimumRatio as number))
    : SMART_ROW_GAP_MINIMUM_RATIO;
  const maximumRatio = Number.isFinite(options.maximumRatio)
    ? Math.max(1, options.maximumRatio as number)
    : SMART_ROW_GAP_MAXIMUM_RATIO;
  const minimumGap = smart ? preferredGap * minimumRatio : preferredGap;
  const maximumGap = smart ? preferredGap * maximumRatio : preferredGap;
  const searchWindow = Math.max(1, Math.min(4, Math.round(options.nearbyBreakSearch ?? 3)));
  const normalized = lines.map((sourceLine) => ({
    ...sourceLine,
    height: finiteNonNegative(sourceLine.height),
    spacingBefore: finiteNonNegative(sourceLine.spacingBefore),
    gapBefore: 0,
  }));
  const rawPages: Array<{ lines: FlowLine<T>[]; breakReason: FlowPage<T>["breakReason"] }> = [];
  let start = 0;

  while (start < normalized.length) {
    let end = start;
    let minimumUsed = 0;
    while (end < normalized.length) {
      const sourceLine = normalized[end];
      if (end > start && sourceLine.forcePageBreakBefore) break;
      const spacingBefore = end === start ? 0 : sourceLine.spacingBefore;
      const proposed = minimumUsed
        + (end > start ? minimumGap : 0)
        + spacingBefore
        + sourceLine.height;
      if (end > start && proposed > capacity + 0.000001) break;
      minimumUsed = proposed;
      end += 1;
      if (end === start + 1 && minimumUsed > capacity) break;
    }
    if (end === start) end = start + 1;

    // Score a bounded set of nearby safe breaks. Filling the page remains the
    // dominant objective, while heading and paragraph orphan penalties may
    // move a small number of rows to a better semantic boundary.
    const maximumEnd = end;
    const candidateStart = Math.max(start + 1, maximumEnd - searchWindow + 1);
    let selectedEnd = maximumEnd;
    let bestPenalty = Number.POSITIVE_INFINITY;
    for (let candidateEnd = candidateStart; candidateEnd <= maximumEnd; candidateEnd += 1) {
      const finalLine = normalized[candidateEnd - 1];
      const nextLine = normalized[candidateEnd];
      const movedSafeRows = maximumEnd - candidateEnd;
      const candidateLines = normalized.slice(start, candidateEnd);
      const fixedHeight = candidateLines.reduce((sum, line, index) =>
        sum + line.height + (index ? line.spacingBefore : 0), 0);
      const gapCount = Math.max(0, candidateLines.length - 1);
      const availableForGaps = Math.max(0, capacity - fixedHeight);
      const preferredTotal = preferredGap * gapCount;
      const resolvedTotal = Math.min(
        maximumGap * gapCount,
        Math.max(minimumGap * gapCount, availableForGaps),
      );
      const unusedBottom = Math.max(0, capacity - fixedHeight - resolvedTotal);
      const compression = Math.max(0, preferredTotal - resolvedTotal);
      const expansion = Math.max(0, resolvedTotal - preferredTotal);
      const pageScale = Math.max(1, capacity * capacity);
      let penalty = unusedBottom * unusedBottom
        + compression * compression * 2
        + expansion * expansion * 0.5
        + movedSafeRows * pageScale * 4;
      if (finalLine?.keepWithNext && nextLine) penalty += pageScale * 20;
      if (nextLine && finalLine?.paragraphId && finalLine.paragraphId === nextLine.paragraphId) {
        const tailCount = normalized.slice(start, candidateEnd)
          .filter((line) => line.paragraphId === finalLine.paragraphId).length;
        const headCount = normalized.slice(candidateEnd, Math.min(normalized.length, candidateEnd + 2))
          .filter((line) => line.paragraphId === finalLine.paragraphId).length;
        if (tailCount === 1 || headCount === 1) penalty += pageScale * 5;
      }
      if (candidateEnd === maximumEnd) penalty -= pageScale;
      if (penalty < bestPenalty) {
        bestPenalty = penalty;
        selectedEnd = candidateEnd;
      }
    }
    if (normalized[selectedEnd - 1]?.keepWithNext && selectedEnd < normalized.length && selectedEnd - start > 1) {
      selectedEnd -= 1;
    }

    const pageLines = normalized.slice(start, selectedEnd).map((line, index) => ({
      ...line,
      spacingBefore: index ? line.spacingBefore : 0,
      gapBefore: 0,
    }));
    const nextLine = normalized[selectedEnd];
    const breakReason: FlowPage<T>["breakReason"] = selectedEnd >= normalized.length
      ? "end"
      : nextLine?.forcePageBreakBefore
        ? "explicit"
        : selectedEnd < maximumEnd || pageLines.at(-1)?.keepWithNext
          ? "keep-with-next"
          : "capacity";
    rawPages.push({ lines: pageLines, breakReason });
    start = selectedEnd;
  }

  return rawPages.map((rawPage, pageIndex): FlowPage<T> => {
    const fixedHeight = rawPage.lines.reduce(
      (sum, line) => sum + line.height + line.spacingBefore,
      0,
    );
    const gapCount = Math.max(0, rawPage.lines.length - 1);
    const availableForGaps = Math.max(0, capacity - fixedHeight);
    const preferredTotal = preferredGap * gapCount;
    const minimumTotal = minimumGap * gapCount;
    const maximumTotal = maximumGap * gapCount;
    const isFinalPage = pageIndex === rawPages.length - 1;
    const resolvedTotal = !gapCount
      ? 0
      : !smart
        ? Math.min(preferredTotal, availableForGaps)
        : isFinalPage && options.stretchFinalPage !== true
          ? Math.min(preferredTotal, availableForGaps)
          : Math.min(maximumTotal, Math.max(minimumTotal, availableForGaps));
    const resolvedGap = gapCount ? Math.max(0, resolvedTotal / gapCount) : 0;
    const resolvedLines = rawPage.lines.map((line, index) => ({
      ...line,
      gapBefore: index ? resolvedGap : 0,
    }));
    const usedHeight = fixedHeight + resolvedGap * gapCount;
    return {
      lines: resolvedLines,
      usedHeight,
      remainingHeight: Math.max(0, capacity - usedHeight),
      breakReason: rawPage.breakReason,
      preferredGap,
      minimumGap,
      maximumGap,
    };
  });
};

const graphemes = (value: string) => {
  if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
    const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
    return Array.from(segmenter.segment(value), (part) => part.segment);
  }
  return Array.from(value);
};

const wordSegments = (value: string) => {
  if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
    const segmenter = new Intl.Segmenter(undefined, { granularity: "word" });
    return Array.from(segmenter.segment(value), (part) => part.segment);
  }
  return value.match(/\s+|\S+/gu) ?? [];
};

const breakOversizedSegment = (
  segment: string,
  maximumWidth: number,
  measure: (value: string) => number,
) => {
  const parts: string[] = [];
  let current = "";
  graphemes(segment).forEach((grapheme) => {
    const candidate = `${current}${grapheme}`;
    if (current && measure(candidate) > maximumWidth) {
      parts.push(current);
      current = grapheme;
    } else {
      current = candidate;
    }
  });
  if (current) parts.push(current);
  return parts;
};

/**
 * Greedy measured wrapping with explicit-newline preservation and a grapheme
 * fallback for long URLs, German compounds, and unspaced CJK text.
 */
export const wrapMeasuredText = (
  text: string,
  maximumWidth: number,
  measure: (value: string) => number,
): string[] => {
  if (!text) return [];
  const width = Math.max(1, finiteNonNegative(maximumWidth));
  const result: string[] = [];
  const hardLines = text.replace(/\r\n?|\u2028|\u2029/gu, "\n").split("\n");

  hardLines.forEach((hardLine) => {
    if (!hardLine) {
      result.push("");
      return;
    }

    let current = "";
    const flush = () => {
      result.push(current.trimEnd());
      current = "";
    };

    wordSegments(hardLine).forEach((segment) => {
      if (!segment) return;
      const candidate = `${current}${segment}`;
      if (!current || measure(candidate) <= width) {
        current = candidate;
        if (measure(current) <= width) return;
      } else {
        flush();
        current = segment.trimStart();
        if (!current) return;
        if (measure(current) <= width) return;
      }

      const oversized = breakOversizedSegment(current, width, measure);
      current = "";
      oversized.forEach((part, index) => {
        if (index < oversized.length - 1) result.push(part);
        else current = part;
      });
    });

    if (current || !result.length) flush();
  });

  return result;
};

export type AppendTrailingTextOptions = {
  pageCapacity: number;
  lineHeight: number;
  blockChromeHeight: number;
  gapAfterContent: number;
  minimumFirstFragmentLines?: number;
};

/**
 * Prefer a balanced split when greedily filling the current page would leave
 * an undersized continuation. The adjustment is deliberately local and
 * bounded: it never exceeds the page's measured line capacity, and it only
 * moves lines when both resulting fragments can retain the requested minimum.
 */
const balancedTrailingFragmentSize = (
  remainingLineCount: number,
  lineCapacity: number,
  minimumLines: number,
) => {
  const maximumFragmentLines = Math.min(lineCapacity, remainingLineCount);
  if (maximumFragmentLines >= remainingLineCount) return maximumFragmentLines;

  const continuationLines = remainingLineCount - maximumFragmentLines;
  if (continuationLines >= minimumLines) return maximumFragmentLines;

  const balancedFragmentLines = maximumFragmentLines
    - (minimumLines - continuationLines);
  return balancedFragmentLines >= minimumLines
    ? balancedFragmentLines
    : maximumFragmentLines;
};

const normalizeDocumentPageMetadata = <T, P extends FlowPage<T>>(
  pages: P[],
  capacity: number,
) => {
  const finalPageIndex = pages.length - 1;
  return pages.map((page, pageIndex) => ({
    ...page,
    breakReason: pageIndex === finalPageIndex
      ? "end" as const
      : page.breakReason === "explicit" || page.breakReason === "keep-with-next"
        ? page.breakReason
        : "capacity" as const,
    remainingHeight: Math.max(0, capacity - page.usedHeight),
  }));
};

/**
 * Appends measured trailing text sections in order. Multiple sections may
 * share a physical page, while each section retains its identity and fragment
 * continuation metadata. Section typography and spacing are measured
 * independently so Preview and export can consume the same resolved sequence.
 */
export const appendTrailingTextSections = <T>(
  basePages: FlowPage<T>[],
  sections: TrailingTextSection[],
  options: AppendTrailingTextSectionsOptions,
): MultiSectionDocumentFlowPage<T>[] => {
  const pages: MultiSectionDocumentFlowPage<T>[] = basePages.length
    ? basePages.map((page) => ({
        ...page,
        lines: page.lines.map((line) => ({ ...line })),
        trailingTextSections: [],
      }))
    : [{ lines: [], usedHeight: 0, trailingTextSections: [] }];
  const capacity = Math.max(1, finiteNonNegative(options.pageCapacity));

  sections.forEach((section) => {
    if (!section.lines.length) return;

    const lineHeight = Math.max(1, finiteNonNegative(section.lineHeight));
    const chrome = finiteNonNegative(section.blockChromeHeight);
    const contentGap = finiteNonNegative(section.gapAfterContent);
    const minimumLines = Math.max(
      1,
      Math.round(section.minimumFirstFragmentLines ?? 2),
    );
    const remaining = [...section.lines];
    let consumedLineCount = 0;
    let sectionStarted = false;

    while (remaining.length) {
      const page = pages.at(-1) as MultiSectionDocumentFlowPage<T>;
      const hasContent = page.lines.length > 0 || page.trailingTextSections.length > 0;
      const gap = hasContent ? contentGap : 0;
      const available = capacity - page.usedHeight - gap - chrome;
      const lineCapacity = Math.max(
        0,
        Math.floor((available + 0.000001) / lineHeight),
      );
      const required = remaining.length === 1 ? 1 : minimumLines;

      if (lineCapacity < required) {
        if (!hasContent && page.usedHeight === 0) {
          // If even a minimum fragment cannot fit on an empty custom page,
          // place as many measured lines as possible (at least one) so layout
          // always progresses. An intrinsically oversized block may overflow.
          const forcedLines = Math.max(1, lineCapacity);
          const fragmentLines = remaining.splice(0, forcedLines);
          page.trailingTextSections.push({
            sectionId: section.id,
            lines: fragmentLines,
            lineStart: consumedLineCount,
            continued: sectionStarted,
            startsAtPageTop: true,
          });
          consumedLineCount += fragmentLines.length;
          page.usedHeight = chrome + fragmentLines.length * lineHeight;
          sectionStarted = true;
          if (remaining.length) {
            pages.push({ lines: [], usedHeight: 0, trailingTextSections: [] });
          }
          continue;
        }
        pages.push({ lines: [], usedHeight: 0, trailingTextSections: [] });
        continue;
      }

      const fragmentLineCount = balancedTrailingFragmentSize(
        remaining.length,
        lineCapacity,
        minimumLines,
      );
      const fragmentLines = remaining.splice(0, fragmentLineCount);
      page.trailingTextSections.push({
        sectionId: section.id,
        lines: fragmentLines,
        lineStart: consumedLineCount,
        continued: sectionStarted,
        startsAtPageTop: !hasContent,
      });
      consumedLineCount += fragmentLines.length;
      page.usedHeight += gap + chrome + fragmentLines.length * lineHeight;
      sectionStarted = true;
      if (remaining.length) {
        pages.push({ lines: [], usedHeight: 0, trailingTextSections: [] });
      }
    }
  });

  return normalizeDocumentPageMetadata(pages, capacity);
};

/**
 * Appends a measured trailing section (the idiomatic translation) to existing
 * pages. It uses the remaining space on the final content page, then emits as
 * many true continuation pages as required.
 */
export const appendTrailingTextPages = <T>(
  basePages: FlowPage<T>[],
  textLines: string[],
  options: AppendTrailingTextOptions,
): DocumentFlowPage<T>[] => {
  const pages: DocumentFlowPage<T>[] = basePages.length
    ? basePages.map((page) => ({
        ...page,
        lines: page.lines.map((line) => ({ ...line })),
      }))
    : [{ lines: [], usedHeight: 0 }];
  if (!textLines.length) return pages;

  return appendTrailingTextSections(basePages, [{
    id: "translation",
    lines: textLines,
    lineHeight: options.lineHeight,
    blockChromeHeight: options.blockChromeHeight,
    gapAfterContent: options.gapAfterContent,
    minimumFirstFragmentLines: options.minimumFirstFragmentLines,
  }], {
    pageCapacity: options.pageCapacity,
  }).map(({ trailingTextSections, ...page }) => {
    const fragment = trailingTextSections[0];
    return {
      ...page,
      trailingText: fragment
        ? {
            lines: fragment.lines,
            continued: fragment.continued,
            startsAtPageTop: fragment.startsAtPageTop,
          }
        : undefined,
    };
  });
};
