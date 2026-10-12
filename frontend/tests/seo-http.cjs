// Requires a production build using NEXT_PUBLIC_API_BASE_URL=http://localhost:8020.
// Starts isolated fixtures on that port and a temporary Next server; never writes to a database.
const http = require('node:http');
const { spawn } = require('node:child_process');
const assert = require('node:assert/strict');
const path = require('node:path');

const image = { url: 'https://aveletter.ro/media/test.jpg', alt_text: '', width: 1000, height: 1000 };
const category = { slug: 'globuri-de-craciun', name: 'Globuri de Crăciun', description: '', image, sort_order: 0 };
const products = Array.from({ length: 25 }, (_, i) => ({
  slug: `produs-${i}`, title: `Produs ${i}`, product_type: i === 24 ? 'text_by_page' : 'ornament',
  short_description: 'Cadou personalizat', description: {}, description_text: 'Scris manual.',
  featured_image: image, gallery: [], base_price_amount: 5500, currency: 'RON',
  categories: [category], category, is_featured: i < 4, availability: null,
  variants: [], option_groups: [], input_fields: [], text_pricing: null,
  upsells: [], cross_sells: [], requires_manual_approval: false,
  production_time_min_days: 3, production_time_max_days: 10,
  seo_title: '', seo_description: '', updated_at: '2026-10-01T10:00:00Z',
}));
const posts = Array.from({ length: 27 }, (_, i) => ({
  slug: `articol-${i}`, title: `Articol ${i}`, excerpt: 'Din atelier', body: {}, body_text: 'Poveste din atelier.',
  author: { name: 'Adina Petrescu', photo: null, bio: 'Caligraf', socials: {} },
  published_at: '2026-01-01T10:00:00Z', updated_at: '2026-10-01T10:00:00Z',
  category: null, tags: [], featured_image: image, og_image: null, reading_time: 1,
  seo_title: '', seo_description: '', noindex: i === 25,
  canonical_url: i === 26 ? 'https://publisher.example/original' : '',
}));
const config = {
  domain: 'aveletter.ro', site_name: 'Ave Letter Studio', default_seo_title: '', default_seo_description: '',
  contact_email: 'adina@aveletter.ro', contact_phone: '+40746986415',
  instagram_url: '', facebook_url: '', default_og_image_url: null,
  announcement_enabled: false, announcement_text: '', maintenance_mode: false,
  delivery_fee_amount: 2000, free_shipping_threshold_amount: 30000,
  hero: {}, instagram_images: [],
};

const fixtures = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost:8020');
  let data;
  if (url.pathname === '/api/site-config/') data = config;
  else if (url.pathname === '/api/blog/redirects/resolve/') data = { new_path: ['/old-post', '/old-post.html'].includes(url.searchParams.get('path')) ? '/blog/articol-0' : null };
  else if (url.pathname === '/api/shop/categories/') data = [category];
  else if (url.pathname === '/api/blog/categories/') data = [];
  else if (['/api/shop/products/', '/api/blog/posts/'].includes(url.pathname)) {
    const items = url.pathname.includes('/shop/') ? products : posts;
    const page = Number(url.searchParams.get('page') || 1);
    if (page > Math.ceil(items.length / 24)) res.statusCode = 404;
    data = { count: items.length, next: page * 24 < items.length ? '?page=2' : null, previous: page > 1 ? '?page=1' : null, results: items.slice((page - 1) * 24, page * 24) };
  } else {
    const slug = url.pathname.split('/').filter(Boolean).at(-1);
    data = [...products, ...posts].find((item) => item.slug === slug);
    if (!data) { res.statusCode = 404; data = { detail: 'Not found' }; }
  }
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(data));
});

const base = 'http://localhost:3040';
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const get = (p) => fetch(base + p, { redirect: 'manual', headers: { 'user-agent': 'Googlebot' } });
const schemas = (html) => [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)].map((m) => JSON.parse(m[1]));

(async () => {
  await new Promise((resolve, reject) => { fixtures.once('error', reject); fixtures.listen(8020, resolve); });
  const server = spawn(process.execPath, [path.join(__dirname, '../node_modules/next/dist/bin/next'), 'start', '-p', '3040'], { cwd: path.join(__dirname, '..'), stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  let logs = '';
  server.stdout.on('data', (s) => logs += s);
  server.stderr.on('data', (s) => logs += s);
  try {
    let ready = false;
    for (let i = 0; i < 40; i++) {
      if (logs.includes('Ready')) { ready = true; break; }
      if (server.exitCode !== null) throw new Error(logs);
      await pause(250);
    }
    assert.ok(ready, logs);
    const shop = await get('/shop?page=2');
    assert.equal(shop.status, 200);
    const html = await shop.text();
    assert.match(html, /href="https:\/\/aveletter.ro\/shop\?page=2"/);
    assert.match(html, /href="\/shop\/produs-24"/);
    assert.match(html, /rel="prev"/);

    const categoryHtml = await (await get('/shop/categorie/globuri-de-craciun')).text();
    assert.match(categoryHtml, /Globuri de Crăciun personalizate prin caligrafie/);
    assert.match(categoryHtml, /href="https:\/\/aveletter.ro\/shop\/categorie\/globuri-de-craciun"/);
    assert.match(categoryHtml, /alt="foto: Produs 0"/);
    assert.match(categoryHtml, /srcSet=/i);

    const oldCategory = await get('/shop?categorie=globuri-de-craciun');
    assert.equal(oldCategory.status, 308);
    assert.equal(oldCategory.headers.get('location'), '/shop/categorie/globuri-de-craciun');
    const oldPost = await get('/old-post?utm_source=test');
    assert.equal(oldPost.status, 301);
    assert.ok(oldPost.headers.get('location').endsWith('/blog/articol-0?utm_source=test'));
    assert.equal((await get('/old-post.html')).status, 301);

    const productHtml = await (await get('/shop/produs-0')).text();
    const product = schemas(productHtml).find((s) => s['@type'] === 'Product');
    assert.equal(product.offers.price, '55.00');
    assert.equal(product.offers.priceCurrency, 'RON');
    assert.ok(schemas(productHtml).some((s) => s['@type'] === 'BreadcrumbList'));
    const quoteHtml = await (await get('/shop/produs-24')).text();
    assert.equal(schemas(quoteHtml).find((s) => s['@type'] === 'Product').offers, undefined);

    const postHtml = await (await get('/blog/articol-0')).text();
    assert.ok(schemas(postHtml).some((s) => s['@type'] === 'BlogPosting'));
    assert.match(postHtml, /property="og:image"/);
    const hidden = await (await get('/blog/articol-25')).text();
    assert.match(hidden, /name="robots" content="noindex, follow"/);
    const syndicated = await (await get('/blog/articol-26')).text();
    assert.match(syndicated, /rel="canonical" href="https:\/\/publisher.example\/original"/);

    const blogPage2 = await (await get('/blog?page=2')).text();
    assert.match(blogPage2, /href="\/blog\/articol-24"/);
    const sitemap = await (await get('/sitemap.xml')).text();
    assert.ok(sitemap.includes('/shop/produs-24'), sitemap.slice(0, 2000));
    assert.ok(sitemap.includes('/blog/articol-24'));
    assert.ok(!sitemap.includes('/blog/articol-25'));
    assert.ok(!sitemap.includes('/blog/articol-26'));
    const llms = await (await get('/llms.txt')).text();
    assert.ok(llms.includes('/shop/produs-24'));
    for (const p of ['/cart', '/checkout', '/checkout/success', '/crm/login']) {
      assert.match((await get(p)).headers.get('x-robots-tag'), /noindex/);
    }
    for (const p of ['/shop/missing', '/blog/missing', '/shop/categorie/missing', '/shop?page=0', '/shop?page=99']) {
      assert.equal((await get(p)).status, 404, p);
    }
    const home = await (await get('/')).text();
    const title = home.match(/<title>(.*?)<\/title>/)[1];
    assert.equal((title.match(/Ave Letter Studio/g) || []).length, 1);
    assert.match(await (await get('/ghid-comenzi')).text(), /20,00/);
    console.log('HTTP SEO checks passed: pagination, category redirects, CRM redirects, schemas, images, canonicals, noindex, sitemap, llms.txt, 404s, ordering guide.');
  } catch (error) {
    console.error(logs);
    throw error;
  } finally {
    server.kill();
    fixtures.closeAllConnections();
    await new Promise((resolve) => fixtures.close(resolve));
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
