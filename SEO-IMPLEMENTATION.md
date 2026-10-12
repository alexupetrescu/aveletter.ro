# SEO implementation

The frontend and backend must be deployed together. No database migration is required.

## Public behavior

- Every public content page has an absolute canonical, a single brand in its title, and page-specific Open Graph and Twitter metadata.
- Shop categories use `/shop/categorie/<slug>`. Previous `/shop?categorie=<slug>` links permanently redirect to these pages.
- Shop and blog pagination is server-rendered with crawlable previous/next links and distinct canonicals. Blog category filters also use links.
- `/cart`, `/checkout/*`, and `/crm/*` return `X-Robots-Tag: noindex, nofollow`. These paths remain crawlable so search engines can observe the header.
- Blog `canonical_url`, `noindex`, and sharing-image settings are applied to public pages.
- Sitemap generation follows every product/article API page, includes populated shop categories and the ordering guide, and excludes noindex or cross-canonical articles. Dates come from content timestamps. API errors fail sitemap generation instead of returning a partial success.
- Organization, breadcrumb, article, and product JSON-LD is rendered in HTML. Fixed product offers use the initial variant/base price only when options/text do not alter that price and manual approval is not required. Variable/custom quotes deliberately omit a fixed Offer. No reviews, ratings, return policies or stock claims are invented.
- Catalog images use responsive Next images for the production media domain, lazy loading below the fold, reserved aspect ratios, and title-based alt text when the CMS field is empty. Authored image descriptions take precedence; specific visual descriptions can still be improved in the media library.
- The ordering guide at `/ghid-comenzi` explains personalization, pricing and delivery using existing information and current shipping settings. The footer and catalog link to it.
- `/llms.txt` is generated from current site/contact/category/product data, with absolute links. Robots rules explicitly name search and user-directed AI agents while retaining the existing training permissions.

## Redirects

CRM redirect records now apply to public GET/HEAD requests through Next's proxy and `/api/blog/redirects/resolve/`. Targets must be local public paths without query strings/fragments. Request query parameters are preserved. Redirect chains collapse to one 301; invalid records and cycles do not redirect. Trailing slash variants of old records are supported. Private routes and static assets bypass lookup. Lookup has a 1.5-second timeout and fails open during backend outages.

Changing a slug does not automatically create a redirect; add its old and new public paths in CRM → Redirecturi. Existing domain/HTTPS redirects remain the web server's responsibility.

## Verification

From `frontend`:

```text
node --test tests/seo.test.cjs
node node_modules/next/dist/bin/next build
```

The HTTP regression script requires a production build configured with `NEXT_PUBLIC_API_BASE_URL=http://localhost:8020`, and ports 8020/3040 free. It uses an isolated fixture API with 25 products and 27 articles and launches/stops its own Next server. It does not write to a database:

```text
node tests/seo-http.cjs
```

From the repository root (Windows):

```text
backend/venv/Scripts/python.exe backend/manage.py check
backend/venv/Scripts/python.exe backend/manage.py test apps.blog.tests --noinput
```

The broader shop/database tests need the local PostgreSQL service running. Existing development setup uses `docker compose -f docker-compose.dev.yml up -d`.

## After deployment

Submit the sitemap in Google Search Console and Bing Webmaster Tools, inspect representative product/category/article URLs, and validate rich results. Check actual crawler access in server/CDN logs and measure mobile Core Web Vitals. These require the deployed changes and relevant account access.

Editorial follow-up: add original customer-focused guides and photographs, and publish the studio's confirmed returns/approval policies when provided. The implementation does not invent these policies or guarantee search rankings/AI citations.
