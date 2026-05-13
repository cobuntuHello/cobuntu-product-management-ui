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

interface SlotProps {
  slotId: string;
  index: number;
  item: MediaItem | null;
  onRemove: () => void;
  onEmptyClick: () => void;
  onFilledClick: () => void;
}

function Slot({ slotId, index, item, onRemove, onEmptyClick, onFilledClick }: SlotProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: slotId, disabled: !item });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  if (!item) {
    return (
      <div
        ref={setNodeRef}
        style={style}
        onClick={onEmptyClick}
        className="relative aspect-square rounded-lg border-2 border-dashed border-zinc-200 bg-zinc-50/50 hover:border-zinc-300 hover:bg-zinc-50 flex flex-col items-center justify-center cursor-pointer transition-colors"
      >
        <Upload className="h-5 w-5 text-zinc-400 mb-1" />
        <p className="text-[11px] font-medium text-zinc-400">Media {index + 1}</p>
        <p className="text-[10px] text-zinc-400 mt-0.5">Click to add</p>
      </div>
    );
  }

  return (
    <div
      ref={setNodeRef}
      style={{ ...style, opacity: isDragging ? 0.5 : 1 }}
      className={`relative aspect-square rounded-lg border border-zinc-200 bg-zinc-50 overflow-hidden ${isDragging ? "z-10 scale-[1.02]" : ""}`}
    >
      <div
        {...attributes}
        {...listeners}
        onClick={() => { if (!isDragging && item.type === "image") onFilledClick(); }}
        className={`w-full h-full ${item.type === "image" ? "cursor-pointer" : "cursor-grab active:cursor-grabbing"}`}
        title={item.type === "image" ? "Click to crop · drag to reorder" : "Drag to reorder"}
      >
        {item.type === "video" ? (
          <div className="w-full h-full flex items-center justify-center bg-zinc-100">
            <Video className="h-8 w-8 text-zinc-400 pointer-events-none" />
          </div>
        ) : (
          <img src={item.preview || item.url} alt="" draggable={false} className="w-full h-full object-cover pointer-events-none" />
        )}
      </div>

      <div className="absolute top-1.5 left-1.5 bg-black/60 text-white text-[10px] font-semibold px-1.5 py-0.5 rounded pointer-events-none">
        {index + 1}
      </div>

      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onRemove(); }}
        className="absolute top-1.5 right-1.5 h-6 w-6 rounded bg-black/60 hover:bg-red-600 text-white flex items-center justify-center cursor-pointer transition-colors"
        title="Remove"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

export function SortableMediaGallery({ items, onChange, maxItems = 5 }: SortableMediaGalleryProps) {
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);
  const [cropOpen, setCropOpen] = React.useState(false);
  const [cropIndex, setCropIndex] = React.useState<number | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const slots: (MediaItem | null)[] = React.useMemo(() => {
    const padded: (MediaItem | null)[] = Array(maxItems).fill(null);
    items.slice(0, maxItems).forEach((it, i) => { padded[i] = it; });
    return padded;
  }, [items, maxItems]);

  const filledCount = items.length;

  const slotIds = React.useMemo(
    () => slots.map((it, i) => (it ? it.id : `__empty-${i}`)),
    [slots]
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldSlotIndex = slotIds.findIndex(id => id === active.id);
    const newSlotIndex = slotIds.findIndex(id => id === over.id);
    if (oldSlotIndex === -1 || newSlotIndex === -1) return;
    const reordered = arrayMove(slots, oldSlotIndex, newSlotIndex);
    onChange(reordered.filter((it): it is MediaItem => !!it));
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
      <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={slotIds} strategy={rectSortingStrategy}>
            {slots.map((item, i) => (
              <Slot
                key={slotIds[i]}
                slotId={slotIds[i]}
                index={i}
                item={item}
                onRemove={() => handleRemove(i)}
                onEmptyClick={() => fileInputRef.current?.click()}
                onFilledClick={() => handleFilledClick(i)}
              />
            ))}
          </SortableContext>
        </DndContext>
      </div>

      <input ref={fileInputRef} type="file" accept="image/*,video/*" multiple className="hidden" onChange={handleFileSelect} />

      <p className="text-[11px] text-zinc-400">
        {filledCount}/{maxItems} items · First image is used as the card thumbnail · Drag to reorder
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
