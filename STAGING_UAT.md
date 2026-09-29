# שוק — Staging Real-Device UAT

## Gate before testing

- [ ] Use a dedicated database whose name identifies staging; never `marketplace`.
- [ ] Store real secrets outside Git and run `npm run staging:preflight -- <env-file>`.
- [ ] Build Web with the final HTTPS `NEXT_PUBLIC_API_URL` and `NEXT_PUBLIC_SITE_URL`; these values are embedded at build time.
- [ ] Start API and Web with `NODE_ENV=production` and verify `/api/health` plus the `X-Request-Id` response header.
- [ ] Confirm staging contains fictional test accounts only.
- [ ] Confirm Payment displays the placeholder and does not request card data.

Record device model, OS/browser version, tester, date, result and screenshot/request ID for every failure. Use `PASS`, `FAIL`, or `BLOCKED`; do not mark unexecuted checks as passed.

## Device matrix

| Device | Browser | Version | Tester | Result |
|---|---|---|---|---|
| iPhone | Safari |  |  | NOT RUN |
| iPhone | Chrome |  |  | NOT RUN |
| Android phone | Chrome |  |  | NOT RUN |
| Desktop | Chrome |  |  | NOT RUN |
| Desktop | Edge |  |  | NOT RUN |
| macOS desktop, if available | Safari |  |  | NOT RUN |

Test at narrow portrait, landscape, browser zoom 200%, and with increased system font size where supported. Confirm RTL, focus visibility, no horizontal overflow, no clipped dialogs and no controls hidden behind the mobile browser chrome.

## Guest journey

- [ ] Homepage hero, search and CTA render correctly.
- [ ] Search by Hebrew name and SKU; clear search.
- [ ] Apply category, price, availability and sort controls.
- [ ] Open a product with a long Hebrew title and missing image fallback.
- [ ] Open seller information/store page.
- [ ] Change quantity, add to cart, edit quantity and remove product.
- [ ] Refresh and confirm cart recovery is understandable.

## Customer journey

- [ ] Register a new fictional account; validate weak password and duplicate email messages.
- [ ] Login, invalid login, logout and protected-route redirect.
- [ ] Open Account and create/edit/default/delete a fictional address.
- [ ] Checkout one product and products from two sellers.
- [ ] Double-tap order submission; confirm one order only.
- [ ] Confirm backend total, address snapshot and seller split.
- [ ] Open Orders and Order details, then cancel an eligible order.
- [ ] Refresh during checkout and return to Marketplace after each operation.
- [ ] Confirm Payment remains a clear “בקרוב” placeholder and has no card fields.

## Seller journey

- [ ] Login as an approved fictional seller and open Dashboard.
- [ ] Review product list, create and edit a product.
- [ ] Update inventory and verify negative/invalid stock messages.
- [ ] Upload/reorder/delete images using the image matrix below.
- [ ] Open Seller orders and order details.
- [ ] Complete `PAID → PROCESSING → READY_TO_SHIP → SHIPPED → IN_TRANSIT → DELIVERED`.
- [ ] Confirm another seller’s product/order URLs are inaccessible.

## Admin journey

- [ ] Login as the staging admin and open Dashboard.
- [ ] Search/filter Sellers, Products and Orders.
- [ ] Approve/reject/change a fictional seller status.
- [ ] Change a test product status and restore it.
- [ ] Open order details and every available modal/action.
- [ ] Keyboard: open dialog, cycle focus, close with Escape and confirm focus restoration.

## Network test plan

Use browser/device throttling or a controlled network. Record timings and request IDs.

- [ ] Normal 4G/5G: complete Guest and Customer checkout.
- [ ] Slow network: verify loading states, usable controls and no repeated submissions.
- [ ] Temporary offline on a catalog request: Hebrew error appears without exception details.
- [ ] Restore network and use Retry successfully.
- [ ] Refresh while checkout quote is pending; confirm no order was created.
- [ ] Double-tap final submit; confirm one order/idempotent response.
- [ ] Interrupt an image upload; confirm the UI recovers and no broken image record appears.
- [ ] Let the access token expire; confirm one refresh request, no loop, and continued session or clean guest state.

## Image upload matrix

Use synthetic/non-personal images only.

| Case | Expected | Result |
|---|---|---|
| Valid PNG | Preview and successful upload | NOT RUN |
| Valid JPEG | Preview and successful upload | NOT RUN |
| Valid WebP | Preview and successful upload | NOT RUN |
| Large valid image below 10 MB | Upload succeeds with usable loading state | NOT RUN |
| Multiple images up to total limit 8 | Ordered previews and successful upload | NOT RUN |
| Reorder / make primary | Product gallery order updates | NOT RUN |
| Delete | Confirmation, deletion and normalized order | NOT RUN |
| Invalid PDF/text renamed as image | Clear Hebrew rejection | NOT RUN |
| Image over 10 MB | Clear Hebrew size rejection | NOT RUN |
| Interrupted upload | Recoverable error; no orphan DB row | NOT RUN |

## Security and console spot-check

- [ ] No CSP, hydration or runtime errors in console.
- [ ] No unexplained failed/repeated requests or refresh loop.
- [ ] Cookies are `HttpOnly`, `Secure`, scoped to `/api/auth`, and have `SameSite=Lax`.
- [ ] CSP has no `unsafe-inline`; CORS returns the exact staging origin, never `*`.
- [ ] Responses include expected security headers and request ID.
- [ ] Logs contain request ID, method, endpoint, status, duration and category.
- [ ] Logs do not contain passwords, JWTs, refresh cookies, secrets, full addresses or payment/card data.

## Sign-off

- [ ] No open blocker affecting authentication, checkout, ownership, inventory or order workflow.
- [ ] All failures include reproduction steps, device/browser, screenshot and request ID.
- [ ] Product owner accepts the Payment placeholder.
- [ ] Engineering and product approve promotion from staging. Production deployment remains a separate authorized action.
