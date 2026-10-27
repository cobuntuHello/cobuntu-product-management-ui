import type { ProductFormData } from "../components/ProductForm";
import type { ProductDraftRow } from "./types";

/**
 * Turning a stored draft back into the form that wrote it. Mirrors
 * @cobuntu/event-management-ui's create-wizard/draftResume.ts (the product
 * half, lifted from the community app's lib/draftResume.ts).
 *
 * Fails soft field by field: a draft exists so someone does not lose work, and
 * a mapping that throws on one odd value would lose all of it. NOT restored:
 * tiers (no reverse mapping of the rich draft-tier shape, same as the app's
 * own productDraftToForm) and files (a File cannot round-trip).
 */
export function productDraftToForm(row: ProductDraftRow): Partial<ProductFormData> {
  return {
    name: typeof row.name === "string" ? row.name : "",
    description: typeof row.description === "string" ? row.description : "",
    categoryId: (row.categoryId as string) ?? null,
    subCategoryId: (row.subCategoryId as string) ?? null,
  } as Partial<ProductFormData>;
}

/**
 * Which ownership a draft was written under. Read from the row because
 * ownership decides which STEPS exist, and the stored step has to be resolved
 * against the list this person will actually see.
 */
export function draftOwnership(row: ProductDraftRow): "community" | "personal" {
  return row.communityId ? "community" : "personal";
}
