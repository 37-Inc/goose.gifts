-- Aggregate local allocations, not provider billing. No query/client/revision keys.
CREATE TABLE IF NOT EXISTS semantic_search_budgets (
  environment TEXT NOT NULL CHECK (environment IN ('staging','production')),
  index_scope TEXT NOT NULL CHECK (length(index_scope) BETWEEN 1 AND 64),
  utc_day TEXT NOT NULL CHECK (utc_day GLOB '????-??-??'),
  requests_reserved INTEGER NOT NULL CHECK (requests_reserved BETWEEN 1 AND 100000),
  tokens_reserved INTEGER NOT NULL CHECK (tokens_reserved BETWEEN 1 AND 100000000),
  request_cap INTEGER NOT NULL CHECK (request_cap BETWEEN 1 AND 100000),
  token_cap INTEGER NOT NULL CHECK (token_cap BETWEEN 1 AND 100000000),
  PRIMARY KEY (environment,index_scope,utc_day)
);
CREATE INDEX IF NOT EXISTS semantic_search_budget_expiry_idx ON semantic_search_budgets(utc_day);
