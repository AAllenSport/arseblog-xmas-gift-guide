import { test } from "node:test";
import assert from "node:assert/strict";
import { parseProduct, parseShopifyJs, shopifyJsUrl, mergeDetails, merchantFromUrl, nameFromUrl, formatPrice, shortDescription } from "../netlify/lib/parse-product.mjs";

test("Shopify-style page with JSON-LD Product", () => {
  const html = `<html><head><title>Ian Wright Arsenal Bootleg Tee – Cult Kits</title>
  <meta property="og:site_name" content="Cult Kits">
  <meta property="og:title" content="Ian Wright Arsenal Bootleg Tee">
  <meta property="og:image" content="http://www.cultkits.com/cdn/shop/files/wright.jpg?v=1">
  <script type="application/ld+json">{"@context":"https://schema.org","@type":"Product","name":"Arsenal Ian Wright Bootleg Tee",
   "description":"<p>Heavyweight tee &amp; tribute to Wrighty.</p><p>Printed in the UK.</p>",
   "image":["//www.cultkits.com/cdn/shop/files/wright.jpg?v=1","https://www.cultkits.com/cdn/shop/files/wright-back.jpg"],
   "offers":[{"@type":"Offer","price":"24.99","priceCurrency":"GBP"}],"brand":{"name":"Cult Kits"}}</script></head></html>`;
  const p = parseProduct(html, "https://www.cultkits.com/products/ian-wright-arsenal-bootleg-tee");
  assert.equal(p.name, "Arsenal Ian Wright Bootleg Tee");
  assert.equal(p.description, "Heavyweight tee & tribute to Wrighty. Printed in the UK.");
  assert.equal(p.price, "£24.99");
  assert.equal(p.merchant, "Cult Kits");
  assert.deepEqual(p.images, ["https://www.cultkits.com/cdn/shop/files/wright.jpg?v=1", "https://www.cultkits.com/cdn/shop/files/wright-back.jpg"]);
});

test("Book inside @graph with AggregateOffer", () => {
  const html = `<script type="application/ld+json">{"@graph":[{"@type":"WebPage","name":"x"},
    {"@type":["Book","Product"],"name":"Arsenal: The Inside Story","image":{"@type":"ImageObject","url":"/covers/9781037420405.jpg"},
     "offers":{"@type":"AggregateOffer","lowPrice":22,"priceCurrency":"GBP"},"description":"A book."}]}</script>`;
  const p = parseProduct(html, "https://www.hatchards.co.uk/book/arsenal/sam-dean/9781037420405");
  assert.equal(p.name, "Arsenal: The Inside Story");
  assert.equal(p.price, "£22");
  assert.deepEqual(p.images, ["https://www.hatchards.co.uk/covers/9781037420405.jpg"]);
  assert.equal(p.merchant, "Hatchards");
});

test("Open Graph only, title suffix removed, entities decoded", () => {
  const html = `<title>Clock End Print | Ground Designs</title>
  <meta property="og:title" content="&#39;Clock End&#39; Minimalist Arsenal Print | Ground Designs">
  <meta name="description" content="A minimalist print of the Clock End.">
  <meta property="og:image" content="https://cdn.example.com/a.jpg">
  <meta property="product:price:amount" content="30.00"><meta property="product:price:currency" content="GBP">`;
  const p = parseProduct(html, "https://www.notonthehighstreet.com/grounddesigns/product/clock-end-print");
  assert.equal(p.name, "'Clock End' Minimalist Arsenal Print");
  assert.equal(p.description, "A minimalist print of the Clock End.");
  assert.equal(p.price, "£30");
  assert.equal(p.merchant, "Not On The High Street");
});

test("Broken page falls back to the link", () => {
  const p = parseProduct("<html><body>Access denied</body></html>", "https://www.amazon.co.uk/Arsenal-Inside-Story-Rebirth-Arteta/dp/1037420405");
  assert.equal(p.name, "Arsenal Inside Story Rebirth Arteta");
  assert.equal(p.merchant, "Amazon");
  assert.deepEqual(p.images, []);
});

test("Malformed JSON-LD is skipped, not fatal", () => {
  const html = `<script type="application/ld+json">{ not json </script><meta property="og:title" content="Scarf">`;
  assert.equal(parseProduct(html, "https://shop.example.co.uk/scarf").name, "Scarf");
});

test("Shopify .js JSON", () => {
  assert.equal(shopifyJsUrl("https://www.cultkits.com/collections/arsenal/products/ian-wright-arsenal-bootleg-tee?variant=1"),
    "https://www.cultkits.com/products/ian-wright-arsenal-bootleg-tee.js");
  assert.equal(shopifyJsUrl("https://www.hatchards.co.uk/book/x"), null);
  const s = parseShopifyJs({ title: "Highbury", description: "<p>Pen and ink.</p>", images: ["//cdn.shopify.com/a.jpg", "//cdn.shopify.com/b.jpg"], price: 3500 }, "https://www.stavesart.com/products/highbury");
  assert.deepEqual(s, { name: "Highbury", description: "Pen and ink.", images: ["https://cdn.shopify.com/a.jpg", "https://cdn.shopify.com/b.jpg"], price: "£35" });
  const merged = mergeDetails({ name: "Highbury (2021)", description: "", images: ["https://cdn.shopify.com/a.jpg"], price: "", merchant: "StavesArt" }, s);
  assert.equal(merged.name, "Highbury (2021)");
  assert.equal(merged.images.length, 2);
  assert.equal(merged.price, "£35");
});

test("Helpers", () => {
  assert.equal(merchantFromUrl("https://shop.goonerprints.co.uk/x"), "Goonerprints");
  assert.equal(merchantFromUrl("https://www.some-shop.com/x"), "Some Shop");
  assert.equal(nameFromUrl("https://britishmade.gifts/products/arsenal-fc-back-of-shirt-santa-sack"), "Arsenal FC Back Of Shirt Santa Sack");
  assert.equal(formatPrice("12.5", "GBP"), "£12.50");
  assert.equal(formatPrice("0", "GBP"), "");
  assert.equal(formatPrice(20, "USD"), "$20");
  const long = "First sentence is here. ".repeat(20);
  assert.ok(shortDescription(long).length <= 300);
  assert.ok(shortDescription(long).endsWith("."));
});
