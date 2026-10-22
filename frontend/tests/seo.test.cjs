const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

// Run the actual TypeScript modules with the existing compiler; no extra test dependency.
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(
  fs.readFileSync(filename, 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } },
).outputText, filename);
const resolve = Module._resolveFilename;
Module._resolveFilename = function (name, ...args) {
  return resolve.call(this, name.startsWith('@/') ? path.join(__dirname, '..', name.slice(2)) : name, ...args);
};
process.env.NEXT_PUBLIC_API_BASE_URL = 'http://seo-test.invalid';
const seo = require('../lib/seo.ts');
const api = require('../lib/api.ts');
const sitemap = require('../app/sitemap.ts').default;
const realFetch = global.fetch;

const product = {
  title: 'Glob personalizat', slug: 'glob', product_type: 'ornament',
  base_price_amount: 5500, currency: 'RON', short_description: 'Glob cu nume',
  description_text: '', featured_image: null, gallery: [], variants: [],
  option_groups: [], text_pricing: null, requires_manual_approval: false,
};

test('metadata uses one brand, absolute canonicals and page-specific sharing', async () => {
  const meta = await seo.pageMetadata({ title: 'Glob — Ave Letter Studio', description: 'Un cadou', path: '/shop/glob', config: null });
  assert.equal(meta.title.absolute, 'Glob — Ave Letter Studio');
  assert.equal(meta.alternates.canonical, 'https://aveletter.ro/shop/glob');
  assert.equal(meta.twitter.title, meta.openGraph.title);
  assert.ok(meta.twitter.images[0].startsWith('https://'));
  const hidden = await seo.pageMetadata({ title: 'Articol', path: 'https://publisher.example/story', noindex: true, config: null });
  assert.equal(hidden.robots.index, false);
  assert.equal(hidden.alternates.canonical, 'https://publisher.example/story');
});

test('structured offers do not advertise text quotes, surcharges or approval-only products as fixed prices', () => {
  assert.equal(seo.productSchema(product).offers.price, '55.00');
  assert.equal(seo.productSchema({ ...product, variants: [{ effective_price_amount: 6500, track_stock: true, stock_quantity: 0 }] }).offers.price, '65.00');
  assert.equal(seo.productSchema({ ...product, product_type: 'text_by_page' }).offers, undefined);
  assert.equal(seo.productSchema({ ...product, product_type: 'custom_quote' }).offers, undefined);
  assert.equal(seo.productSchema({ ...product, base_price_amount: 0 }).offers, undefined);
  assert.equal(seo.productSchema({ ...product, requires_manual_approval: true }).offers, undefined);
  assert.equal(seo.productSchema({ ...product, show_price: false }).offers, undefined);
  assert.equal(seo.productSchema({ ...product, option_groups: [{ options: [{ price_delta_amount: 500 }] }] }).offers, undefined);
});

test('JSON-LD cannot close the script element with content from the CMS', () => {
  const json = seo.serializeJsonLd({ name: '</script><script>alert(1)</script>' });
  assert.ok(!json.includes('<'));
  assert.equal(JSON.parse(json).name, '</script><script>alert(1)</script>');
});

test('sold-out product stock overrides available variant stock in structured offers', () => {
  const soldOut = { ...product, availability: { status: 'out_of_stock' },
    variants: [{ effective_price_amount: 6500, track_stock: true, stock_quantity: 5 }] };
  assert.equal(seo.productSchema(soldOut).offers.availability, 'https://schema.org/OutOfStock');
  assert.equal(seo.productSchema({ ...product, availability: { status: 'limited' } }).offers.availability,
    'https://schema.org/InStock');
});

test('pagination has distinct canonical paths and rejects malformed page numbers', () => {
  assert.equal(seo.pageNumber(undefined), 1);
  assert.equal(seo.pageNumber('2'), 2);
  for (const input of ['0', '-1', '1.2', 'abc', ['2'], '999999999999999999']) assert.equal(seo.pageNumber(input), null);
  assert.equal(seo.paginatedPath('/blog?categorie=atelier', 2), '/blog?categorie=atelier&page=2');
  assert.equal(seo.paginatedPath('/shop?page=1', 1), '/shop');
});

test('sitemap includes records beyond page 1, excludes noindex/cross-canonical posts, and uses real modification dates', async () => {
  const products = Array.from({ length: 25 }, (_, i) => ({ ...product, slug: `product-${i}`, categories: [{ slug: 'globuri' }], updated_at: '2026-10-01T10:00:00Z' }));
  const posts = Array.from({ length: 27 }, (_, i) => ({ slug: `post-${i}`, published_at: '2026-01-01T00:00:00Z', updated_at: '2026-10-01T10:00:00Z', noindex: i === 25, canonical_url: i === 26 ? 'https://elsewhere.example/post' : '' }));
  const requested = [];
  global.fetch = async (input) => {
    const url = new URL(input); requested.push(url.pathname + url.search);
    if (url.pathname === '/api/site-config/') return Response.json({ domain: 'aveletter.ro' });
    if (url.pathname === '/api/shop/categories/') return Response.json([{ slug: 'globuri' }, { slug: 'empty' }]);
    const list = url.pathname.includes('/shop/') ? products : posts;
    const page = Number(url.searchParams.get('page') || 1);
    return Response.json({ count: list.length, next: page === 1 ? 'http://internal-host/ignored?page=2' : null, results: list.slice((page - 1) * 24, page * 24) });
  };
  try {
    const entries = await sitemap();
    const urls = entries.map((e) => e.url);
    assert.ok(urls.includes('https://aveletter.ro/shop/product-24'));
    assert.ok(urls.includes('https://aveletter.ro/blog/post-24'));
    assert.ok(!urls.includes('https://aveletter.ro/blog/post-25'));
    assert.ok(!urls.includes('https://aveletter.ro/blog/post-26'));
    assert.ok(urls.includes('https://aveletter.ro/shop/categorie/globuri'));
    assert.ok(!urls.includes('https://aveletter.ro/shop/categorie/empty'));
    assert.equal(entries.find((e) => e.url.endsWith('/product-24')).lastModified, '2026-10-01T10:00:00Z');
    assert.ok(requested.includes('/api/shop/products/?page=2'));
    assert.ok(requested.includes('/api/blog/posts/?page=2'));
  } finally { global.fetch = realFetch; }
});

test('upstream errors do not silently produce partial sitemaps', async () => {
  global.fetch = async () => new Response('Unavailable', { status: 503 });
  try { await assert.rejects(sitemap, /API error 503/); }
  finally { global.fetch = realFetch; }
});

test('empty next pages fail instead of looping forever', async () => {
  global.fetch = async () => Response.json({ count: 25, next: '?page=2', results: [] });
  try { await assert.rejects(api.getAllProducts, /Empty catalog page/); }
  finally { global.fetch = realFetch; }
});
