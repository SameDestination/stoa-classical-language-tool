/**
 * Shared measure for scholarly prose that follows the interlinear token flow.
 *
 * Notes and translations follow the actual publication measure. This is
 * especially important on A3 and custom paper: an editor-selected wide page
 * must not retain the old screen-oriented 680 px cap. Preview, vector PDF,
 * and the raster-PDF fallback all use this exact content measure.
 */
export const TRAILING_TEXT_HORIZONTAL_PADDING_PX = 44;

export const resolveTrailingTextMeasurePx = (usableWidthPx: number): number => {
  const finiteWidth = Number.isFinite(usableWidthPx) ? usableWidthPx : 1;
  return Math.max(1, finiteWidth - TRAILING_TEXT_HORIZONTAL_PADDING_PX);
};
