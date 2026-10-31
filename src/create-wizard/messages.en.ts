/**
 * English copy for ProductCreateWizard, the default when a host passes no `t`.
 *
 * Mirrors cobuntu-community-app's messages/en.json namespaces the wizard
 * reads (marketplaceUi.createProductClient, marketplaceUi.ownership,
 * marketplaceUi.firstTimeCreatorModal, shared.howItWorksButton) so the
 * package and the app say the same thing. The app keeps passing its
 * next-intl `t`, which resolves the same keys in every locale; this is for
 * hosts without one.
 *
 * Keys are looked up fully qualified, e.g.
 * "marketplaceUi.createProductClient.breadcrumbMarketplace". Messages are
 * ICU (plural, select) with <b>/<link> rich tags.
 */
export const PRODUCT_WIZARD_MESSAGES_EN = {
  "marketplaceUi": {
    "createProductClient": {
      "errAddName": "Give your product a name",
      "errPaidTier": "Set a price (or pay-what-you-want) on at least one variant",
      "errSetPrice": "Set a price",
      "errNeedTier": "Add at least one variant to continue",
      "errDraftNeedsName": "Give it a name first, so you can find it again.",
      "errFailedCreate": "Failed to create product",
      "errUploadFailed": "Upload failed",
      "errUploadTimedOut": "Upload timed out",
      "breadcrumbMarketplace": "Marketplace",
      "breadcrumbNewProduct": "New product",
      "sellIn": "Sell in {community}",
      "headerSubtitle": "List a product. It will appear on {community}'s marketplace once approved (or immediately, if approval isn't required).",
      "stepOwnershipTitle": "Who is selling this?",
      "stepOwnershipSubtitle": "Both go live straight away. What changes is where the money lands, who takes a cut, and which options you get.",
      "stepDetailsTitle": "About your product",
      "stepDetailsSubtitle": "Photos, description, tags and category.",
      "stepCommerceTitle": "Pricing & Deliverables",
      "stepCommerceSubtitle": "Set your variants, their prices, and what buyers receive.",
      "stepSettingsTitle": "Policies & access",
      "stepSettingsSubtitle": "The optional extras: approval and repeat purchase.",
      "stepAccessTitle": "Who is this for?",
      "stepAccessSubtitle": "Choose who in {community} can find this product, and who can buy it.",
      "stepListingTitle": "Your arrangement",
      "stepListingSubtitle": "The terms you sell under in {community}.",
      "stepDoneTitle": "All set",
      "stepDoneSubtitle": "Your product is created. Choose what to do next.",
      "stepResumeTitle": "Continue where you left off",
      "stepResumeSubtitle": "You have unfinished products. Pick one up, or start something new.",
      "stripeNoticeTitle": "Connect Stripe to sell",
      "stripeNoticeBody": "Paid products need a connected Stripe Connect account with charges enabled. You can still create a free product.",
      "communityPaymentsNoticeTitle": "{community} cannot receive payments yet",
      "communityPaymentsNoticeBody": "This community takes a commission on paid products, but has not connected a payment account to receive it, so a paid product cannot be listed here yet. Ask a community leader to connect one. You can still create a free product.",
      "connectStripe": "Connect Stripe",
      "connectStripeSubmit": "Connect Stripe to submit a paid product",
      "creating": "Creating…",
      "saveDraft": "Save Draft",
      "draftOpening": "Opening your draft...",
      "submitForReview": "Submit for review",
      "submit": "Submit",
      "save": "Save",
      "saveRequest": "Save & Request Listing",
      "create": "Create",
      "createRequest": "Create & Request Listing",
      "createList": "Create & List",
      "freeToList": "Free to list · Create keeps it to yourself; a request asks a leader to carry it.",
      "unlistedNote": "This stays unlisted — just yours — until you ask a community to carry it.",
      "noPackagesNote": "{community} has not published terms for your tier, so there is nothing to pick. Your request goes in without one and they will propose the commission when they review it.",
      "notePickArrangement": "Pick an arrangement above to list it, or turn off listing to keep it to yourself.",
      "draftJustNow": "just now",
      "draftMinutesAgo": "{count, plural, one {# minute ago} other {# minutes ago}}",
      "draftHoursAgo": "{count, plural, one {# hour ago} other {# hours ago}}",
      "draftDaysAgo": "{count, plural, one {# day ago} other {# days ago}}",
      "draftLeftOn": "Left on {step}",
      "draftStartNewProduct": "Create New Product",
      "noteDrafts": "Drafts are private. They stay here until you finish them.",
      "draftDiscard": "Discard this draft",
      "draftDiscardConfirm": "Discard",
      "draftDiscardCancel": "Keep",
      "draftDiscardBody": "“{name}” will be permanently deleted. This can’t be undone.",
      "draftDiscardClose": "Close"
    },
    "ownership": {
      "communityLabel": "{community}",
      "personalLabel": "You",
      "communitySub": "The community sells it",
      "personalSub": "You sell it, in this community",
      "communityPayout": "Payouts to <b>the community's Stripe</b>",
      "personalPayout": "Payouts to <b>your own Stripe</b>",
      "communityCommission": "No commission",
      "personalCommission": "The community's <b>commission applies</b>",
      "communityStripe": "The community needs <b>Stripe connected</b>",
      "personalStripe": "You need <b>Stripe connected</b>",
      "communityCobuntuFee": "Cobuntu takes <b>{rate}</b>",
      "communityCobuntuFeeUnknown": "Cobuntu's <b>platform fee</b> applies",
      "personalCobuntuFee": "Cobuntu takes <b>4% + €0.30</b> of your share",
      "communityOptions": "You also choose <b>who can see it and who can buy it</b>",
      "personalOptions": "You pick <b>which arrangement</b>, if the community offers more than one"
    },
    "firstTimeCreatorModal": {
      "heading": "{kind, select, event {Before you host your first event in {communityName}} other {Before you list your first product in {communityName}}}",
      "subtitle": "Three quick things to know. You only see this once.",
      "point1Title": "It's yours",
      "point1Body": "{kind, select, event {You own the event. Your name is on it, your payouts go to your Stripe account, and you set the price.} other {You own the product. Your name is on it, your payouts go to your Stripe account, and you set the price.}}",
      "point2Title": "The community takes a commission",
      "point2Body": "{communityName} takes a percentage on each sale. The rate depends on this community's pricing model and your seller tier. See it in detail on <link>the selling guide</link>.",
      "point3Title": "Approval might be required",
      "point3Body": "If {communityName} requires approval, your submission enters a review queue. Leaders see it, can ask questions, and approve or decline before it goes live.",
      "readFullGuide": "Read the full guide",
      "gotIt": "{kind, select, event {Got it, let's host} other {Got it, let's list}}"
    }
  },
  "shared": {
    "howItWorksButton": {
      "ariaLabel": "How selling works in this community",
      "label": "How it works"
    }
  }
} as const;

export type ProductWizardMessages = typeof PRODUCT_WIZARD_MESSAGES_EN;
