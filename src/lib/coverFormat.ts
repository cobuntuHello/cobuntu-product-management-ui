/**
 * The one shape a product or course cover is shown in, on every surface.
 *
 * Reported by a course seller (2026-11-11): "it's very hard to design a course
 * cover in the right dimensions because there are different ways how it is
 * displayed". She was right. The manage page and this package's cropper framed
 * the cover as a square, the marketplace card and the product page showed it
 * at 4:3, the list row as a small square and the featured card at 21:9. A cover
 * designed for any one of them was trimmed on the others, so there was no size
 * she could design at.
 *
 * 4:3 won because it is what buyers already saw, on the grid card and at the
 * top of the product page. The community app's cards use the same ratio (as
 * literal `aspect-[4/3]` classes, which Tailwind needs spelled out).
 *
 * 1600 x 1200 is the size to design at: comfortably sharp on a retina card and
 * under the 2000px edge the cropper caps uploads at (MAX_IMAGE_EDGE in
 * @cobuntu/management-ui-shared), so a cover made at exactly this size is
 * uploaded untouched.
 */
export const COVER_ASPECT = 4 / 3;

export const COVER_SIZE = { width: 1600, height: 1200 } as const;

/** The size as sellers read it, used wherever the shape is explained. */
export const COVER_SIZE_HINT = `${COVER_SIZE.width} × ${COVER_SIZE.height} px (4:3)`;
