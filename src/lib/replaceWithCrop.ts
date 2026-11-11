import type { MediaItem } from "../ui/sortable-media-gallery";
import { dataUrlToFile } from "./dataUrlToFile";

/**
 * The media item a crop turns `item` into.
 *
 * A photo that was ALREADY SAVED cannot simply take the cropped file: the
 * save uploads only items that are not `isExisting` (uploadNewGalleryItems,
 * lib/productMediaUpload.ts) and passes saved ones through by id. Keeping the
 * old id and flag meant the crop showed in the modal, Save reported success,
 * and the stored photo never changed.
 *
 * So a crop of a saved photo REPLACES it: a new, unsaved item at the same
 * position. On save it is uploaded and slotted in where the old one was, and
 * the old id, no longer in the list, is deleted. Its focal point goes with
 * it, since a point picked on the old framing means nothing on the new one.
 *
 * A photo not yet saved just takes the new file, keeping its id.
 */
export function replaceWithCrop(item: MediaItem, base64: string): MediaItem {
  const file = dataUrlToFile(base64, `photo-${Date.now()}`);
  if (item.isExisting) {
    return { id: crypto.randomUUID(), type: "image", preview: base64, file, focal: null };
  }
  return { ...item, preview: base64, file };
}
