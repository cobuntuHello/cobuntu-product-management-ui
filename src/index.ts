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
export { ProductForm, type ProductFormData } from "./components/ProductForm";
export { EditProductDrawer } from "./components/EditProductDrawer";

// UI primitives — duplicated from @cobuntu/event-management-ui by design
// (see README). Re-exported here so consumers have a single import point
// for the package's surface.
export { ModalShell } from "./ui/modal-shell";
export { Select, SelectGroup, SelectValue, SelectTrigger, SelectContent, SelectItem } from "./ui/select";
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
