# Arseblog Christmas Gift Guide

A small standalone website. The public page shows gift cards in six sections. The admin page lets editors paste a product link and get a finished card: name, photos, description, price and shop are read from the shop's page, then you check them and press Save.

- Public guide: `https://YOUR-SITE/`
- Admin: `https://YOUR-SITE/admin` (password protected)

It runs on **Netlify** (free plan is enough). There is no database to set up: gifts and photos are kept in Netlify's built-in storage.

---

## 1. Put it online (about 15 minutes, once)

You need a free Netlify account and a free GitHub account.

1. **Upload the code to GitHub.** On github.com choose **New repository**, name it `arseblog-gift-guide`, keep it private, and create it. On the empty repository page choose **uploading an existing file** and drag in everything from this folder (not the `node_modules` folder if you have one). Commit.
2. **Connect it to Netlify.** On app.netlify.com choose **Add new project → Import an existing project → GitHub**, then pick `arseblog-gift-guide`. Netlify reads the settings from `netlify.toml`, so leave the build settings as they are and choose **Deploy**.
3. **Set the admin password.** In the new project go to **Project configuration → Environment variables → Add a variable**. Key: `ADMIN_PASSWORD`. Value: a long password (at least 8 characters, ideally a passphrase). Make sure the **Functions** scope is ticked. Save.
4. **Redeploy** so the password takes effect: **Deploys → Trigger deploy → Deploy project**.
5. Open `https://<your-project>.netlify.app/admin`, sign in, and add your first gift.

> Netlify's "drag a folder onto the page" deploy won't work for this site, because it skips the server code that reads shop pages. Use GitHub as above, or the command line option below.

**Command line alternative** (if you have Node.js installed):

```bash
npm install
npx netlify-cli login
npx netlify-cli deploy --prod      # first time: choose "Create & configure a new project"
npx netlify-cli env:set ADMIN_PASSWORD "your-long-password"
npx netlify-cli deploy --prod      # again, so the password is picked up
```

## 2. Use your own address (optional)

To serve it at `giftguide.arseblog.com`: in Netlify go to **Domain management → Add a domain**, enter the address, and follow the instructions. You'll add one CNAME record wherever arseblog.com's DNS is managed, pointing `giftguide` at `<your-project>.netlify.app`. Netlify adds the HTTPS certificate automatically.

## 3. Adding gifts

1. Go to `/admin` and sign in.
2. Paste a product link, choose a section and press **Fetch details**.
3. Check the form. Fix the name or description if needed, star the photo you want as the cover, remove any you don't want, or add your own by dragging, pasting or choosing a file.
4. Leave **Show on the guide** ticked and press **Save gift**.

The photos are copied onto the site when you save, so cards never break if a shop renames its images.

On each card in the admin page you can **Edit**, move it earlier or later (↑ ↓), **Hide** it (it becomes a draft only editors see) or **Delete** it.

**Refresh from link** (inside Edit) re-reads the shop page. It adds any new photos, updates the price, and fills in the name, shop or description only if those are empty, so your own wording is kept.

### When a shop won't cooperate

Most shops publish their product details for Google, which is what this reads. Shopify shops (Cult Kits, StavesArt and many independent makers) work especially well. A few big shops, **Amazon** in particular, block automatic reading. You'll see a yellow note saying so; the shop name and a rough product name are still filled in, and you add the photo and description yourself. For books, a Waterstones, Hatchards or Bookshop.org link usually works better than Amazon.

### Prices in other currencies

The site's server is in the US, so some shops show it US prices. When reading a page it asks for UK prices (this works for Shopify shops), and if a price still comes back in dollars, euros or anything else, a yellow note in the form tells you to check the UK price before saving. **Refresh from link** never replaces a price you've typed with a non-pound one.

### Buy now clicks

The admin page shows how many times readers pressed **Buy now**: totals for all time, the last 7 days and today, a top-five list, and a count on each gift card. Press **Refresh** for the latest numbers. A click is counted once per gift per browser per day. It's anonymous (no cookies, no personal data), bots are ignored, and editors' own clicks on the public page count too.

### Price filter

Readers can filter the guide by budget: Any price, Under £15, £15–£40, £40 and up. It reads the number from each gift's Price field, so "£24.99" and "From £35" both work. Gifts with no price only appear under "Any price". To change the bands, edit `PRICE_BANDS` at the top of `public/assets/cards.js`.

### Sharing image

When the guide is shared on social media or in messaging apps, it shows `public/og-image.jpg` (1200 × 630): the crest on red with the title in Oswald. Sites can only fetch it once the site is public. If you add a custom domain, the sharing links switch to it automatically on the next deploy.

## 4. Changing the look and words

| What | Where |
| --- | --- |
| Colours | Top of `public/assets/style.css` (the `--red`, `--ink` etc. lines) |
| Fonts | Oswald (headings) and Open Sans (text), loaded from Google Fonts at the top of `index.html` and `admin.html`; set in `--display` and `--body` in `style.css` |
| Crest | `public/assets/brand/crest.webp` and `crest.png` (made from the Arseblog shield PSD). Browser icons are `public/favicon*.png` and `apple-touch-icon.png` |
| Heading, intro text, footer | `public/index.html` |
| Section names and order | The `SECTIONS` list at the top of `public/assets/cards.js`. To add a new section, also add its id to `SECTIONS` in `netlify/lib/parse-product.mjs` |
| Price filter bands | `PRICE_BANDS` at the top of `public/assets/cards.js` |
| Sharing image | Replace `public/og-image.jpg` (1200 × 630) |
| Example gifts loaded on first run | `netlify/lib/seed.mjs` (they only load once; after that, use the admin page) |

Commit the change on GitHub and Netlify redeploys in about a minute.

## 5. Good to know

- **Speed:** the public gift list is cached on Netlify's network, so a traffic spike from the blog costs almost nothing. Saving in the admin clears the cache; worst case the public page catches up within 5 minutes.
- **One shared password.** Anyone with it can edit. Change it any time in Netlify's environment variables, then redeploy.
- **Two editors at once:** if two people save at the same moment, the later save wins. Fine for a small team; just avoid editing the same gift together.
- **Limits:** 6 photos per gift; uploads over 1.5 MB are shrunk in the browser before upload.

## 6. For developers

```bash
npm install
npm run dev          # http://localhost:8888, admin password "localpassword", data in .data/
npm test             # product-page parser tests
npm run test:e2e     # full API run against a pretend shop
```

Layout:

```
public/                    static pages (index.html, admin.html, assets/)
netlify/functions/         server endpoints
  items.mjs                GET  /api/items            public list (edge cached, tag "gift-items")
  admin-items.mjs          GET/POST/PUT/DELETE/PATCH /api/admin/items
  fetch-product.mjs        POST /api/admin/fetch      link → card details
  click.mjs                POST /api/click            count a Buy now press
  admin-clicks.mjs         GET  /api/admin/clicks     click counts for editors
  upload.mjs               POST /api/admin/upload     editor photo upload
  img.mjs                  GET  /img/:key             stored photos
netlify/lib/
  parse-product.mjs        JSON-LD / Open Graph / Shopify parsing
  items.mjs                validation, storage, photo copying
  runtime.mjs              auth, storage switch (Netlify Blobs or local folder), fetch helpers
```

Admin requests send the password as `Authorization: Bearer <password>`.
