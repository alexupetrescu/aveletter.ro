# Product stock and price visibility

Stock is independent of product type. The CRM list and product editor both accept a whole number of units for every product:

- Empty: made to order, with no product-level stock limit.
- `0`: sold out; new cart additions and checkout are blocked.
- Positive number: the available quantity shared by all configurations and variants of that product.

Variants retain their own optional stock tracking. When both product and variant stock are configured, both limits apply and both quantities are deducted. Adding to a cart does not reserve stock. Placing an order reserves it under PostgreSQL row locks, including for cash on delivery. Multiple cart lines share the same stock pool. A failed quote or failed Stripe session setup rolls back the order, inventory changes, and cart consumption. Order cancellation restores only quantities actually deducted by this checkout, once. Refunds do not automatically return shipped products to inventory.

The stock input saves on blur or Enter. The editor omits unchanged stock from metadata saves. Changed stock includes the previously read quantity, so an intervening sale causes a conflict instead of being overwritten.

The checkbox immediately after the base price controls `show_price`. It also appears beside the price in the product editor. Turning it off hides prices on cards, product pages, option surcharges, and structured offers for search engines. Products remain purchasable, and cart/checkout/order totals remain visible. This is a presentation setting, not a way to keep pricing confidential from API clients.

## Existing data and deployment

Run `python manage.py migrate` before deploying the frontend. Existing prices remain visible. Existing zero quantities on non-premade products become empty, preserving made-to-order sales; existing premade stock quantities remain unchanged. Historical order lines receive zero reservation quantities, preventing cancellation from inventing stock that was never deducted.

Local development uses `docker-compose.dev.yml` (PostgreSQL on port 5433). `backend/.env` points to that local database; `python manage.py seed_demo` supplies sample products. Production data is not required.

## Remaining product logic improvements

1. **Explicit quote/approval workflow.** `custom_quote` and `requires_manual_approval` currently do not prevent ordinary checkout at the configured amount. A request-and-approval step should define the final price before payment. Hiding a price does not implement that workflow.
2. **Text length policy.** `_compute_text_pricing` caps billed pages at `maximum_pages` while still accepting longer text. Decide whether the cap is a flat-price offer or a hard text limit; use an explicit validation error if it is a limit. The current behavior is covered by an existing test and was preserved.
3. **Abandoned order policy.** Pending orders retain reservations so their payment-resume links remain usable. Automatically releasing stock needs a defined reservation lifetime and a cancellation/resume policy. Until then, cancel abandoned orders in CRM to return inventory. Cancelling a Stripe checkout session is distinct from cancelling the order.

## Validation

From `backend/`: `python manage.py test --noinput`.

From `frontend/`: `npm run test:products`, `npm run test:seo`, `npx tsc --noEmit`, and `npm run build`.

Tests cover stock editing across product types, zero/unlimited stock, duplicate lines, variant limits, stale carts, inactive/archived products, atomic option updates, rollback, cancellation, stale admin edits, hidden prices, and concurrent last-unit/same-cart checkout on PostgreSQL. Frontend UI tests render the actual product components; they do not simulate browser interaction.

The repository-wide migration check still reports the existing unrelated index/help-text differences in `shop` and `site_config`, also documented in `ORDER_WORKFLOW.md`.
