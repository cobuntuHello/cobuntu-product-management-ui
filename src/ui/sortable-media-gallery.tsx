"use client";

import * as React from "react";
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, useSortable, rectSortingStrategy, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Upload, X, Video } from "lucide-react";
import { BannerCropModal, type BannerCropResult } from "./banner-crop-modal";

export interface MediaItem {
  id: string;
  file?: File;
  preview: string;
  type: "image" | "video";
  isExisting?: boolean;
  url?: string;
}

interface SortableMediaGalleryProps {
  items: MediaItem[];
  onChange: (items: MediaItem[]) => void;
  maxItems?: number;
}

// Shared tile sizing: a fixed-width tile on the mobile horizontal strip, and
// auto (fills the grid cell) on the desktop grid.
const TILE = "shrink-0 w-[128px] sm:w-auto aspect-square";

/** A filled media tile — draggable, croppable, removable. The first tile
 *  carries a "Cover" badge (it's the card thumbnail). */
function FilledTile({
  item, isCover, onRemove, onFilledClick,
}: {
  item: MediaItem;
  isCover: boolean;
  onRemove: () => void;
  onFilledClick: () => void;
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
          <img src={item.preview || item.url} alt="" draggable={false} className="w-full h-full object-cover pointer-events-none" />
        )}
      </div>

      {isCover && (
        <div className="absolute top-1.5 left-1.5 bg-black/70 text-white text-[10px] font-semibold px-2 py-0.5 rounded-md pointer-events-none">
          Cover
        </div>
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

/** The single "add photos" tile at the end of the strip (shown until the cap
 *  is reached) — replaces the old wall of empty dashed slots. */
function AddTile({ count, max, onClick }: { count: number; max: number; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`${TILE} rounded-xl border-2 border-dashed flex flex-col items-center justify-center gap-1.5 cursor-pointer transition-colors`}
      style={{ borderColor: "color-mix(in srgb, currentColor 18%, transparent)", background: "color-mix(in srgb, currentColor 4%, transparent)" }}
    >
      <span className="h-9 w-9 rounded-full flex items-center justify-center" style={{ background: "color-mix(in srgb, var(--brand-color, #71717a) 18%, transparent)", color: "var(--brand-color, #52525b)" }}>
        <Upload className="h-4 w-4" />
      </span>
      <span className="text-[11.5px] font-medium opacity-80">Add photos</span>
      <span className="text-[10px] opacity-50">{count}/{max}</span>
    </button>
  );
}

export function SortableMediaGallery({ items, onChange, maxItems = 5 }: SortableMediaGalleryProps) {
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);
  const [cropOpen, setCropOpen] = React.useState(false);
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

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    if (fileInputRef.current) fileInputRef.current.value = "";
    const remaining = maxItems - filledCount;
    if (remaining <= 0) return;
    const toAdd = files.slice(0, remaining);
    const newItems: MediaItem[] = toAdd.map(file => ({
      id: crypto.randomUUID(),
      file,
      preview: URL.createObjectURL(file),
      type: file.type.startsWith("video/") ? "video" : "image",
    }));
    onChange([...items, ...newItems]);
  }

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
    updated[cropIndex] = { ...updated[cropIndex], preview: result.base64 };
    onChange(updated);
  }

  return (
    <div className="space-y-2">
      {/* Horizontal thumbnail strip on mobile; the desktop 5-up grid is kept.
          Only real photos + a single "add" tile render — no wall of empty
          dashed slots. */}
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
              />
            ))}
          </SortableContext>
        </DndContext>
        {filledCount < maxItems && (
          <AddTile count={filledCount} max={maxItems} onClick={() => fileInputRef.current?.click()} />
        )}
      </div>

      <input ref={fileInputRef} type="file" accept="image/*,video/*" multiple className="hidden" onChange={handleFileSelect} />

      <p className="text-[11px] text-zinc-400">
        {filledCount > 0
          ? `${filledCount}/${maxItems} · First photo is the cover · drag to reorder`
          : `Add up to ${maxItems} photos · the first is the cover`}
      </p>

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
