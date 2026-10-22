const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

for (const extension of ['.ts', '.tsx']) {
  require.extensions[extension] = (module, filename) => module._compile(ts.transpileModule(
    fs.readFileSync(filename, 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX } },
  ).outputText, filename);
}
const resolve = Module._resolveFilename;
Module._resolveFilename = function (name, ...args) {
  return resolve.call(this, name.startsWith('@/') ? path.join(__dirname, '..', name.slice(2)) : name, ...args);
};

const ProductCard = require('../components/ProductCard.tsx').default;
const Configurator = require('../app/(public)/shop/[slug]/ProductConfigurator.tsx').default;
const { CartProvider } = require('../lib/cart.tsx');
const { AppRouterContext } = require('next/dist/shared/lib/app-router-context.shared-runtime');
const product = {
  title: 'Glob personalizat', slug: 'glob', product_type: 'ornament',
  base_price_amount: 5500, show_price: true, currency: 'RON',
  short_description: '', description_text: '', description: {}, featured_image: null,
  gallery: [], variants: [], categories: [], category: null, input_fields: [],
  option_groups: [], text_pricing: null, requires_manual_approval: false,
  stock_quantity: null, availability: null, production_time_min_days: 3, production_time_max_days: 10,
};
const card = (p) => renderToStaticMarkup(React.createElement(ProductCard, { product: p }));
const detail = (p) => renderToStaticMarkup(React.createElement(
  AppRouterContext.Provider, { value: {} }, React.createElement(CartProvider, null,
    React.createElement(Configurator, { product: p, siteConfig: null })),
));

test('product cards honor price visibility for fixed and personalized prices', () => {
  assert.match(card(product), /55/);
  assert.doesNotMatch(card({ ...product, show_price: false }), /55|RON|lei/);
  assert.doesNotMatch(card({ ...product, show_price: false, product_type: 'text_by_page' }), /preț personalizat/);
});

test('product page hides both base price and option surcharges', () => {
  const options = [{ id: 1, name: 'Ambalaj', required: false, max_selections: 1,
    options: [{ id: 1, label: 'Cadou', price_delta_amount: 1700 }] }];
  assert.match(detail({ ...product, option_groups: options }), /55/);
  const hidden = detail({ ...product, show_price: false, option_groups: options });
  assert.doesNotMatch(hidden, /55|17,00|17\.00/);
  assert.match(hidden, /Cadou/);
});

test('zero stock disables ordering even with a made-to-order display setting', () => {
  const html = detail({ ...product, stock_quantity: 0, availability: { status: 'out_of_stock', label: 'Stoc epuizat', quantity: 0 } });
  assert.match(html, /<button[^>]*\sdisabled=""[^>]*>STOC EPUIZAT<\/button>/);
});

test('sold-out variant disables ordering even when the product has available stock', () => {
  const html = detail({ ...product, stock_quantity: 5,
    variants: [{ id: 1, name: 'Mic', effective_price_amount: 5500, track_stock: true, stock_quantity: 0 }] });
  assert.match(html, /<button[^>]*\sdisabled=""[^>]*>STOC EPUIZAT<\/button>/);
});

test('made-to-order products remain purchasable with no numeric stock limit', () => {
  assert.match(detail(product), /<button(?![^>]*\sdisabled=)[^>]*>ADAUGĂ ÎN COȘ<\/button>/);
});
