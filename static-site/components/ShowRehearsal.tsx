"use client";

import { useState } from "react";
import type { ReactNode } from "react";

export function ShowRehearsal({ opening, picks }: { opening: ReactNode; picks: ReactNode }) {
  const [query, setQuery] = useState("");
  const [revealed, setRevealed] = useState(false);

  return <section className="search-section" aria-label="Find a gift" id="catalog-search">
    <form className="search-form" onSubmit={(event) => {
      event.preventDefault();
      if (query.trim()) setRevealed(true);
    }}>
      <label className="sr-only" htmlFor="show-gift-query">Search gifts</label>
      <input id="show-gift-query" type="search" placeholder="Find something stupid"
        value={query} maxLength={200} onChange={(event) => setQuery(event.target.value)} />
      <button type="submit">Go</button>
      {query && <button type="button" className="clear-search" onClick={() => {
        setQuery(""); setRevealed(false);
      }}>Clear</button>}
    </form>
    <div role="status" aria-live="polite" className="search-status">
      {revealed ? "Hand-picked gifts" : ""}
    </div>
    <div hidden={revealed}>{opening}</div>
    <div hidden={!revealed}>{picks}</div>
  </section>;
}
