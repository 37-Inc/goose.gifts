# Affiliate Data Availability

Last audited: 2026-07-10

## Current production path

- All 3,269 catalog products are Amazon products.
- Amazon PA-API credentials and the Associate tag are configured and daily
  discovery succeeds.
- The live PA-API path returns titles, images, and tagged links, but offer price
  is frequently absent. On the audit date, 3,252 active products had unknown
  prices and a fresh dry-run candidate also returned no price.
- PA-API is a retail product-advertising API. It does not expose the Associates
  earnings, orders, shipped revenue, or commission reports needed for EPC
  optimization.

## Amazon Associates reporting

Amazon provides orders and earnings through Associates Central reports and
manual CSV/XLSX/XML downloads. There is no configured API credential for those
reports, and neither the in-app browser nor Chrome had an authenticated
Associates Central session during this audit.

This is an operational limitation, not a standing owner task. Keep optimizing
against attributable outbound clicks. Reopen revenue ingestion only if Amazon
adds a supported reporting API or a report export is deliberately provided.

References:
- https://affiliate-program.amazon.com/help/node/topic/GMWAK55DQX8JEK7C
- https://affiliate-program.amazon.com/help/node/topic/GQ5FS7J76MT59WLW

## Awin

Awin supports publisher transaction reporting through a Bearer token and
publisher ID. Neither `AWIN_API_TOKEN` nor `AWIN_PUBLISHER_ID` exists in the
production environment, Keychain, or the local operator config stores. The
production catalog currently contains no Etsy/Awin products, so Awin reporting
would not explain current goose.gifts revenue.

Do not list Awin access as an owner blocker until goose.gifts deliberately
joins/configures an Awin publisher account and begins serving Awin affiliate
links.

References:
- https://help.awin.com/apidocs/api-authentication
- https://success.awin.com/articles/en_US/Knowledge/Publisher-API-GET-transactions-list
