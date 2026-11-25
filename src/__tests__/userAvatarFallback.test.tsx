/**
 * The package's own avatar walks Cobuntu's avatar library, the same chain as
 * the community app's UserAvatar: the person's photo, the library avatar they
 * were given, the neutral campfire, and only then an initial.
 */
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { UserAvatarFallback, avatarCandidates } from "../ui/user-avatar-fallback";

const API = "https://api.cobuntu.com/api/avatars";

describe("avatarCandidates", () => {
    it("tries the photo, then the given library avatar by id, then the campfire", () => {
        expect(avatarCandidates({ id: "u1", profileImage: "https://img/x.jpg" })).toEqual([
            "https://img/x.jpg", `${API}/auto/u1.svg`, `${API}/cobuntu-campfire.svg`,
        ]);
    });
    it("falls back to the usertag avatar when there is no id", () => {
        expect(avatarCandidates({ usertag: "thiago" })).toEqual([`${API}/tag/thiago.svg`, `${API}/cobuntu-campfire.svg`]);
    });
    it("still offers the campfire for a person it knows nothing about", () => {
        expect(avatarCandidates({ name: "Nina" })).toEqual([`${API}/cobuntu-campfire.svg`]);
    });
});

describe("UserAvatarFallback", () => {
    it("moves to the next picture when one fails to load, and shows the initial last", () => {
        const { container } = render(<UserAvatarFallback user={{ id: "u1", name: "Thiago Vieira", profileImage: "https://img/broken.jpg" }} />);
        const img = () => container.querySelector("img");
        expect(img()?.getAttribute("src")).toBe("https://img/broken.jpg");
        fireEvent.error(img()!);
        expect(img()?.getAttribute("src")).toBe(`${API}/auto/u1.svg`);
        fireEvent.error(img()!);
        expect(img()?.getAttribute("src")).toBe(`${API}/cobuntu-campfire.svg`);
        fireEvent.error(img()!);
        expect(img()).toBeNull();
        expect(screen.getByText("T")).toBeTruthy();
    });
});
