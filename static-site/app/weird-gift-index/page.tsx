import { catalog, isFixtureRelease } from "../../lib/catalog";
import { buildSnapshotIndex, snapshotIndexSchema } from "../../lib/weird-index";
import { previewMetadata } from "../../lib/metadata";
import { JsonLd } from "../../components/JsonLd";

const index = buildSnapshotIndex(catalog);
export const metadata = previewMetadata(
  "The Weird Gift Index — snapshot sample",
  `Aggregate title analysis of ${index.totalProducts} ready records in a bounded snapshot sample, not the full production catalog.`,
  "/weird-gift-index",
  { indexable: index.totalProducts > 0, fixture: isFixtureRelease },
);
export default function WeirdIndex() {
  return (
    <main id="main" className="site-main index-report">
      <JsonLd data={snapshotIndexSchema(index)} />
      <article>
        <header className="page-heading">
          <p className="eyebrow">
            Original catalog research · Methodology {index.version}
          </p>
          <h1>The Weird Gift Index.</h1>
          <p>
            Snapshot sample: {index.totalProducts} ready{" "}
            {index.dataKind === "synthetic_fixture"
              ? "fictional examples"
              : "catalog listings"}
            . This is not the complete production catalog or a measure of
            demand.
          </p>
          <p className="quiet">
            By Cameron Ehrlich. Methodology first published July 12, 2026.
            Snapshot generated{" "}
            <time dateTime={index.generatedAt}>
              {new Date(index.generatedAt).toLocaleString("en-US", {
                timeZone: "UTC",
                dateStyle: "medium",
                timeStyle: "short",
              })}{" "}
              UTC
            </time>
            .
          </p>
        </header>
        <section className="index-scope">
          <h2>A bounded sample, not a market trend.</h2>
          <p>{index.methodology.interpretation}</p>
          <p>{index.methodology.priceLimitation}</p>
        </section>
        <section className="section-block">
          <h2>Recurring motifs.</h2>
          <p className="quiet">{index.methodology.categoryRule}</p>
          <table>
            <caption>
              Whole-word motif matches in the {index.totalProducts}-record
              snapshot sample.
            </caption>
            <thead>
              <tr>
                <th scope="col">Motif</th>
                <th scope="col">Count</th>
                <th scope="col">Share</th>
              </tr>
            </thead>
            <tbody>
              {index.motifs.map((m) => (
                <tr key={m.id}>
                  <th scope="row">{m.label}</th>
                  <td>{m.count}</td>
                  <td>{m.percentage.toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="quiet">
            Animal + explicit humor overlap:{" "}
            {index.crossovers.animalsWithHumorSignal}. Animal + bathroom-humor
            overlap: {index.crossovers.animalsWithBathroomHumor}.
          </p>
        </section>
        <section className="section-block">
          <h2>Language in the titles.</h2>
          <p>{index.methodology.analyzedField}</p>
          <table>
            <caption>
              Published humor-signal dictionary matches; zero means no matching
              title in this sample.
            </caption>
            <thead>
              <tr>
                <th scope="col">Term</th>
                <th scope="col">Count</th>
                <th scope="col">Share</th>
              </tr>
            </thead>
            <tbody>
              {index.titleSignals.map((s) => (
                <tr key={s.term}>
                  <th scope="row">{s.term}</th>
                  <td>{s.count}</td>
                  <td>{s.percentage.toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        <section className="section-block index-methodology">
          <h2>Methodology and limitations.</h2>
          <h3>Inclusion</h3>
          <p>{index.methodology.inclusion}</p>
          <h3>Classification</h3>
          <p>{index.methodology.normalization}</p>
          <p>{index.methodology.analyzedField}</p>
          <h3>Dates</h3>
          <p>{index.methodology.timestamp}</p>
          <h3>Source counts</h3>
          <p>
            {index.sourceCounts
              .map((s) => `${s.source}: ${s.count}`)
              .join("; ") || "No ready records."}
          </p>
          <h3>Published dictionaries</h3>
          {index.methodology.motifDictionaries.map((m) => (
            <details key={m.id}>
              <summary>
                {m.label} ({m.terms.length} terms)
              </summary>
              <p>{m.terms.join(", ")}</p>
            </details>
          ))}
          <details>
            <summary>
              Humor signals ({index.methodology.humorSignalTerms.length} terms)
            </summary>
            <p>{index.methodology.humorSignalTerms.join(", ")}</p>
          </details>
          <a className="button" href="/weird-gift-index/data">
            Read aggregate JSON ↗
          </a>
        </section>
        <section className="index-citation section-block">
          <h2>Suggested citation.</h2>
          <p>{index.citation}</p>
          <p>
            Stupid Gifts is operated by Thirty Seven Inc. The site may earn
            commissions from qualifying purchases. This report uses catalog
            title aggregates, not sales or commission data.
          </p>
          <p>
            Questions or corrections:{" "}
            <a href={`mailto:${index.contact}`}>{index.contact}</a>.
          </p>
        </section>
      </article>
    </main>
  );
}
