"use client";

import * as React from "react";
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, useSortable, rectSortingStrategy, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Upload, X, Video, Crosshair } from "lucide-react";
import { BannerCropModal, type BannerCropResult } from "./banner-crop-modal";
import { dataUrlToFile } from "../lib/dataUrlToFile";
import { FocalPointModal, type FocalPoint } from "./focal-point-modal";
import { COVER_SIZE_HINT } from "../lib/coverFormat";

export interface MediaItem {
  id: string;
  file?: File;
  preview: string;
  type: "image" | "video";
  isExisting?: boolean;
  url?: string;
  /**
   * Where the subject of this image is, as percentages of its own width and
   * height. Null means the middle, which is what every card crop assumed
   * before a seller reported a photo losing its head to that assumption.
   */
  focal?: FocalPoint | null;
}

interface SortableMediaGalleryProps {
  items: MediaItem[];
  onChange: (items: MediaItem[]) => void;
  maxItems?: number;
}

// Shared tile sizing: a fixed-width tile on the mobile horizontal strip, and
// auto (fills the grid cell) on the desktop grid. 4:3 is the cover's shape on
// every card (see lib/coverFormat), so a cover made at the recommended size
// fills its tile exactly and anything else shows its letterboxing here, before
// a buyer's card trims it.
const TILE = "shrink-0 w-[128px] sm:w-auto aspect-[4/3]";

/** A filled media tile — draggable, croppable, removable. The first tile
 *  carries a "Cover" badge (it's the card thumbnail). */
function FilledTile({
  item, isCover, onRemove, onFilledClick, onSetFocus,
}: {
  item: MediaItem;
  isCover: boolean;
  onRemove: () => void;
  onFilledClick: () => void;
  onSetFocus: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    borderColor: "color-mix(in srgb, currentColor 12%, transparent)",
  };
  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`relative ${TILE} rounded-xl border overflow-hidden ${isDragging ? "z-10 scale-[1.02]" : ""}`}
    >
      <div
        {...attributes}
        {...listeners}
        onClick={() => { if (!isDragging && item.type === "image") onFilledClick(); }}
        className={`w-full h-full ${item.type === "image" ? "cursor-pointer" : "cursor-grab active:cursor-grabbing"}`}
        title={item.type === "image" ? "Click to crop · drag to reorder" : "Drag to reorder"}
      >
        {item.type === "video" ? (
          <div className="w-full h-full flex items-center justify-center" style={{ background: "color-mix(in srgb, currentColor 8%, transparent)" }}>
            <Video className="h-8 w-8 opacity-50 pointer-events-none" />
          </div>
        ) : (
          /*
           * CONTAIN, not cover.
           *
           * The tiles share one shape so the strip stays a tidy grid, and `cover`
           * filled it by trimming whatever did not fit. On a photo that is
           * harmless. On the slides and diagrams people put in a course it cut
           * the title off the top and the edges off the sides, so the tiles
           * showed fragments and the seller could not tell which slide was
           * which, or which one was the cover.
           *
           * It also misreported the stored file. Nothing here crops on upload
           * — the full image is what was saved and what the product page shows
           * — so a trimmed tile said an edit had happened that had not. A
           * seller reported her course images as "just cropped" on the
           * strength of this preview alone.
           *
           * The muted ground is what makes the letterboxing read as the tile's
           * shape rather than as a gap. Cropping is still one click away, which
           * the tile's own title says.
           */
          <div className="w-full h-full flex items-center justify-center" style={{ background: "color-mix(in srgb, currentColor 6%, transparent)" }}>
            <img
              src={item.preview || item.url}
              alt=""
              draggable={false}
              className="max-w-full max-h-full object-contain pointer-events-none"
              /* Contained here, so the point changes nothing on this tile —
                 the tile's job is to show the whole file. The point is for the
                 CARD, previewed inside the focus dialog. */
            />
          </div>
        )}
      </div>

      {isCover && (
        <div className="absolute top-1.5 left-1.5 bg-black/70 text-white text-[10px] font-semibold px-2 py-0.5 rounded-md pointer-events-none">
          Cover
        </div>
      )}

      {/*
        * Setting the focus is its own control, not another meaning for the
        * tile. The tile already opens the crop; a press that did two
        * different things depending on where it landed is how the crop tool
        * and this one would get confused for each other.
        */}
      {item.type === "image" && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onSetFocus(); }}
          aria-label="Choose what the card shows"
          title="Choose what the card shows"
          className="absolute bottom-1.5 left-1.5 grid h-7 w-7 place-items-center rounded-full border-none bg-black/60 text-white opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100 cursor-pointer hover:bg-black/75"
        >
          <Crosshair className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      )}

      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onRemove(); }}
        className="absolute top-1.5 right-1.5 h-6 w-6 rounded-full bg-black/60 hover:bg-red-600 text-white flex items-center justify-center cursor-pointer transition-colors"
        title="Remove"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

/**
 * The one place photos are added: a full-width drag-and-drop section that
 * also opens the picker on a click (shown until the cap is reached).
 *
 * It replaced an "add" tile at the end of the grid. Asked for by a course
 * seller who designs covers elsewhere and has the folder open behind the
 * browser: a fifth-of-a-row tile read as a button, not as somewhere to drop
 * files, so nobody tried. A section the width of the gallery does. It is
 * still one add affordance, not a tile plus a section offering the same thing
 * twice.
 */
function DropSection({
  count, max, dragging, onClick,
}: { count: number; max: number; dragging: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-dragging={dragging || undefined}
      className="w-full rounded-xl border-2 border-dashed flex flex-col items-center justify-center gap-1.5 px-4 py-6 text-center cursor-pointer transition-colors"
      style={{
        borderColor: dragging
          ? "var(--brand-color, #18181b)"
          : "color-mix(in srgb, currentColor 18%, transparent)",
        background: dragging
          ? "color-mix(in srgb, var(--brand-color, #71717a) 8%, transparent)"
          : "color-mix(in srgb, currentColor 4%, transparent)",
      }}
    >
      <span className="h-8 w-8 rounded-full flex items-center justify-center" style={{ background: "color-mix(in srgb, var(--brand-color, #71717a) 18%, transparent)", color: "var(--brand-color, #52525b)" }}>
        <Upload className="h-4 w-4" />
      </span>
      <span className="text-[13px] font-medium opacity-90">
        {dragging ? "Drop to add" : "Drag photos here or click to choose"}
      </span>
      <span className="text-[11px] opacity-55">
        Best at {COVER_SIZE_HINT} · {count}/{max}
      </span>
    </button>
  );
}

export function SortableMediaGallery({ items, onChange, maxItems = 5 }: SortableMediaGalleryProps) {
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);
  const [cropOpen, setCropOpen] = React.useState(false);
  /** Which image is having its card focus set, if any. */
  const [focusIndex, setFocusIndex] = React.useState<number | null>(null);
  const [cropIndex, setCropIndex] = React.useState<number | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const filled = React.useMemo(() => items.slice(0, maxItems), [items, maxItems]);
  const filledCount = filled.length;
  const sortableIds = React.useMemo(() => filled.map((it) => it.id), [filled]);

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = items.findIndex((it) => it.id === active.id);
    const newIndex = items.findIndex((it) => it.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    onChange(arrayMove(items, oldIndex, newIndex));
  }

  /*
   * One path for new files, whatever chose them: the picker and a drop both
   * land here so the cap and the image/video split cannot drift apart.
   */
  function addFiles(files: File[]) {
    // A drop can carry anything (a PDF, a folder). The picker's `accept`
    // already limits it to these two, so this only ever filters drops.
    const media = files.filter((f) => f.type.startsWith("image/") || f.type.startsWith("video/"));
    const remaining = maxItems - filledCount;
    if (remaining <= 0 || media.length === 0) return;
    const toAdd = media.slice(0, remaining);
    const newItems: MediaItem[] = toAdd.map(file => ({
      id: crypto.randomUUID(),
      file,
      preview: URL.createObjectURL(file),
      type: file.type.startsWith("video/") ? "video" : "image",
    }));
    onChange([...items, ...newItems]);
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    if (fileInputRef.current) fileInputRef.current.value = "";
    addFiles(files);
  }

  /*
   * The whole gallery accepts a drop, not only the section: a file let go
   * over the tiles is aimed at this gallery just the same. Reordering is
   * dnd-kit on POINTER events, so it never sees these HTML drag events and
   * the two cannot be confused.
   *
   * dragOver must preventDefault or the browser opens the dropped file in the
   * tab and the unsaved changes go with it. That holds at the cap too, which
   * is why the full case refuses the drop (dropEffect "none") rather than
   * skipping preventDefault: there is nothing to add into, and saying "Drop
   * to add" over a full gallery would be a promise this cannot keep.
   */
  const [dragging, setDragging] = React.useState(false);
  const canAdd = filledCount < maxItems;
  const dropHandlers = {
    onDragOver: (e: React.DragEvent) => {
      e.preventDefault();
      if (!canAdd) {
        if (e.dataTransfer) e.dataTransfer.dropEffect = "none";
        return;
      }
      setDragging(true);
    },
    // Moving onto one of the gallery's own children is not leaving it;
    // without this check the highlight flickers across every tile.
    onDragLeave: (e: React.DragEvent) => {
      if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false);
    },
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      addFiles(Array.from(e.dataTransfer?.files || []));
    },
  };

  function handleRemove(index: number) {
    if (index >= filledCount) return;
    const updated = [...items];
    const removed = updated.splice(index, 1)[0];
    if (removed && !removed.isExisting && removed.preview?.startsWith("blob:")) {
      URL.revokeObjectURL(removed.preview);
    }
    onChange(updated);
  }

  function handleFilledClick(index: number) {
    const it = items[index];
    if (!it || it.type !== "image") return;
    setCropIndex(index);
    setCropOpen(true);
  }

  function handleCropSave(result: BannerCropResult) {
    if (cropIndex === null || !result.base64) return;
    const updated = [...items];
    if (!updated[cropIndex]) return;
    /*
     * Replace the FILE as well as the preview. Updating only `preview` left
     * the item carrying its pre-crop file (or, for a photo added through the
     * cropper, none at all) — so the upload sent something different from
     * what the seller was looking at, or nothing.
     */
    updated[cropIndex] = {
      ...updated[cropIndex],
      preview: result.base64,
      file: dataUrlToFile(result.base64, `photo-${Date.now()}`),
    };
    onChange(updated);
  }

  return (
    <div>
      {/*
        * The drop target wraps the gallery only, NOT the two dialogs below.
        * They portal out visually, but React events still bubble through the
        * component tree: with the dialogs inside, an image dropped on the crop
        * dialog would replace the photo being cropped AND land here as a new
        * gallery item.
        */}
      <div className="space-y-2" {...dropHandlers}>
        {/* Horizontal thumbnail strip on mobile; the desktop 5-up grid is kept.
            Only real photos render — no wall of empty dashed slots. Adding is
            the drop section below. */}
        {filledCount > 0 && (
          <div className="flex gap-2.5 overflow-x-auto pb-1 sm:grid sm:grid-cols-5 sm:overflow-visible sm:pb-0">
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={sortableIds} strategy={rectSortingStrategy}>
                {filled.map((item, i) => (
                  <FilledTile
                    key={item.id}
                    item={item}
                    isCover={i === 0}
                    onRemove={() => handleRemove(i)}
                    onFilledClick={() => handleFilledClick(i)}
                    onSetFocus={() => setFocusIndex(i)}
                  />
                ))}
              </SortableContext>
            </DndContext>
          </div>
        )}

        {canAdd && (
          <DropSection
            count={filledCount}
            max={maxItems}
            dragging={dragging}
            onClick={() => fileInputRef.current?.click()}
          />
        )}

        <input ref={fileInputRef} type="file" accept="image/*,video/*" multiple className="hidden" onChange={handleFileSelect} />

        <p className="text-[11px] text-zinc-400">
          {filledCount === 0
            ? `Add up to ${maxItems} photos · the first is the cover`
            : canAdd
              ? "First photo is the cover · drag to reorder"
              : `${filledCount}/${maxItems} · remove one to add another · drag to reorder`}
        </p>
      </div>

      {/* The focus dialog, which previews the CARD rather than the file. */}
      {focusIndex !== null && items[focusIndex] && (
        <FocalPointModal
          src={items[focusIndex].preview || items[focusIndex].url || ""}
          value={items[focusIndex].focal ?? null}
          onClose={() => setFocusIndex(null)}
          onSave={(focal) => {
            const updated = [...items];
            updated[focusIndex] = { ...updated[focusIndex], focal };
            onChange(updated);
          }}
        />
      )}

      <BannerCropModal
        open={cropOpen}
        onOpenChange={setCropOpen}
        initialImageSrc={cropIndex !== null && items[cropIndex] ? items[cropIndex].preview || items[cropIndex].url || null : null}
        onSave={handleCropSave}
        title="Crop Image"
        hideStockPhotos
      />
    </div>
  );
}
