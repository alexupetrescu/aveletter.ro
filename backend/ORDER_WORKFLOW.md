# Order notifications and invoices

## Setup

1. Install `backend/requirements.txt` in the Django virtual environment.
2. Run `python manage.py migrate` from `backend/`. Migrations create enabled Romanian email templates but do not notify historical orders.
3. In `/crm/settings/`, configure **Notificări comenzi** (staff recipients, sender display name, reply-to), then review the email templates. The SMTP sender address and credentials stay in the existing server environment. `EMAIL_TIMEOUT` defaults to 30 seconds.
4. In **TVA & identitate fiscală**, complete the supplier's legal name, CIF, and address. In **Facturare**, add bank/contact details, a PNG/JPEG/WebP logo, payment terms, footer, and default invoice series.
5. In `/crm/invoices/`, create the invoice series. Its initial number can continue an existing series. Once used, its code and counter cannot be edited through CRM/admin.
6. Run the email worker in the same environment as Django:

   ```sh
   python manage.py process_email_queue --watch
   ```

   For a scheduler or one-off drain, use `python manage.py process_email_queue --limit 100`.

`deployment/aveletter-email-worker.service` is a production systemd template. Set its user, directory, and Python path to match the existing Django service before installing/enabling it. The worker reads `backend/.env` through the normal Django settings. It must be deployed alongside the web application; queued email is not sent by web requests.

## Behaviour

- Successful checkout initialization queues an order-received email and an individual internal notification to each configured recipient. Card payment confirmation is a separate email.
- Settings and templates are shared between Django admin and CRM; they are not exposed by the public site-config API.
- CRM transitions validate the current state, record the operator and shipment details, and queue or explicitly skip the stage email. Checkboxes initially follow the template's enabled setting. They are a choice for the next transition, not a delivery receipt.
- Ramburs orders may enter production while payment remains pending. **Înregistrează plata încasată** records an actual cash/bank collection without moving an advanced fulfillment stage backwards. Stripe payments are confirmed by verified webhooks.
- **Înregistrează rambursarea efectuată** records a full refund already performed outside this application; it does not call Stripe or move funds. It does not issue a storno document.
- AWB is required for dispatch even when the email checkbox is off. Save corrections first, then use **Retrimite emailul cu AWB-ul salvat** to notify the client of the updated details.
- New templates, order events, and email history start at deployment. Historical sent states are deliberately not invented.

## Email delivery

The database queue stores the rendered message, recipient, and sender at enqueue time. It is committed together with the order event. Workers claim rows with PostgreSQL row locks, then release the transaction before contacting SMTP. Normal failures retry up to five attempts with backoff. CRM exposes errors and manual retries. Retry keeps the original frozen content; the shipment resend action uses the latest saved AWB.

An interrupted sender or uncertain SMTP disconnect is marked **Rezultat necunoscut**, with no automatic resend. Check the mailbox/provider before choosing **Retrimite**. SMTP cannot provide an exactly-once guarantee. **Trimis** means the SMTP server accepted the message, not proof of inbox delivery.

Use **Trimite test** to queue the current template draft to a specified test recipient. Invoice-template tests use sample text and do not attach a real invoice. Actual invoice sends attach the stored PDF.

## Invoices

- Confirmed Stripe payments automatically attempt issuance after the payment transaction commits. Missing fiscal settings or rendering failures leave the payment recorded and show an actionable error on the CRM order.
- Cash-on-delivery invoices are issued manually from an order or the Facturi page. Preview consumes no number. Issuance locks the order and series; repeated/concurrent requests return the same original invoice.
- Issuance and email delivery are separate actions. The invoice-send endpoint requires a request UUID, making retries of the same request idempotent. A pending send is reused; resending an older invoice is explicit.
- Issued invoices store supplier/buyer data, dates, lines, totals, a copy of the logo, and the PDF. PDF bytes are stored in PostgreSQL and served only through staff-authenticated endpoints; backups must include the database. Rendering uses bundled OFL-licensed Noto Sans fonts.
- Existing invoices without PDFs are rendered once using only their stored fiscal snapshots. Fields missing from older snapshots remain absent rather than being replaced with today's settings.
- Billing details can be corrected before issuance without changing the shipping address. Checkout supports individual/company billing and separate billing addresses.
- Prices and tax amounts come from the order's frozen totals. This change preserves the existing shipping/discount tax treatment; it does not recalculate historic orders or change VAT rates.
- ANAF submission and storno issuance remain separate future work. The existing e-Factura model fields do not represent an active integration.

## Validation

Install `requirements-dev.txt`, then run from `backend/` against a development PostgreSQL database:

```sh
python manage.py test
python manage.py makemigrations orders --check --dry-run
```

The workflow tests cover notification defaults/overrides, duplicate transitions, dispatch validation, rollback, retries, protected endpoints, company billing, frozen PDFs, Romanian characters, pagination, and simultaneous invoice issuance. All automated email tests use the in-memory mail backend.

The repository-wide migration check also reports pre-existing index/help-text differences in `shop` and `site_config`. Those models and migrations are outside this change; the order migration check is clean.

Frontend checks: `npx tsc --noEmit` and `npm run build`. On Windows PowerShell use `npx.cmd`/`npm.cmd` where execution policy blocks the `.ps1` wrappers.
