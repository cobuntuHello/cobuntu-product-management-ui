# @cobuntu/product-management-ui

Shared marketplace-product management UI consumed by [`cobuntu-admin`](https://github.com/cobuntuHello/cobuntu-community-backoffice) (community-leader-facing) and `cobuntu-community-app` (seller-facing, via `/marketplace/[sku]/manage`).

**Sibling to** [`@cobuntu/event-management-ui`](https://github.com/cobuntuHello/cobuntu-event-management-ui). Same pattern, separate package — products and events are different bounded domains.

## How it's consumed

Both apps add this as a **git dependency** in their `package.json`:

```json
{
  "dependencies": {
    "@cobuntu/product-management-ui": "git+https://github.com/cobuntuHello/cobuntu-product-management-ui.git#<sha-or-tag>"
  }
}
```

And tell Next.js to transpile it (the package ships TypeScript source directly):

```js
// next.config.js
module.exports = {
  transpilePackages: ['@cobuntu/product-management-ui'],
  // ...
};
```

Then import normally:

```tsx
import { PriceEditModal } from '@cobuntu/product-management-ui';
```

## Pinning

- **Production**: pin to a specific commit SHA or version tag. `#main` is convenient in dev but lets `npm install` pick up arbitrary changes — don't ship that.
- **Development**: `#main` is fine; bump the lockfile by re-running `npm install` when you want the latest.

## Development

```bash
npm install
npm run typecheck
npm test
```

Peer dependencies:
- React >=19
- React DOM >=19
- Next >=16

The package ships TypeScript source directly. Consumers' Next.js build (via `transpilePackages`) compiles it — no build step in this repo.

## Why duplicate the primitives instead of sharing with event-management-ui?

Each package is **self-contained**. Primitives (`ModalShell`, `Select`, `cn`) are duplicated rather than depended on across packages, so:
- Each package owns what it ships
- No coupling between events and products — changes to one don't bump the other
- Future developers reading either package see everything in one place

If the primitives drift between the two packages over time, extract them into a third package then.

## Migration progress

- [x] `PriceEditModal`
- [ ] `EditProductDrawer` + small modals (Name / Delete / Share)
