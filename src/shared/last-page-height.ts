export const PDF_POINTS_PER_INCH = 72;
export const LAST_PAGE_BOTTOM_PADDING_MM = 4;
export const LAST_PAGE_BOTTOM_PADDING_POINTS =
  (PDF_POINTS_PER_INCH * LAST_PAGE_BOTTOM_PADDING_MM) / 25.4;
export const LAST_PAGE_MIN_SAVINGS_POINTS = 36;

export type LastPageTrim = {
  bottomTrimPoints: number;
  newHeightPoints: number;
};

export function calculateLastPageTrim(
  pageHeightPoints: number,
  contentBottomPixels: number,
  viewportHeightPixels: number,
  viewportScale: number
): LastPageTrim | null {
  if (
    !Number.isFinite(pageHeightPoints) ||
    !Number.isFinite(contentBottomPixels) ||
    !Number.isFinite(viewportHeightPixels) ||
    !Number.isFinite(viewportScale) ||
    pageHeightPoints <= 0 ||
    viewportHeightPixels <= 0 ||
    viewportScale <= 0 ||
    contentBottomPixels < 0 ||
    contentBottomPixels > viewportHeightPixels
  ) {
    return null;
  }

  // Keep two raster rows in addition to the requested 4 mm. This covers
  // antialiasing at the detected edge when converting pixels back to points.
  const detectionSafetyPoints = 2 / viewportScale;
  const desiredHeightPoints = Math.min(
    pageHeightPoints,
    contentBottomPixels / viewportScale + LAST_PAGE_BOTTOM_PADDING_POINTS + detectionSafetyPoints
  );
  const bottomTrimPoints = pageHeightPoints - desiredHeightPoints;

  if (bottomTrimPoints < LAST_PAGE_MIN_SAVINGS_POINTS) return null;
  return {
    bottomTrimPoints,
    newHeightPoints: desiredHeightPoints
  };
}
