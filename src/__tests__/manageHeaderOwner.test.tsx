/**
 * The manage header names the OWNER and the viewer's RELATIONSHIP to the
 * product or course (T-410), in place of "On sale in PBN · Digital product ·
 * EUR 275".
 *
 * Two halves are pinned:
 *
 *   1. The classification, one assertion per case the header words, read off
 *      the payload the apps' manage pages actually load: the detail reads send
 *      the owner as `creator` and the members as `sellers`, and drop
 *      `owner`/`ownerId`. A rule that reads only `ownerId` would call every
 *      seller a stranger, which is the failure these guard.
 *   2. The drawing: a community is a rounded square with its icon, a person a
 *      circle that walks Cobuntu's avatar library.
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ProductManageHeader } from "../page/ProductManageHeader";
import { ManageOwnerLine, ownerImageCandidates } from "../page/ManageOwnerLine";
import { productManageOwner, productManageRelationship } from "../page/manageOwner";

const FSC = { id: "c-fsc", name: "Finance Social Club", communityTag: "fsc", iconUrl: "https://cdn/fsc.png", isCommunity: true };
const maria = { id: "u-maria", name: "Maria Silva", usertag: "maria", profileImage: null, isCommunity: false };

/** A community-owned product as the community-scoped detail read sends it. */
function communityProduct(sellers: any[] = [], extra: any = {}) {
  return { communityId: FSC.id, creator: FSC, sellers, ...extra };
}

/** Maria's product, carried by FSC, as the same read sends it (no ownerId). */
function memberProduct(sellers: any[] = [{ userId: maria.id, role: "OWNER", user: maria }], extra: any = {}) {
  return { communityId: null, creator: maria, sellers, ...extra };
}

const leadsFsc = (tag: string) => tag === "fsc";
const leadsNothing = () => false;

describe("productManageOwner", () => {
  it("a community-owned item is owned by its community, with its icon", () => {
    expect(productManageOwner(communityProduct())).toEqual({
      kind: "community", id: FSC.id, name: FSC.name, communityTag: "fsc", iconUrl: FSC.iconUrl,
    });
  });

  it("a member's item is owned by its seller, read off `creator`", () => {
    expect(productManageOwner(memberProduct())).toEqual({
      kind: "person", id: maria.id, name: "Maria Silva", usertag: "maria", profileImage: null,
    });
  });

  it("reads `owner` and `community` on the reads that still carry them", () => {
    expect(productManageOwner({ communityId: null, ownerId: "u1", owner: { id: "u1", name: "Ana", profileImage: "https://img/a.jpg" } }))
      .toMatchObject({ kind: "person", id: "u1", name: "Ana", profileImage: "https://img/a.jpg" });
    expect(productManageOwner({ communityId: "c1", community: { id: "c1", name: "PBN", tagLower: "pbn", iconUrl: null } }))
      .toMatchObject({ kind: "community", name: "PBN", communityTag: "pbn", iconUrl: null });
  });

  it("says nothing rather than inventing an owner the payload does not name", () => {
    expect(productManageOwner({ communityId: "c1" })).toBeNull();
    expect(productManageOwner({ communityId: null })).toBeNull();
    expect(productManageOwner(null)).toBeNull();
  });
});

describe("productManageRelationship", () => {
  describe("a community-owned item", () => {
    it("a leader of the owning community manages it as a leader", () => {
      expect(productManageRelationship(communityProduct(), { viewerUserId: "u-lead", leads: leadsFsc, communityTag: "fsc" }))
        .toBe("leaderHosting");
    });

    it("even when that leader is also on the seller list", () => {
      const product = communityProduct([{ userId: "u-lead", role: "OWNER" }]);
      expect(productManageRelationship(product, { viewerUserId: "u-lead", leads: leadsFsc, communityTag: "fsc" }))
        .toBe("leaderHosting");
    });

    it("a member collaborator who leads nothing is a collaborator", () => {
      const product = communityProduct([{ userId: "u-co", role: "COLLABORATOR" }]);
      expect(productManageRelationship(product, { viewerUserId: "u-co", leads: leadsNothing, communityTag: "fsc" }))
        .toBe("collaborator");
    });

    it("a leader whose role cannot edit it is reviewing, not hosting", () => {
      const product = communityProduct([], { viewerCanEdit: false });
      expect(productManageRelationship(product, { viewerUserId: "u-lead", leads: leadsFsc, communityTag: "fsc" }))
        .toBe("leaderReviewing");
    });

    it("a leader of a community that only carries it is reviewing", () => {
      const product = communityProduct([], { viewerCanEdit: false });
      expect(productManageRelationship(product, { viewerUserId: "u-pbn", leads: (t) => t === "pbn", communityTag: "pbn" }))
        .toBe("leaderReviewing");
    });
  });

  describe("a member's item", () => {
    it("its seller owns it, with no ownerId on the payload", () => {
      expect(productManageRelationship(memberProduct(), { viewerUserId: maria.id, leads: leadsNothing, communityTag: "fsc" }))
        .toBe("owner");
    });

    it("its seller owns it even when they also lead the community", () => {
      expect(productManageRelationship(memberProduct(), { viewerUserId: maria.id, leads: leadsFsc, communityTag: "fsc" }))
        .toBe("owner");
    });

    it("trusts the backend's viewerIsOwner (the course read sends it)", () => {
      const course = { communityId: null, sellers: [], viewerIsOwner: true };
      expect(productManageRelationship(course, { viewerUserId: "u-x", communityTag: "fsc" })).toBe("owner");
    });

    it("another seller is a collaborator", () => {
      const product = memberProduct([
        { userId: maria.id, role: "OWNER", user: maria },
        { userId: "u-co", role: "COLLABORATOR" },
      ]);
      expect(productManageRelationship(product, { viewerUserId: "u-co", leads: leadsFsc, communityTag: "fsc" }))
        .toBe("collaborator");
    });

    it("reads `collaborators` as well as `sellers`", () => {
      const product = { communityId: null, ownerId: maria.id, owner: maria, collaborators: [{ userId: "u-co" }] };
      expect(productManageRelationship(product, { viewerUserId: "u-co", communityTag: "fsc" })).toBe("collaborator");
    });

    it("a leader of the carrying community is reviewing it", () => {
      expect(productManageRelationship(memberProduct(), { viewerUserId: "u-lead", leads: leadsFsc, communityTag: "fsc" }))
        .toBe("leaderReviewing");
    });
  });

  it("no relationship for staff or an unknown viewer, rather than a false one", () => {
    expect(productManageRelationship(memberProduct(), { viewerUserId: "u-staff", leads: leadsNothing, communityTag: "fsc" }))
      .toBeNull();
    expect(productManageRelationship(communityProduct(), { viewerUserId: "u-staff", leads: leadsNothing, communityTag: "fsc" }))
      .toBeNull();
    expect(productManageRelationship(memberProduct(), { viewerUserId: null, leads: leadsFsc, communityTag: "fsc" }))
      .toBeNull();
  });
});

describe("ManageOwnerLine", () => {
  it("draws a community as a rounded square with its icon and name", () => {
    const { container } = render(
      <ManageOwnerLine owner={productManageOwner(communityProduct())} relationship="You manage this as a community leader" />,
    );
    const mark = container.querySelector("img[data-owner-mark='community']")!;
    expect(mark.getAttribute("src")).toBe(FSC.iconUrl);
    expect(mark.className).toContain("rounded-[5px]");
    expect(screen.getByText("Finance Social Club")).toBeTruthy();
  });

  it("draws a person as a circle and walks the library when a picture fails", () => {
    const { container } = render(<ManageOwnerLine owner={productManageOwner(memberProduct())} relationship="You own this" />);
    const mark = () => container.querySelector("img[data-owner-mark='person']")!;
    expect(mark().className).toContain("rounded-full");
    expect(mark().getAttribute("src")).toBe("https://api.cobuntu.com/api/avatars/auto/u-maria.svg");
    fireEvent.error(mark());
    expect(mark().getAttribute("src")).toBe("https://api.cobuntu.com/api/avatars/cobuntu-campfire.svg");
    fireEvent.error(mark());
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("[data-owner-mark='person']")!.textContent).toBe("M");
  });

  it("a community with no icon shows its initial in the square", () => {
    const owner = productManageOwner({ communityId: "c1", creator: { isCommunity: true, id: "c1", name: "pbn", iconUrl: null } })!;
    expect(ownerImageCandidates(owner)).toEqual([]);
    const { container } = render(<ManageOwnerLine owner={owner} />);
    const mark = container.querySelector("[data-owner-mark='community']")!;
    expect(mark.textContent).toBe("P");
    expect(mark.className).toContain("rounded-[5px]");
  });

  it("renders nothing when there is neither an owner nor a relationship", () => {
    const { container } = render(<ManageOwnerLine owner={null} relationship={null} />);
    expect(container.querySelector("[data-testid='manage-owner-line']")).toBeNull();
  });
});

describe("ProductManageHeader", () => {
  it("puts the owner and relationship under the title, with no state, kind or price", () => {
    render(
      <ProductManageHeader
        breadcrumbs={[{ label: "Marketplace", onClick: vi.fn() }, { label: "Kiln course" }]}
        title="Kiln course"
        owner={productManageOwner(memberProduct())}
        relationship="You review this as a community leader (view only)"
        onBack={vi.fn()}
        backLabel="Back"
        onPreview={vi.fn()}
        previewLabel="Preview"
      />,
    );
    const line = screen.getByTestId("manage-owner-line");
    expect(line.textContent).toContain("Maria Silva");
    expect(line.textContent).toContain("You review this as a community leader (view only)");
    expect(document.body.textContent).not.toMatch(/On sale|Digital product|EUR/);
  });
});
