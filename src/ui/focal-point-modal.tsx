"use client";

import { useRef, useState } from "react";
import { ModalShell } from "./modal-shell";

/**
 * Choose what survives the card's crop.
 *
 * ── The problem this answers ───────────────────────────────────────────────
 *
 * Reported by a seller: "I crop them to be squares for the course description
 * but it would be good to manually crop what is shown in the Academy because
 * now one of the girls' head is cut off".
 *
 * Two surfaces disagree. The crop tool beside this one produces SQUARES, so
 * the stored file really is a square. The cards then cover-crop it into a
 * frame of a different shape, and a cover-crop takes its trim from the centre
 * outwards: a square losing its top and bottom loses the head.
 *
 * ── Why a point and not another crop ───────────────────────────────────────
 *
 * A second crop would mean a second stored image per surface, and the surfaces
 * are not fixed: the marketplace card is 4:3, the storefront course row is
 * 96x60. A point travels, so one answer covers every frame the image is ever
 * put in, including ones that do not exist yet.
 *
 * ── Why it shows the frame rather than the image ───────────────────────────
 *
 * The seller asked to crop "what is shown in the Academy", so that is what is
 * on screen: the card's own 4:3 window, cropping live as the point moves.
 * Picking a point on a full image and hoping would be the same guess that
 * caused the report.
 */

/** The marketplace card's frame — the one the report was about. */
const CARD_RATIO = 4 / 3;

export interface FocalPoint {
    /** Percentages of the image's own width and height. */
    x: number;
    y: number;
}

export function FocalPointModal({
    src,
    value,
    onSave,
    onClose,
}: {
    src: string;
    /** Null means the middle, which is what every crop did before. */
    value: FocalPoint | null;
    onSave: (point: FocalPoint) => void;
    onClose: () => void;
}) {
    const [point, setPoint] = useState<FocalPoint>(value ?? { x: 50, y: 50 });
    const frameRef = useRef<HTMLDivElement>(null);
    const dragging = useRef(false);

    /*
     * Read off the FRAME, not the image. The image is cover-cropped inside it,
     * so its own box is larger than what is visible and a position taken from
     * it would be off by the overflow.
     */
    const place = (clientX: number, clientY: number) => {
        const r = frameRef.current?.getBoundingClientRect();
        if (!r || r.width === 0 || r.height === 0) return;
        setPoint({
            x: Math.round(Math.min(100, Math.max(0, ((clientX - r.left) / r.width) * 100))),
            y: Math.round(Math.min(100, Math.max(0, ((clientY - r.top) / r.height) * 100))),
        });
    };

    return (
        <ModalShell onClose={onClose}>
            <h3 className="mb-1 text-[15px] font-semibold text-zinc-900">What the card shows</h3>
            <p className="mb-4 text-[12.5px] leading-snug text-zinc-500">
                Cards are wider than they are tall, so part of a square photo is always trimmed.
                Click the part that matters, usually a face, and the trim happens around it.
            </p>

            <div
                ref={frameRef}
                onPointerDown={(e) => {
                    dragging.current = true;
                    e.currentTarget.setPointerCapture(e.pointerId);
                    place(e.clientX, e.clientY);
                }}
                onPointerMove={(e) => { if (dragging.current) place(e.clientX, e.clientY); }}
                onPointerUp={() => { dragging.current = false; }}
                onPointerCancel={() => { dragging.current = false; }}
                className="relative w-full cursor-crosshair touch-none overflow-hidden rounded-xl bg-zinc-100"
                style={{ aspectRatio: String(CARD_RATIO) }}
                role="application"
                aria-label="Choose what the card shows"
            >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                    src={src}
                    alt=""
                    draggable={false}
                    className="h-full w-full select-none object-cover"
                    style={{ objectPosition: `${point.x}% ${point.y}%` }}
                />
                {/* The marker, drawn in both colours so it is visible on any
                    frame of any photo. */}
                <span
                    className="pointer-events-none absolute h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white"
                    style={{ left: `${point.x}%`, top: `${point.y}%`, boxShadow: "0 0 0 2px rgba(0,0,0,.45)" }}
                    aria-hidden="true"
                />
            </div>

            {/*
              * Keyboard, because a pointer is not the only way in and this is
              * the only control in the dialog. One percent a press, which is
              * about a pixel on a card and is the precision a face needs.
              */}
            <div className="mt-3 flex items-center justify-between">
                <span className="text-[11.5px] tabular-nums text-zinc-400">
                    {point.x}% · {point.y}%
                </span>
                <div
                    tabIndex={0}
                    role="group"
                    aria-label="Nudge with the arrow keys"
                    onKeyDown={(e) => {
                        const step = e.shiftKey ? 10 : 1;
                        const by = (dx: number, dy: number) => {
                            e.preventDefault();
                            setPoint((p) => ({
                                x: Math.min(100, Math.max(0, p.x + dx * step)),
                                y: Math.min(100, Math.max(0, p.y + dy * step)),
                            }));
                        };
                        if (e.key === "ArrowLeft") by(-1, 0);
                        if (e.key === "ArrowRight") by(1, 0);
                        if (e.key === "ArrowUp") by(0, -1);
                        if (e.key === "ArrowDown") by(0, 1);
                    }}
                    className="rounded-md px-2 py-1 text-[11.5px] text-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-300"
                >
                    Arrow keys to nudge
                </div>
            </div>

            <div className="mt-5 flex justify-end gap-2">
                <button
                    type="button"
                    onClick={() => setPoint({ x: 50, y: 50 })}
                    className="mr-auto cursor-pointer rounded-lg px-3 py-2 text-[13px] text-zinc-500 hover:bg-zinc-100"
                >
                    Re-centre
                </button>
                <button
                    type="button"
                    onClick={onClose}
                    className="cursor-pointer rounded-lg px-4 py-2 text-[13px] text-zinc-500 hover:bg-zinc-100"
                >
                    Cancel
                </button>
                <button
                    type="button"
                    onClick={() => { onSave(point); onClose(); }}
                    className="cursor-pointer rounded-lg bg-zinc-900 px-4 py-2 text-[13px] font-medium text-white hover:bg-zinc-800"
                >
                    Save
                </button>
            </div>
        </ModalShell>
    );
}
