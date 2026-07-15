# Affiliate Data Availability

Last audited: 2026-07-15

## Current production path

- All 3,280 pre-run catalog products were Amazon products.
- Amazon deprecated the configured PA-API endpoint on 2026-07-15. Both
  `GetItems` and `SearchItems` now return 403 with an instruction to migrate to
  Creators API.
- Daily discovery now degrades to Google CSE metadata, preserves canonical
  Associate-tagged Amazon links, and skips candidates without usable images.
  PA-API revalidation stops without deactivating products while migration is
  pending. Price and remote-product freshness coverage will remain weaker.
- Creators API requires an Associates Central application and new credentials.
  Those account changes are owner-only; once supplied, code migration can be
  completed and verified against the new API.
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
