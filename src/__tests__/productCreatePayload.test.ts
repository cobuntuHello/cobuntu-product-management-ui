/**
 * Tests — the create request, field by field.
 *
 * These are written against the BODY rather than against a rendered wizard,
 * because the bug class this builder exists to prevent is a field that is never
 * appended. That failure is invisible from the UI: the request succeeds, the
 * product appears, and the setting is simply absent. Only reading the payload
 * catches it, which is why the assertions here are mostly "this key is present
 * and says exactly this" rather than a happy-path smoke test.
 *
 * The pairs matter as much as the singles. `publish` and `requestListing` are
 * compared against string literals server-side, so sending a boolean would
 * publish everything — a test that only checks the true case would pass while
 * the false case shipped live products.
 */

import { describe, it, expect } from "vitest";
import {
    buildProductCreateFormData,
    type ProductCreatePayloadInput,
    type ResolvedAccess,
} from "../lib/productCreatePayload";
import type { ProductFormData } from "../components/ProductForm";
import { blankDonation } from "../components/ProductTiersAndDonations";

const OPEN: ResolvedAccess = { visibility: "PUBLIC", tierIds: [] };

function formData(over: Partial<ProductFormData> = {}): ProductFormData {
    return {
        name: "  Wheel throwing  ",
        description: "  Six weeks at the wheel.  ",
        tags: [],
        categoryId: null,
        subCategoryId: null,
        mediaItems: [],
        productFiles: [],
        links: [],
        isPaid: false,
        price: "",
        currency: "EUR",
        isRecurring: false,
        recurringInterval: "monthly",
        ctaText: "",
        viewability: "PUBLIC",
        accessibility: "PUBLIC",
        viewTierIds: [],
        buyTierIds: [],
        tiers: [],
        donation: blankDonation(),
        condition: null,
        parcelClass: null,
        ...over,
    } as ProductFormData;
}

function input(over: Partial<ProductCreatePayloadInput> = {}): ProductCreatePayloadInput {
    return {
        data: formData(),
        productType: "DIGITAL",
        communityTag: "pots",
        ownership: "personal",
        access: { view: OPEN, buy: OPEN },
        draft: { step: "details" },
        ...over,
    };
}

/** Every value for a key, so "appended twice" cannot hide behind `get`. */
const all = (fd: FormData, key: string) => fd.getAll(key);

describe("the fields that are always sent", () => {
    it("trims the name and description", () => {
        const fd = buildProductCreateFormData(input());
        expect(fd.get("name")).toBe("Wheel throwing");
        expect(fd.get("description")).toBe("Six weeks at the wheel.");
    });

    it("sends the chosen type, not a default", () => {
        // The reason this is a parameter at all: passing the surface's prop
        // instead of the choice made the type picker decorative.
        expect(buildProductCreateFormData(input({ productType: "COURSE" })).get("productType"))
            .toBe("COURSE");
        expect(buildProductCreateFormData(input({ productType: "PHYSICAL" })).get("productType"))
            .toBe("PHYSICAL");
    });

    it("always sends communityTag, because the backend routes member submissions on it", () => {
        expect(buildProductCreateFormData(input()).get("communityTag")).toBe("pots");
    });

    it("sends requiresApproval as a string on both sides", () => {
        expect(buildProductCreateFormData(input()).get("requiresApproval")).toBe("false");
        expect(
            buildProductCreateFormData(input({ data: formData({ requiresApproval: true }) }))
                .get("requiresApproval"),
        ).toBe("true");
    });
});

describe("price and tiers", () => {
    it("a free product sends price 0 and no currency", () => {
        const fd = buildProductCreateFormData(input());
        expect(fd.get("price")).toBe("0");
        expect(fd.get("currency")).toBeNull();
    });

    it("a paid product sends its price and currency", () => {
        const fd = buildProductCreateFormData(
            input({ data: formData({ isPaid: true, price: "29.50", currency: "EUR" }) }),
        );
        expect(fd.get("price")).toBe("29.5");
        expect(fd.get("currency")).toBe("EUR");
    });

    it("a recurring product sends the interval, and a one-off sends neither field", () => {
        const recurring = buildProductCreateFormData(
            input({
                data: formData({
                    isPaid: true, price: "10", isRecurring: true, recurringInterval: "yearly",
                }),
            }),
        );
        expect(recurring.get("isRecurring")).toBe("true");
        expect(recurring.get("recurringInterval")).toBe("yearly");

        const oneOff = buildProductCreateFormData(input({ data: formData({ isPaid: true, price: "10" }) }));
        expect(oneOff.get("isRecurring")).toBeNull();
        expect(oneOff.get("recurringInterval")).toBeNull();
    });
});

describe("access", () => {
    /*
     * The half of this that is easy to get wrong is the personal case. Those
     * columns are community-scoped and the server clamps them, so a personal
     * listing must send the defaults rather than whatever the access step last
     * held — and must send no tier grants at all.
     */
    const GATED: ResolvedAccess = { visibility: "MEMBERS_ONLY", tierIds: ["t-founding"] };

    it("a community listing sends the step's answer, including tier grants", () => {
        const fd = buildProductCreateFormData(
            input({ ownership: "community", access: { view: GATED, buy: GATED } }),
        );
        expect(fd.get("viewability")).toBe("MEMBERS_ONLY");
        expect(fd.get("accessibility")).toBe("MEMBERS_ONLY");
        expect(fd.get("viewTierIds")).toBe(JSON.stringify(["t-founding"]));
        expect(fd.get("buyTierIds")).toBe(JSON.stringify(["t-founding"]));
    });

    it("a personal listing sends PUBLIC and NO tier grants, whatever it was handed", () => {
        const fd = buildProductCreateFormData(
            input({ ownership: "personal", access: { view: GATED, buy: GATED } }),
        );
        expect(fd.get("viewability")).toBe("PUBLIC");
        expect(fd.get("accessibility")).toBe("PUBLIC");
        expect(fd.get("viewTierIds")).toBeNull();
        expect(fd.get("buyTierIds")).toBeNull();
    });

    it("sends an empty grant list rather than omitting it, since empty means every tier", () => {
        // Empty is not the same as absent here: the backend reads no rows as
        // unrestricted, and the step can legitimately resolve to that.
        const fd = buildProductCreateFormData(input({ ownership: "community" }));
        expect(fd.get("viewTierIds")).toBe("[]");
    });
});

describe("the string-literal flags", () => {
    /*
     * Both are compared against literals server-side because multipart carries
     * strings and Boolean("false") is true. Each is asserted in both directions
     * for that reason.
     */
    it("publish is 'true' only when the publish button was pressed", () => {
        expect(buildProductCreateFormData(input({ action: { publish: true } })).get("publish")).toBe("true");
        expect(buildProductCreateFormData(input({ action: { publish: false } })).get("publish")).toBe("false");
        expect(buildProductCreateFormData(input()).get("publish")).toBe("false");
    });

    it("requestListing is sent explicitly on a create and omitted on a draft save", () => {
        expect(
            buildProductCreateFormData(input({ action: { requestListing: true } })).get("requestListing"),
        ).toBe("true");
        expect(buildProductCreateFormData(input()).get("requestListing")).toBe("false");
        // A DRAFT row is never listed, so the flag has nothing to say.
        expect(
            buildProductCreateFormData(input({ draft: { step: "details", asDraft: true } }))
                .get("requestListing"),
        ).toBeNull();
    });
});

describe("draft reconciliation", () => {
    /*
     * This is the part whose failure costs someone their work, so each branch is
     * named rather than covered by one combined case.
     */
    it("a resumed draft finishes THAT row and records the step", () => {
        const fd = buildProductCreateFormData(input({ draft: { draftId: "d-1", step: "commerce" } }));
        expect(fd.get("draftId")).toBe("d-1");
        // Sent even though a successful finish clears it: a half-failed finish
        // reverts the row to DRAFT and restores this pointer.
        expect(fd.get("draftStep")).toBe("commerce");
    });

    it("an autosaved row is finished rather than duplicated", () => {
        const fd = buildProductCreateFormData(input({ draft: { savedDraftId: "auto-9", step: "details" } }));
        expect(fd.get("draftId")).toBe("auto-9");
        expect(all(fd, "draftId")).toHaveLength(1);
    });

    it("the URL draft wins over the autosaved one, and only one id is ever sent", () => {
        const fd = buildProductCreateFormData(
            input({ draft: { draftId: "d-1", savedDraftId: "auto-9", step: "details" } }),
        );
        expect(all(fd, "draftId")).toEqual(["d-1"]);
    });

    it("a draft save sends asDraft and its step, even with no row yet", () => {
        const fd = buildProductCreateFormData(input({ draft: { asDraft: true, step: "details" } }));
        expect(fd.get("asDraft")).toBe("true");
        expect(fd.get("draftStep")).toBe("details");
        expect(fd.get("draftId")).toBeNull();
    });
});

describe("optional fields are omitted, not blanked", () => {
    /*
     * An empty string is a foreign key to nothing. The backend treats an absent
     * field as "leave unfiled", so these must not be appended when unset.
     */
    it("omits category, cta, condition and parcel class when they are unset", () => {
        const fd = buildProductCreateFormData(input());
        for (const key of ["categoryId", "subCategoryId", "ctaText", "condition", "parcelClass", "packageId"]) {
            expect(fd.get(key)).toBeNull();
        }
    });

    it("sends the physical fields when the form emitted them", () => {
        const fd = buildProductCreateFormData(
            input({
                productType: "PHYSICAL",
                data: formData({ condition: "VERY_GOOD", parcelClass: "HEAVY" }),
            }),
        );
        expect(fd.get("condition")).toBe("VERY_GOOD");
        expect(fd.get("parcelClass")).toBe("HEAVY");
    });

    it("sends tags as a JSON array of ids, and omits the key when there are none", () => {
        expect(buildProductCreateFormData(input()).get("tags")).toBeNull();
        const fd = buildProductCreateFormData(
            input({ data: formData({ tags: [{ id: "t1", name: "clay" }] as ProductFormData["tags"] }) }),
        );
        expect(fd.get("tags")).toBe(JSON.stringify(["t1"]));
    });

    it("sends packageId only when the member was shown a choice", () => {
        expect(buildProductCreateFormData(input({ packageId: "pkg-1" })).get("packageId")).toBe("pkg-1");
        expect(buildProductCreateFormData(input({ packageId: null })).get("packageId")).toBeNull();
    });
});
