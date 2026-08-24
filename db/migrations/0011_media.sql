-- 0011_media.sql — MED-01..06 control-side production records
-- migrate:up

CREATE TABLE media_license_record (
  id                         TEXT PRIMARY KEY,
  provider                   TEXT NOT NULL CHECK (length(trim(provider)) > 0),
  license_type               TEXT NOT NULL CHECK (length(trim(license_type)) > 0),
  license_url                TEXT NOT NULL CHECK (length(trim(license_url)) > 0),
  monetization_allowed       INTEGER NOT NULL CHECK (monetization_allowed IN (0,1)),
  content_id_clearance       INTEGER NOT NULL CHECK (content_id_clearance IN (0,1)),
  territory                  TEXT NOT NULL CHECK (length(trim(territory)) > 0),
  duration_rights            TEXT NOT NULL CHECK (length(trim(duration_rights)) > 0),
  contract_sha256            TEXT NOT NULL CHECK (length(contract_sha256) = 64 AND contract_sha256 NOT GLOB '*[^0-9a-f]*'),
  verified_at                TEXT NOT NULL
);

CREATE TABLE media_asset (
  id                         TEXT PRIMARY KEY,
  package_id                 TEXT NOT NULL REFERENCES production_package(id),
  shot_id                    TEXT REFERENCES shot(id),
  provider_asset_id          TEXT,
  r2_key                     TEXT NOT NULL UNIQUE,
  content_sha256             TEXT NOT NULL CHECK (length(content_sha256) = 64 AND content_sha256 NOT GLOB '*[^0-9a-f]*'),
  source_fps                 REAL NOT NULL CHECK (source_fps IN (24,25,30,50,60)),
  width                      INTEGER NOT NULL CHECK (width >= 1920),
  height                     INTEGER NOT NULL CHECK (height >= 1080),
  conversion_method          TEXT NOT NULL,
  license_record_id          TEXT NOT NULL REFERENCES media_license_record(id),
  provenance_snapshot_ref    TEXT NOT NULL,
  phash                      TEXT,
  acquired_at                TEXT NOT NULL
);

CREATE TRIGGER trg_media_asset_requires_commercial_rights
BEFORE INSERT ON media_asset
BEGIN
  SELECT CASE WHEN COALESCE((
    SELECT monetization_allowed FROM media_license_record WHERE id = NEW.license_record_id
  ), 0) <> 1 THEN RAISE(ABORT, 'MED-01: asset requires monetization rights') END;
END;

CREATE TABLE media_composition (
  id                    TEXT PRIMARY KEY,
  shot_id               TEXT NOT NULL REFERENCES shot(id),
  variant               INTEGER NOT NULL CHECK (variant > 0),
  engine                TEXT NOT NULL CHECK (engine IN ('RENDER_ONCE_FFMPEG','HEADLESS_CHROMIUM','RENDER_PER_FRAME')),
  scene_graph_json      TEXT NOT NULL CHECK (json_valid(scene_graph_json)),
  r2_key                TEXT NOT NULL UNIQUE,
  content_sha256        TEXT NOT NULL CHECK (length(content_sha256) = 64 AND content_sha256 NOT GLOB '*[^0-9a-f]*'),
  is_champion           INTEGER NOT NULL DEFAULT 0 CHECK (is_champion IN (0,1)),
  UNIQUE (shot_id, variant)
);

CREATE TABLE media_audio_section (
  id                    TEXT PRIMARY KEY,
  package_id            TEXT NOT NULL REFERENCES production_package(id),
  seq                   INTEGER NOT NULL CHECK (seq >= 0),
  text                  TEXT NOT NULL,
  previous_context      TEXT NOT NULL,
  next_context          TEXT NOT NULL,
  voice_settings_hash   TEXT NOT NULL CHECK (length(voice_settings_hash) = 64 AND voice_settings_hash NOT GLOB '*[^0-9a-f]*'),
  UNIQUE (package_id, seq)
);

CREATE TABLE media_audio_take (
  id                       TEXT PRIMARY KEY,
  section_id               TEXT NOT NULL REFERENCES media_audio_section(id),
  provider_request_id      TEXT NOT NULL,
  r2_key                   TEXT NOT NULL UNIQUE,
  alignment_evidence_ref   TEXT NOT NULL,
  phoneme_mismatch_rate    REAL CHECK (phoneme_mismatch_rate >= 0),
  seam_score               REAL,
  is_champion              INTEGER NOT NULL DEFAULT 0 CHECK (is_champion IN (0,1))
);

CREATE TABLE media_cue (
  id                    TEXT PRIMARY KEY,
  package_id            TEXT NOT NULL REFERENCES production_package(id),
  kind                  TEXT NOT NULL CHECK (kind IN ('MUSIC','SFX','AMBIENCE','SILENCE')),
  t_ms                  INTEGER NOT NULL CHECK (t_ms >= 0),
  function              TEXT NOT NULL,
  asset_id              TEXT REFERENCES media_asset(id)
);

CREATE TRIGGER trg_media_cue_requires_asset
BEFORE INSERT ON media_cue
WHEN (NEW.kind = 'SILENCE' AND NEW.asset_id IS NOT NULL)
  OR (NEW.kind <> 'SILENCE' AND NEW.asset_id IS NULL)
BEGIN SELECT RAISE(ABORT, 'MED-04: cue asset/license mismatch'); END;

CREATE TABLE media_edit_timeline (
  id                    TEXT PRIMARY KEY,
  package_id            TEXT NOT NULL UNIQUE REFERENCES production_package(id),
  canonical_duration_ms INTEGER NOT NULL CHECK (canonical_duration_ms > 0),
  otio_json             TEXT NOT NULL CHECK (json_valid(otio_json)),
  canonical_hash        TEXT NOT NULL CHECK (length(canonical_hash) = 64 AND canonical_hash NOT GLOB '*[^0-9a-f]*'),
  sealed_at             TEXT NOT NULL
);

CREATE TABLE media_caption_event (
  id                     TEXT PRIMARY KEY,
  timeline_id            TEXT NOT NULL REFERENCES media_edit_timeline(id),
  seq                    INTEGER NOT NULL CHECK (seq >= 0),
  t_start_ms             INTEGER NOT NULL CHECK (t_start_ms >= 0),
  t_end_ms               INTEGER NOT NULL CHECK (t_end_ms > t_start_ms),
  text                   TEXT NOT NULL,
  alignment_evidence_ref TEXT NOT NULL,
  UNIQUE (timeline_id, seq)
);

CREATE TABLE media_master (
  id                       TEXT PRIMARY KEY,
  package_id               TEXT NOT NULL REFERENCES production_package(id),
  tier                     TEXT NOT NULL CHECK (tier IN ('ARCHIVAL','DISTRIBUTION')),
  derived_from_master_id   TEXT REFERENCES media_master(id),
  r2_key                   TEXT NOT NULL UNIQUE,
  drive_file_id            TEXT NOT NULL,
  file_sha256              TEXT NOT NULL CHECK (length(file_sha256) = 64 AND file_sha256 NOT GLOB '*[^0-9a-f]*'),
  stream_framemd5          TEXT NOT NULL CHECK (length(trim(stream_framemd5)) > 0),
  video_codec              TEXT NOT NULL,
  audio_codec              TEXT NOT NULL,
  duration_ms              INTEGER NOT NULL CHECK (duration_ms > 0),
  fps                      REAL NOT NULL CHECK (fps = 30),
  probe_json               TEXT NOT NULL CHECK (json_valid(probe_json)),
  sealed_at                TEXT NOT NULL,
  UNIQUE (package_id, tier)
);

CREATE TRIGGER trg_distribution_requires_archival_media
BEFORE INSERT ON media_master
WHEN NEW.tier = 'DISTRIBUTION'
BEGIN
  SELECT CASE WHEN NEW.derived_from_master_id IS NULL
    OR COALESCE((SELECT tier FROM media_master WHERE id = NEW.derived_from_master_id), '') <> 'ARCHIVAL'
    OR COALESCE((SELECT package_id FROM media_master WHERE id = NEW.derived_from_master_id), '') <> NEW.package_id
    THEN RAISE(ABORT, 'MED-06: DISTRIBUTION master requires sealed ARCHIVAL parent') END;
END;

CREATE TRIGGER trg_media_master_immutable_update
BEFORE UPDATE ON media_master
BEGIN SELECT RAISE(ABORT, 'MED-06: sealed master is immutable'); END;

CREATE TRIGGER trg_media_master_immutable_delete
BEFORE DELETE ON media_master
BEGIN SELECT RAISE(ABORT, 'MED-06: sealed master is immutable'); END;

-- migrate:down
DROP TRIGGER trg_media_master_immutable_delete;
DROP TRIGGER trg_media_master_immutable_update;
DROP TRIGGER trg_distribution_requires_archival_media;
DROP TABLE media_master;
DROP TABLE media_caption_event;
DROP TABLE media_edit_timeline;
DROP TRIGGER trg_media_cue_requires_asset;
DROP TABLE media_cue;
DROP TABLE media_audio_take;
DROP TABLE media_audio_section;
DROP TABLE media_composition;
DROP TRIGGER trg_media_asset_requires_commercial_rights;
DROP TABLE media_asset;
DROP TABLE media_license_record;
-- migrate:end
