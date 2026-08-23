-- migrate:up
CREATE TABLE source (
  id TEXT PRIMARY KEY,
  package_id TEXT NOT NULL REFERENCES production_package(id),
  url TEXT NOT NULL,
  tier INTEGER NOT NULL CHECK (tier IN (1,2,3,4)),
  fetched_at TEXT NOT NULL,
  snapshot_r2_key TEXT NOT NULL,
  content_hash TEXT NOT NULL CHECK (length(content_hash) = 64)
);

CREATE TABLE claim (
  id TEXT PRIMARY KEY,
  package_id TEXT NOT NULL REFERENCES production_package(id),
  claim_type TEXT NOT NULL CHECK (claim_type IN ('FACT','ESTIMATE','MECHANISM','INTERPRETATION','PREDICTION')),
  text TEXT NOT NULL,
  criticality TEXT NOT NULL CHECK (criticality IN ('CRITICAL','NORMAL','SUPPORTING')),
  numeric_json TEXT,
  as_of_date TEXT,
  jurisdiction TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE claim_source (
  claim_id TEXT NOT NULL REFERENCES claim(id),
  source_id TEXT NOT NULL REFERENCES source(id),
  role TEXT NOT NULL CHECK (role IN ('PRIMARY','SUPPORTING','LOCATING')),
  PRIMARY KEY (claim_id, source_id)
);

CREATE TRIGGER trg_critical_claim_source_tier
BEFORE INSERT ON claim_source
WHEN NEW.role = 'PRIMARY'
BEGIN
  SELECT CASE WHEN (
    (SELECT criticality FROM claim WHERE id = NEW.claim_id) = 'CRITICAL'
    AND (SELECT tier FROM source WHERE id = NEW.source_id) > 2
  ) THEN RAISE(ABORT, 'TRU-01: CRITICAL claim requires T1/T2 primary source') END;
END;

CREATE TABLE contradiction (
  id TEXT PRIMARY KEY,
  claim_a TEXT NOT NULL REFERENCES claim(id),
  claim_b TEXT NOT NULL REFERENCES claim(id),
  resolution_state TEXT NOT NULL DEFAULT 'OPEN'
    CHECK (resolution_state IN ('OPEN','RESOLVED_A','RESOLVED_B','BOTH_QUALIFIED','UNRESOLVABLE'))
);

CREATE TABLE terminology (
  id TEXT PRIMARY KEY,
  package_id TEXT NOT NULL REFERENCES production_package(id),
  term TEXT NOT NULL,
  plain_meaning TEXT NOT NULL,
  institutional_role TEXT,
  ipa TEXT NOT NULL,
  arpabet TEXT NOT NULL
);

-- migrate:down
DROP TABLE terminology;
DROP TABLE contradiction;
DROP TRIGGER trg_critical_claim_source_tier;
DROP TABLE claim_source;
DROP TABLE claim;
DROP TABLE source;
-- migrate:end
