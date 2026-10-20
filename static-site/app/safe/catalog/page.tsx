export default function SafeCatalog() {
  return (
    <main id="main" className="site-main empty-state">
      <p className="eyebrow">A fresh look is due</p>
      <h1>The collection is being checked.</h1>
      <p>
        We stopped showing recommendations whose content or availability needs a
        fresh review. No stale products or offers are displayed.
      </p>
      <a className="button" href="/gift-guides">
        Read the gift guides →
      </a>
      <p className="quiet">Please check back later.</p>
    </main>
  );
}
