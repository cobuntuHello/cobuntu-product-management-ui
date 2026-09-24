import type { ProductFormData } from "../components/ProductForm";
import { draftTiersToCreatePayload, tierFileUploads } from "../components/PriceEditModal/helpers";
import { donationDraftToPayload } from "../components/ProductTiersAndDonations";

/**
 * The multipart body a create-product wizard sends to `/products/upload/start`.
 *
 * ── Why this is in the package and not in the wizard ────────────────────────
 *
 * It was inline in the community app's CreateProductClient, and it was the only
 * copy, which was fine while there was only one wizard. There are about to be
 * two: /learning/new forks the flow so a course can carry a syllabus step, and
 * a fork means this assembly gets copied unless something stops it.
 *
 * Copying it is the failure this codebase has already paid for once. Admin's
 * event create hand-rolled its own tier payload rather than using the shared
 * builder, and silently dropped every tier sub-object: the request succeeded,
 * the product appeared, and the configuration was simply not there. Nothing
 * errored, because a multipart field that is never appended is indistinguishable
 * from one the seller left blank.
 *
 * The same shape of bug is available here in about twenty places. `viewTierIds`
 * omitted on a community-owned listing loses the leader's tier grants.
 * `draftStep` omitted loses someone's place when a finish half-fails. `publish`
 * sent as a boolean rather than the string "true" publishes everything, because
 * the controller compares against the literal and `Boolean("false")` is true.
 *
 * So the rule is: the wizards decide WHAT to create, and this decides how that
 * becomes a request. A fork can diverge as far as it likes above this line.
 *
 * ── What this deliberately does NOT do ──────────────────────────────────────
 *
 * No validation, no Stripe readiness check, no network call. Those are the
 * wizard's, because their failures need its error state and its copy. This
 * function takes a decided form and returns a body; it cannot fail.
 */

/** What the wizard is creating. EVENT never comes through here. */
export type ProductCreateType = "DIGITAL" | "PHYSICAL" | "COURSE";

/** Whose listing this is. A member's is always "personal". */
export type ProductCreateOwnership = "community" | "personal";

/**
 * An access gate, already resolved.
 *
 * Resolved by the CALLER, not here: the wizard's access step speaks in
 * `TierAccessValue`, whose resolver lives in `@cobuntu/management-ui-shared`,
 * and reaching for it from this package would make the product form depend on
 * the wizard chrome to build a request. Passing the answer keeps the direction
 * of that dependency the way round it already is.
 */
export interface ResolvedAccess {
    visibility: "PUBLIC" | "MEMBERS_ONLY";
    tierIds: string[];
}

export interface ProductCreatePayloadInput {
    /** The form's emitted state, as the seller left it. */
    data: ProductFormData;
    /**
     * The type CHOSEN in the wizard, never the surface's default.
     *
     * Sending the surface's prop instead would make a type picker decorative:
     * the seller picks Physical, the wizard shows the physical questions, and
     * the API is told DIGITAL.
     */
    productType: ProductCreateType;
    communityTag: string;
    /**
     * The leader's choice. Non-leaders send "personal" and the backend ignores
     * it either way, because it re-checks the permission itself rather than
     * trusting this field.
     */
    ownership: ProductCreateOwnership;
    /** The member's opening position. Omitted when they were shown no choice. */
    packageId?: string | null;
    /** View and buy gates. Ignored for a personal listing, see below. */
    access: { view: ResolvedAccess; buy: ResolvedAccess };
    /** Where the wizard is, and which draft row this create belongs to. */
    draft: {
        /** The draft being RESUMED, from the URL. */
        draftId?: string | null;
        /** The autosaved row, once a save has landed. Finishes it rather than
         *  inserting a second row beside it. */
        savedDraftId?: string | null;
        /** Saving as a draft rather than creating. */
        asDraft?: boolean;
        /** The step they are on, recorded so a resume lands where they stopped. */
        step: string;
    };
    /** Which button they pressed. Absent for a draft save. */
    action?: { publish?: boolean; requestListing?: boolean };
}

/**
 * Build the create request.
 *
 * Every rule below moved here verbatim from the wizard, including the ones that
 * look redundant. They are not: each is a bug that was fixed once already, and
 * the comment is the only thing standing between it and being fixed again.
 */
export function buildProductCreateFormData(input: ProductCreatePayloadInput): FormData {
    const { data, productType, communityTag, ownership, packageId, access, draft, action } = input;
    const { asDraft, draftId, savedDraftId, step } = draft;

    const formData = new FormData();
    formData.append("name", data.name.trim());
    formData.append("description", data.description.trim());
    formData.append("productType", productType);
    /*
     * Always passed. The backend routes to the member-submission path via
     * canCreateAsMember when the user is not a leader of this community.
     */
    formData.append("communityTag", communityTag);
    formData.append("ownership", ownership);
    if (packageId) formData.append("packageId", packageId);

    /*
     * Tiers are sent whenever the form produced any — NOT only when the product
     * charges.
     *
     * This used to AND in `isPaid`, which meant a FREE tier carrying a capacity
     * and a registration form was dropped here even after the form had emitted
     * it: "free product, 50 seats, with an application form" was configurable
     * and unsavable. ProductForm only emits a tier the seller actually
     * configured, so the length check alone is the right gate. The backend
     * accepts a zero-price tier and requires no Stripe for one; `price: 0` below
     * is what it expects alongside a tier list.
     */
    const hasTiers = !!data.tiers && data.tiers.length > 0;
    if (hasTiers) {
        formData.append("price", "0");
        formData.append("tiers", JSON.stringify(draftTiersToCreatePayload(data.tiers)));
    } else if (data.isPaid && data.price) {
        formData.append("price", String(parseFloat(data.price)));
        formData.append("currency", data.currency);
        if (data.isRecurring) {
            formData.append("isRecurring", "true");
            formData.append("recurringInterval", data.recurringInterval);
        }
    } else {
        formData.append("price", "0");
    }

    if (data.donation && data.donation.enabled) {
        const payload = donationDraftToPayload(data.donation);
        if (payload) formData.append("donationConfig", JSON.stringify(payload));
    }

    if (data.ctaText.trim()) formData.append("ctaText", data.ctaText.trim());

    /*
     * Appended ONLY when non-null, and the form is what decides that.
     *
     * normalisePhysicalFields throws if a digital product carries a condition or
     * a parcel class, so this cannot become "append whatever is in state".
     * ProductForm already nulls them for every non-physical type, which is why
     * this reads as a plain null check rather than a second copy of the rule.
     */
    if (data.condition) formData.append("condition", data.condition);
    if (data.parcelClass) formData.append("parcelClass", data.parcelClass);
    if (data.categoryId) formData.append("categoryId", data.categoryId);
    if (data.subCategoryId) formData.append("subCategoryId", data.subCategoryId);

    /*
     * Access comes from the ACCESS STEP, not from the form.
     *
     * The form is rendered with hideVisibility on, so what it emits for these
     * two is its untouched default (PUBLIC/PUBLIC) — reading `data.viewability`
     * here would silently discard whatever the leader chose on the last step.
     *
     * A personal listing sends the defaults on purpose: those fields are
     * community-scoped and the server clamps them anyway, so the step does not
     * exist and there is nothing to send.
     */
    const isCommunityOwned = ownership === "community";
    formData.append("viewability", isCommunityOwned ? access.view.visibility : "PUBLIC");
    formData.append("accessibility", isCommunityOwned ? access.buy.visibility : "PUBLIC");
    /*
     * Tier grants. JSON-encoded because this request is multipart, and only for
     * a community-owned listing — the server drops them on a personal one, and
     * sending them would be asking for something it will refuse.
     *
     * These were UPDATE-ONLY on the backend until feat/create-tier-grants: the
     * step would have accepted "Founding only" and the server would have written
     * nothing, with no error anywhere.
     */
    if (isCommunityOwned) {
        formData.append("viewTierIds", JSON.stringify(access.view.tierIds));
        formData.append("buyTierIds", JSON.stringify(access.buy.tierIds));
    }
    formData.append("requiresApproval", String(!!data.requiresApproval));

    /*
     * Finishing a draft must finish THAT row, not open a second one beside it.
     * The id travels with the create call for that reason.
     */
    if (draftId) {
        formData.append("draftId", draftId);
    }
    /*
     * The step travels with a draft context even when this call FINISHES the
     * draft rather than re-saving it.
     *
     * On a successful finish the server clears draftStep, so it looks redundant.
     * It is not: if the work after the transaction fails, the server puts the row
     * back to DRAFT and restores this pointer. Without it the revert would restore
     * the draft to step null, and someone whose finish failed for an unrelated
     * reason would reopen their work at the beginning of the wizard.
     */
    if (draftId && !asDraft) {
        formData.append("draftStep", step);
    }
    /*
     * Finish the autosaved row when this create did not come from a draft link.
     * `draftId` covers the resume path; this covers every other one.
     */
    if (!draftId && !asDraft && savedDraftId) {
        formData.append("draftId", savedDraftId);
    }
    /*
     * asDraft decides the STATUS; draftStep records where they stopped so
     * reopening lands there. The step is sent for a draft save whether or not the
     * row already exists — on a first save there is no draftId yet, and that save
     * is precisely the one someone will want to resume.
     */
    if (asDraft) {
        formData.append("asDraft", "true");
        formData.append("draftStep", step);
    }

    /*
     * Which button they pressed. Sent for EVERY ownership.
     *
     * It used to be personal-only, on the reasoning that a community-owned item
     * is carried by its own community by definition — but that made the exemption
     * decide instead of the person, and a leader could not build something for
     * their community without it going live the instant they pressed the button.
     *
     * Multipart carries strings, and this is the one flag whose default is TRUE,
     * so the controller compares against "false" explicitly rather than coercing.
     * A draft save sends nothing and stays unlisted regardless, because a DRAFT
     * row is never listed.
     */
    if (!asDraft) {
        formData.append("requestListing", action?.requestListing === true ? "true" : "false");
    }

    if (data.tags.length > 0) {
        formData.append("tags", JSON.stringify(data.tags.map((tag) => tag.id)));
    }
    /*
     * Save & Publish. Multipart carries strings, so the controller compares
     * against "true" explicitly rather than coercing — Boolean("false") is true
     * and would publish everything.
     */
    formData.append("publish", action?.publish === true ? "true" : "false");

    for (const item of data.mediaItems) {
        if (item.file) formData.append("media", item.file);
    }
    /*
     * Per-variant deliverables. Each variant's file bytes go over the
     * `tierFiles:<index>` multipart channel; links ride inside the tier JSON
     * (buildTierBody emits them), so there is no top-level append.
     *
     * The index rule — <index> counts the variant's position in the `tiers` JSON
     * AFTER soft-deleted and blank-name drafts are dropped — lives in the package
     * next to the tier payload builder that defines the filter, because two copies
     * of a rule whose failure is SILENT (bytes land on the wrong variant's child
     * product; the save succeeds) is one copy too many.
     */
    for (const { field, file } of tierFileUploads(data.tiers ?? [])) {
        formData.append(field, file);
    }

    return formData;
}
