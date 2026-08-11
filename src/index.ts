// @cobuntu/product-management-ui — public exports
//
// Shared marketplace-product management UI consumed by `cobuntu-admin`
// (community leaders) and `cobuntu-community-app` (sellers, via
// `/marketplace/[sku]/manage`).

// Config — every consumer must wrap its product-management surface with
// the provider so components can fetch from the right API and authenticate.
export {
  ProductManagementConfigProvider,
  useProductManagementConfig,
  useJsonHeaders,
  type ProductManagementConfig,
} from "./config";

// Components
export { PriceEditModal, type PriceEditModalProps, CURRENCIES } from "./components/PriceEditModal";
export { NameEditModal } from "./components/NameEditModal";
export { ShareModal } from "./components/ShareModal";
export { DeleteModal } from "./components/DeleteModal";
export {
  ProductDistributionModal,
  type ProductDistributionModalProps,
  type ProductDistributionFields,
} from "./components/ProductDistributionModal";
export { ProductForm, type ProductFormData } from "./components/ProductForm";
export {
  ProductTiersAndDonations,
  type TierDraft,
  type DonationDraft,
  blankTier,
  blankDonation,
  tierDraftsToPayload,
  donationDraftToPayload,
} from "./components/ProductTiersAndDonations";
// Rich draft-tier shape used by the create wizard (ProductForm's draftMode
// PriceEditModal). ProductFormData.tiers is DraftTier[]; consumers build the
// create-product tiers[] via draftTiersToCreatePayload. The simpler TierDraft
// + tierDraftsToPayload above stay exported for any legacy caller.
export { type DraftTier } from "./components/PriceEditModal/types";
export { draftTiersToCreatePayload } from "./components/PriceEditModal/helpers";
export { EditProductDrawer } from "./components/EditProductDrawer";

// UI primitives — duplicated from @cobuntu/event-management-ui by design
// (see README). Re-exported here so consumers have a single import point
// for the package's surface.
export { ModalShell } from "./ui/modal-shell";
export { Select, SelectGroup, SelectValue, SelectTrigger, SelectContent, SelectItem } from "./ui/select";

// New shared primitives — exposed for consumers building the redesigned
// PriceEditModal (Phase A2 of the price-modal-redesign feature). The
// existing `ModalShell` above stays put as a thin wrapper around the
// shared shell so call-sites that bring their own close affordance keep
// working unchanged. Components adopting the wizard/hub layout should
// import these directly from "@cobuntu/management-ui-shared" — they're
// re-exported here only for surface symmetry with the existing UI block.
export {
  ModalShell as SharedModalShell,
  TextField,
  NumberField,
  SectionCard,
  WizardProgress,
  DiscardPrompt,
  BillingRadio,
  DiscountModeRadio,
  type ModalShellProps as SharedModalShellProps,
  type TextFieldProps,
  type NumberFieldProps,
  type SectionCardProps,
  type WizardProgressProps,
  type WizardStep,
  type DiscardPromptProps,
  type BillingRadioProps,
  type BillingMode,
  type BillingOption,
  type DiscountModeRadioProps,
  type DiscountMode,
  type DiscountOption,
} from "@cobuntu/management-ui-shared";
export { Input, type InputProps } from "./ui/input";
export { Button, buttonVariants, type ButtonProps } from "./ui/button";
export { Label } from "./ui/label";
export { Switch } from "./ui/switch";
export { Slider } from "./ui/slider";
export {
  Dialog, DialogPortal, DialogOverlay, DialogClose, DialogTrigger,
  DialogContent, DialogHeader, DialogFooter, DialogTitle, DialogDescription,
} from "./ui/dialog";
export { EventTags } from "./ui/event-tags";
export { RichTextEditor } from "./ui/rich-text-editor";
export { FileUploadZone, type UploadedFile } from "./ui/file-upload-zone";
export { StockPhotoPicker } from "./ui/stock-photo-picker";
export { BannerCropModal, type BannerCropResult } from "./ui/banner-crop-modal";
export { SortableMediaGallery, type MediaItem } from "./ui/sortable-media-gallery";
export { cn } from "./ui/utils";

// Category picker — the consumer loads the options and passes them to
// ProductForm; the type is exported so it can shape that fetch.
export { CategoryPickerRow, type CategoryOption } from "./components/CategoryPickerRow";

/**
 * The product manage PAGE pieces. Both apps mount these rather than each
 * assembling its own — the reason the two product pages diverged is that the
 * package shipped only the parts.
 */
export { ProductSectionsNav, type ProductViewKey } from "./page/ProductSectionsNav";
export {
  ProductManagePage,
  visibleProductViews,
  type ProductManagePageProps,
  type ProductModal,
} from "./page/ProductManagePage";
export { ProductManageHeader, type ProductManageHeaderProps } from "./page/ProductManageHeader";
export { OverviewView as ProductOverviewView } from "./page/views/OverviewView";
export { CollaboratorsView } from "./page/views/CollaboratorsView";
export { ProductActivityTab, type ProductActivityTabProps } from "./components/activity/ProductActivityTab";
export {
  renderProductActivitySentence,
  formatRelativeTime as formatProductActivityTime,
  type ProductActivityEntryForRender,
} from "./components/activity/productActivitySentences";
export { ProductCard as ProductOverviewCard } from "./page/sections/ProductCard";
export { ListingsSection as ProductListingsSection } from "./page/sections/ListingsSection";
export { ListingDetailDrawer as ProductListingDetailDrawer } from "./page/sections/ListingDetailDrawer";
export { OverviewActionCards as ProductOverviewActionCards } from "./page/sections/OverviewActionCards";
export { AfterCheckoutCard } from "./page/sections/AfterCheckoutCard";
export { getProductManagementConfig } from "./config";
export { UserAvatarFallback } from "./ui/user-avatar-fallback";
