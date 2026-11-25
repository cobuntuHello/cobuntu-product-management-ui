"use client";

import * as React from "react";
import type { ManageOwner } from "./manageOwner";
import { avatarCandidates } from "../ui/user-avatar-fallback";

/**
 * The line under the manage page's title: the owner's mark and name, then the
 * viewer's relationship to it ("You manage this as a collaborator").
 *
 * Exported on its own as well as drawn by ProductManageHeader, because the
 * admin app keeps its own PageHeader and drops this into it. One component,
 * so the two apps cannot draw the owner two ways.
 *
 * The event package carries a twin of this file. The packages are siblings,
 * not dependencies of each other, and the line is small enough that a copy is
 * cheaper than a third package.
 */

/**
 * The pictures to try for the owner, in order, without repeats.
 *
 * A person follows Cobuntu's avatar library through the same avatarCandidates
 * the seller banner uses: their own photo, the library avatar they were given,
 * then the neutral campfire. A community has only its icon; a missing one
 * falls straight to its initial.
 */
export function ownerImageCandidates(owner: ManageOwner): string[] {
  if (owner.kind === "community") return owner.iconUrl ? [owner.iconUrl] : [];
  return avatarCandidates({ id: owner.id, usertag: owner.usertag, profileImage: owner.profileImage });
}

function OwnerMark({ owner }: { owner: ManageOwner }) {
  const candidates = ownerImageCandidates(owner);
  const [failed, setFailed] = React.useState<string[]>([]);
  const current = candidates.find((url) => !failed.includes(url)) ?? null;
  // The shape says which kind of owner it is before the name is read.
  const shape = owner.kind === "community" ? "rounded-[5px]" : "rounded-full";
  if (current) {
    return (
      <img
        src={current}
        alt=""
        data-owner-mark={owner.kind}
        className={`h-5 w-5 shrink-0 object-cover ring-1 ring-zinc-200 ${shape}`}
        onError={() => setFailed((f) => (f.includes(current) ? f : [...f, current]))}
      />
    );
  }
  // Only when every picture failed (offline, or a community with no icon).
  return (
    <span
      aria-hidden
      data-owner-mark={owner.kind}
      className={`h-5 w-5 shrink-0 inline-flex items-center justify-center bg-zinc-200 text-[10px] font-semibold text-zinc-600 ${shape}`}
    >
      {owner.name.trim()[0]?.toUpperCase() ?? "?"}
    </span>
  );
}

export interface ManageOwnerLineProps {
  owner?: ManageOwner | null;
  /** The viewer's relationship, already worded by the app. */
  relationship?: string | null;
  className?: string;
}

export function ManageOwnerLine({ owner, relationship, className = "" }: ManageOwnerLineProps) {
  if (!owner && !relationship) return null;
  return (
    <div data-testid="manage-owner-line" className={`mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm ${className}`}>
      {owner && (
        <span className="inline-flex min-w-0 items-center gap-1.5">
          <OwnerMark owner={owner} />
          <span className="truncate font-medium text-zinc-700">{owner.name}</span>
        </span>
      )}
      {owner && relationship && <span aria-hidden className="text-zinc-300">·</span>}
      {relationship && <span className="text-zinc-500">{relationship}</span>}
    </div>
  );
}
