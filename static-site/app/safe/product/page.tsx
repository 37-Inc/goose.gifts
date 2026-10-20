export default function SafeProduct() {
  return (
    <main id="main" className="site-main empty-state">
      <p className="eyebrow">Selection paused</p>
      <h1>This one needs a fresh look.</h1>
      <p>
        We are not displaying expired product content, imagery, prices or
        availability. Browse the rest of the collection while we check it.
      </p>
      <a className="button" href="/gifts">
        Back to the collection →
      </a>
    </main>
  );
}
