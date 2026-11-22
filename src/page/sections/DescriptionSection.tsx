"use client";

import { useEffect, useRef, useState } from "react";
import { AutosaveStatus, useAutosave } from "@cobuntu/management-ui-shared";
import { MarkdownEditor } from "../../ui/markdown-editor";
import { useProductManagementConfig, useJsonHeaders } from "../../config";
import { useCanEdit } from "../../lib/manageAccess";

/**
 * The product's description, edited where it is read. Courses render this
 * too: the course manage page is the product manage page plus a Syllabus tab.
 *
 * ── Why this is not a row like the others ──────────────────────────────────
 *
 * It used to be one: a single truncated line that opened a modal. Client
 * feedback on the event version of this page, and it applies identically here
 * — the other fields are a name, a price, a category, things you take in at a
 * glance, so a compact row shows them completely. A description is paragraphs.
 * Truncated to one line it shows almost nothing, so the row was a permanent
 * instruction to click, and the modal made reading it a separate act from
 * reading the rest of the page.
 *
 * So the short fields keep their rows, and the one long field gets the space a
 * long field needs.
 *
 * ── Why there is no Save button ────────────────────────────────────────────
 *
 * There was one, alone beside the heading, enabled once the text differed. It
 * made saving a step to remember on a field that is written in place, and an
 * edit left without pressing it was lost on the next tab or page. The
 * description now saves itself (useAutosave, shared with events): a pause in
 * typing or leaving the field saves it, and the small status beside the
 * counter says "Saving...", "Saved", or "Couldn't save." with Retry. A failed
 * save never touches the text.
 *
 * Images added with "Add image" are part of the text (a markdown line), so
 * they save the same way.
 */

interface Props {
    product: any;
    productId: string;
    onSaved: () => void;
}

export function DescriptionSection({ product, productId, onSaved }: Props) {
    const { apiBaseUrl } = useProductManagementConfig();
    const jsonHeaders = useJsonHeaders();
    /*
     * The package's own permission hook, not a prop. A carrying community's
     * leader can see a seller's product and must not rewrite it — the same
     * gate the rest of this view uses, so the two cannot disagree about who
     * may edit what. Read-only also means no saving and no status line.
     */
    const canEdit = useCanEdit();

    const saved: string = product?.description || "";
    const [content, setContent] = useState<string>(saved);

    /*
     * Re-seed when the SAVED value changes underneath us — after our own save,
     * or when the page refetches the product — but NEVER while there is
     * unsaved work, which would silently discard what someone is part-way
     * through typing.
     *
     * Comparing against what we last seeded from, rather than against a
     * "dirty" flag, is what makes that distinction reliable: it says "the user
     * has not touched this since it last matched the server", which is exactly
     * when adopting a new server value is safe.
     */
    const seededFrom = useRef(saved);
    useEffect(() => {
        if (seededFrom.current === saved) return;
        setContent((prev: string) => (prev === seededFrom.current ? saved : prev));
        seededFrom.current = saved;
    }, [saved]);

    /*
     * What would be stored is the TRIMMED text (empty = null), so that is what
     * the hook compares: a trailing space or newline is not a change worth a
     * request, and an untrimmed stored value must not look edited on open.
     */
    const autosave = useAutosave({
        value: content.trim(),
        saved: saved.trim(),
        enabled: canEdit,
        save: async (description, { keepalive }) => {
            const res = await fetch(`${apiBaseUrl}/api/users/me/products/${productId}`, {
                method: "PATCH",
                headers: jsonHeaders(),
                body: JSON.stringify({ description: description || null }),
                // Flushed on pagehide: without keepalive the browser cancels
                // the request along with the page.
                ...(keepalive ? { keepalive: true } : {}),
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.error || "Failed to update description");
            }
            onSaved();
        },
    });

    return (
        <div>
            <div className="mb-3 min-w-0">
                <h2 className="text-[15px] font-semibold text-zinc-900">Description</h2>
                <p className="text-[12px] text-zinc-400 mt-0.5">
                    What buyers read on the product page.
                </p>
            </div>

            {/*
              * Read-only is expressed by making the editor inert, not by
              * re-rendering the stored markdown ourselves. `inert` blocks
              * interaction and takes it out of the tab order in one attribute.
              */}
            <div
                {...(canEdit ? {} : { inert: "" as any, "aria-readonly": true })}
                style={canEdit ? undefined : { opacity: 0.75 }}
            >
                <MarkdownEditor
                    value={content}
                    onChange={setContent}
                    onBlur={autosave.flush}
                    placeholder={canEdit ? "Describe your product..." : ""}
                    status={canEdit ? <AutosaveStatus state={autosave.state} onRetry={autosave.retry} /> : undefined}
                />
            </div>
        </div>
    );
}
