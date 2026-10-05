# RODI emails

One source for every customer email. Each email is written once (`src/*.js`, using the blocks in `lib/components.js`) and built
into Liquid HTML for **es, en, fr and it**. All wording is in `src/copy.js` and must match what RODI really offers (Club features, Chapters, travel objects, Services, partner benefits); do not add perks, prices or offers that are not live in the store.

```
npm install      # once (liquidjs + sharp, dev only)
npm run build    # -> dist/<lang>/<id>.html  (Liquid kept)  +  preview/<lang>/<id>.html  (sample data)  +  manifest.json
npm run assets   # regenerates ./assets (logo, line icons, optimized photos) from the theme's images
node serve.js    # http://localhost:4281, then `node shoot.js es 680` for Edge screenshots (dev only)
```

## Who sends what (`manifest.json` has the same info)

| Email | Sender | Variables the sender must provide |
|---|---|---|
| Tu compra fue exitosa (`order-confirmation`) | **Shopify** notification "Order confirmation" | Shopify's own |
| Tu carrito sigue esperándote (`abandoned-checkout`) | **Shopify** notification "Abandoned checkout" | Shopify's own |
| Tu cuenta ya está lista (`account-ready`) | **App**, on `customers/create` (promo access granted) | `promo_months`, `access_until` |
| Bienvenido a RODI Club (`welcome-club`) | **App**, when a customer becomes a Club member | none |
| Comparte tus experiencias, Refiere a un amigo, Te extrañamos, Aprovecha esta oportunidad, Conoce los nuevos beneficios, Tenemos nuevos descuentos, Descubre los nuevos productos, Descubre el nuevo Chapter | **App**, campaigns / automations | see manifest (`products[]`, `discount_code`, `referral_code`, `chapter`, `unsubscribe_url`...) |
| Tu código de verificación (`verification-code`) | **Not deliverable**: Shopify sends the new-customer-accounts sign-in code itself and does not allow changing its design | n/a |

Marketing emails (`marketing: true`) carry an unsubscribe link (`{{ unsubscribe_url }}`) and must only go to customers who
opted in to email marketing.

## Installing the Shopify ones

Admin > Settings > Notifications > Customer notifications > open the template > replace the HTML body with
`dist/<lang>/<id>.html`, set the subject from `manifest.json`, use "Preview" and "Send test email". Shopify keeps one body per
language: the `en` file is the default and `es`/`fr`/`it` are registered as translations (translationsRegister on the EmailTemplate resource).

## Images

Static art (logo, icons, hero photos) is hosted from the theme assets (`ASSET_BASE` in `lib/theme.js`). They are stand-ins
built from the theme's existing images. When the final art arrives: drop it in `assets/` with the same names, run
`npm run assets` if it needs resizing, upload to the shop (Files), update `ASSET_BASE`, and bump `ASSET_VERSION`
(the CDN caches per URL). Product images are never static: they come from the catalog (`line | img_url` in order and cart
emails, `products[].image` in campaigns).

Text over photos sits on a translucent panel so it stays readable on any image; pass `panel: false` to `heroOverlay` once the
final art has clear space for the copy.

## Sending the app's emails (Resend)

The app (`app/emails.server.ts`, `app/resend.server.ts`) renders `dist/<lang>/<id>.html` with liquidjs and sends it through the
Resend API. Today it sends two emails: **account-ready** (automatically, from the `customers/create` webhook, once per
customer) and **welcome-club** (only from the "Send welcome email" button on Admin > Club memberships). Marketing
campaigns are not sent from the app. `EmailLog` records every send and stops duplicates.

One-time setup (done by a person, in this order):
1. Create the Resend account and add a sending domain (a subdomain such as `mail.rodiclub.com` avoids touching the SPF
   record Shopify already uses for rodiclub.com). Add the DNS records Resend shows and wait until it says "Verified".
2. Create an API key with "Sending access".
3. In EasyPanel, set these environment variables on the app and redeploy (the migration runs on start):
   - `RESEND_API_KEY`: the key (never commit it)
   - `EMAIL_FROM`: for example `RODI Club <club@mail.rodiclub.com>` (must be on the verified domain)
   - `EMAIL_REPLY_TO`: optional, defaults to `contact@rodiclub.com`
   - `EMAIL_DEFAULT_LOCALE`: optional (`es`, `en`, `fr`, `it`), used when the customer has no supported language; defaults to `en`
4. Admin > Email (Resend) shows the status and sends a test of each template to any address.

Until `RESEND_API_KEY` and `EMAIL_FROM` exist, sending is skipped (and logged); nothing breaks.
## Campaigns (Admin > Campaigns)

The 7 marketing emails (everything except Refer a friend, which has no referral feature behind it) can be sent from the app:
pick the email, fill its fields (offer text, discount code, chapter, collection...), preview, send a test to yourself, then
"Prepare campaign". Preparing snapshots the audience; nothing is sent until "Send" is pressed on the next screen, which sends
in batches of 50 with a progress counter ("Resume sending" continues after a closed tab, nobody is mailed twice).

- **Audience:** only customers whose email marketing consent in Shopify is *subscribed* (optionally only Club members), one
  email per address, each in their own language (unsupported languages get `EMAIL_DEFAULT_LOCALE`).
- **Unsubscribe:** every campaign email carries a signed link (and `List-Unsubscribe` one-click headers) to `/unsubscribe`
  on the app, which sets the customer to *unsubscribed* in Shopify and skips them in any campaign still queued.
- **Resend limits:** the free plan allows 100 emails a day and 3,000 a month. Over that, batches come back as failed and
  can be retried with "Retry failed" the next day, or move to a paid plan.
- Discount codes must already exist in Shopify Admin > Discounts; the email only displays them.