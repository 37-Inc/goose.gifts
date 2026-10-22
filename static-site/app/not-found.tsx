export default function NotFound() {
  return (
    <main id="main" className="site-main empty-state">
      <h1>That’s not in the collection.</h1>
      <p>This address does not have a page.</p>
      <a className="button" href="/">
        Browse gifts
      </a>
    </main>
  );
}
