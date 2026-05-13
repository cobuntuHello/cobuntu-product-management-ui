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

// UI primitives — duplicated from @cobuntu/event-management-ui by design
// (see README). Re-exported here so consumers have a single import point
// for the package's surface.
export { ModalShell } from "./ui/modal-shell";
export { Select, SelectGroup, SelectValue, SelectTrigger, SelectContent, SelectItem } from "./ui/select";
export { cn } from "./ui/utils";
