"use client";

/**
 * The avatar the package draws when the consuming app doesn't inject a
 * `UserAvatar` via ProductManagementConfig, and the one the read-only seller
 * banner always uses.
 *
 * It follows Cobuntu's avatar library, the same chain the community app's
 * UserAvatar walks: the person's own photo, then the library avatar they were
 * given (`/api/avatars/auto/<userId>.svg`, or `/tag/<usertag>.svg` when only
 * the tag is known), then the neutral brand avatar. Each picture that fails to
 * load (an expired photo link, an id that is not a person's and answers 404)
 * moves on to the next. Only when even the neutral avatar fails (offline) does
 * the initial show, so a circle never goes empty.
 */

import * as React from "react";

interface FallbackProps {
    user: {
        name?: string | null;
        imageUrl?: string | null;
        profileImage?: string | null;
        usertag?: string | null;
        email?: string | null;
        id?: string | null;
    };
    className?: string;
}

/** The API draws every library avatar; the package never draws one itself. */
const AVATAR_ORIGIN = "https://api.cobuntu.com";
const NEUTRAL_AVATAR = `${AVATAR_ORIGIN}/api/avatars/cobuntu-campfire.svg`;

/** The pictures to try, in order, without repeats. */
export function avatarCandidates(user: FallbackProps["user"]): string[] {
    const own = user.imageUrl ?? user.profileImage ?? null;
    const given = user.id
        ? `${AVATAR_ORIGIN}/api/avatars/auto/${encodeURIComponent(user.id)}.svg`
        : user.usertag
            ? `${AVATAR_ORIGIN}/api/avatars/tag/${encodeURIComponent(user.usertag)}.svg`
            : null;
    return [own, given, NEUTRAL_AVATAR].filter(
        (url, i, all): url is string => !!url && all.indexOf(url) === i,
    );
}

function pickInitial(u: FallbackProps["user"]): string {
    const src = u.name ?? u.usertag ?? u.email ?? u.id ?? "";
    const trimmed = src.trim();
    if (!trimmed) return "?";
    return trimmed[0]!.toUpperCase();
}

export function UserAvatarFallback({ user, className = "h-10 w-10" }: FallbackProps): React.ReactElement {
    const candidates = avatarCandidates(user);
    const [failed, setFailed] = React.useState<string[]>([]);
    const current = candidates.find((url) => !failed.includes(url)) ?? null;

    if (current) {
        return (
            <img
                src={current}
                alt={user.name ?? ""}
                className={`shrink-0 rounded-full object-cover ${className}`}
                onError={() => setFailed((f) => (f.includes(current) ? f : [...f, current]))}
            />
        );
    }
    return (
        <div
            className={`shrink-0 rounded-full bg-zinc-200 text-zinc-600 flex items-center justify-center text-sm font-medium ${className}`}
            aria-label={user.name ?? undefined}
        >
            {pickInitial(user)}
        </div>
    );
}
