-- migrate:up

CREATE TABLE release_assessment (
  id                              TEXT PRIMARY KEY,
  package_id                      TEXT NOT NULL UNIQUE REFERENCES production_package(id),
  master_id                       TEXT NOT NULL UNIQUE REFERENCES media_master(id),
  master_sha256                   TEXT NOT NULL CHECK (
                                    length(master_sha256) = 64 AND master_sha256 NOT GLOB '*[^0-9a-f]*'),
  assurance_run_id                TEXT NOT NULL REFERENCES assurance_run(id),
  assurance_master_sha256         TEXT NOT NULL CHECK (
                                    length(assurance_master_sha256) = 64
                                    AND assurance_master_sha256 NOT GLOB '*[^0-9a-f]*'),
  reconciliation_evidence_r2_key  TEXT NOT NULL CHECK (length(trim(reconciliation_evidence_r2_key)) > 0),
  release_command_id              TEXT NOT NULL UNIQUE REFERENCES command_log(id),
  canonical_hash                  TEXT NOT NULL CHECK (
                                    length(canonical_hash) = 64 AND canonical_hash NOT GLOB '*[^0-9a-f]*'),
  released_at                     TEXT NOT NULL,
  CHECK (master_sha256 = assurance_master_sha256)
);

CREATE TRIGGER trg_release_requires_distribution_master
BEFORE INSERT ON release_assessment
BEGIN
  SELECT CASE WHEN COALESCE((
    SELECT tier FROM media_master WHERE id = NEW.master_id AND package_id = NEW.package_id
  ), '') <> 'DISTRIBUTION' THEN RAISE(ABORT, 'PUB-01: release requires the package DISTRIBUTION master') END;
  SELECT CASE WHEN COALESCE((
    SELECT file_sha256 FROM media_master WHERE id = NEW.master_id
  ), '') <> NEW.master_sha256 THEN RAISE(ABORT, 'PUB-01: release master checksum mismatch') END;
  SELECT CASE WHEN COALESCE((
    SELECT command_type FROM command_log
    WHERE id = NEW.release_command_id AND package_id = NEW.package_id
      AND actor_signature IS NOT NULL AND evidence_hash IS NOT NULL
  ), '') <> 'AUTHORIZE_RELEASE' THEN RAISE(ABORT, 'P10: release requires a signed AUTHORIZE_RELEASE command') END;
END;

CREATE TRIGGER trg_release_assessment_no_update
BEFORE UPDATE ON release_assessment
BEGIN SELECT RAISE(ABORT, 'PUB-01: release assessment is append-only'); END;

CREATE TRIGGER trg_release_assessment_no_delete
BEFORE DELETE ON release_assessment
BEGIN SELECT RAISE(ABORT, 'PUB-01: release assessment is append-only'); END;

CREATE TABLE publish_manifest (
  id                          TEXT PRIMARY KEY,
  package_id                  TEXT NOT NULL UNIQUE REFERENCES production_package(id),
  release_assessment_id       TEXT NOT NULL UNIQUE REFERENCES release_assessment(id),
  publish_command_id          TEXT NOT NULL UNIQUE REFERENCES command_log(id),
  predicted_performance_id    TEXT NOT NULL,
  metadata_json               TEXT NOT NULL CHECK (json_valid(metadata_json)),
  metadata_hash               TEXT NOT NULL CHECK (
                                length(metadata_hash) = 64 AND metadata_hash NOT GLOB '*[^0-9a-f]*'),
  thumbnail_r2_key            TEXT NOT NULL,
  thumbnail_sha256            TEXT NOT NULL CHECK (
                                length(thumbnail_sha256) = 64 AND thumbnail_sha256 NOT GLOB '*[^0-9a-f]*'),
  thumbnail_width             INTEGER NOT NULL CHECK (thumbnail_width = 1280),
  thumbnail_height            INTEGER NOT NULL CHECK (thumbnail_height = 720),
  thumbnail_rights_evidence   TEXT NOT NULL,
  thumbnail_human_evidence    TEXT NOT NULL,
  disclosure_toggle           INTEGER NOT NULL CHECK (disclosure_toggle IN (0,1)),
  auto_publish                INTEGER NOT NULL DEFAULT 0 CHECK (auto_publish = 0),
  canonical_hash              TEXT NOT NULL CHECK (
                                length(canonical_hash) = 64 AND canonical_hash NOT GLOB '*[^0-9a-f]*'),
  authorized_at               TEXT NOT NULL
);

CREATE TRIGGER trg_publish_manifest_authorization
BEFORE INSERT ON publish_manifest
BEGIN
  SELECT CASE WHEN COALESCE((
    SELECT command_type FROM command_log
    WHERE id = NEW.publish_command_id AND package_id = NEW.package_id
      AND actor_signature IS NOT NULL AND evidence_hash IS NOT NULL
  ), '') <> 'AUTHORIZE_PUBLISH' THEN RAISE(ABORT, 'P10: manifest requires a signed AUTHORIZE_PUBLISH command') END;
  SELECT CASE WHEN NEW.publish_command_id = (
    SELECT release_command_id FROM release_assessment WHERE id = NEW.release_assessment_id
  ) THEN RAISE(ABORT, 'PUB-01: release and publish commands must be distinct') END;
  SELECT CASE WHEN (
    SELECT COUNT(*) FROM predicted_performance
    WHERE id = NEW.predicted_performance_id AND package_id = NEW.package_id
      AND sealed_at IS NOT NULL
  ) = 0 THEN RAISE(ABORT, 'P9: publish blocked - no sealed prediction') END;
  SELECT CASE WHEN (
    SELECT COUNT(*) FROM policy_check WHERE package_id = NEW.package_id AND state = 'PASS'
  ) <> 8 THEN RAISE(ABORT, 'G15: publish blocked - PC1..PC8 incomplete') END;
  SELECT CASE WHEN COALESCE((
    SELECT synthetic_toggle FROM disclosure_decision WHERE package_id = NEW.package_id
  ), -1) <> NEW.disclosure_toggle THEN RAISE(ABORT, 'PC-4: upload metadata does not match disclosure decision') END;
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM channel_freeze freeze
    JOIN production_package package ON package.channel_id = freeze.channel_id
    WHERE package.id = NEW.package_id AND freeze.unfrozen_at IS NULL
  ) THEN RAISE(ABORT, 'INCIDENT: channel is frozen - publish blocked') END;
  SELECT CASE WHEN
    json_type(NEW.metadata_json, '$.title') <> 'text'
    OR json_type(NEW.metadata_json, '$.description') <> 'text'
    OR json_type(NEW.metadata_json, '$.tags') <> 'array'
    OR json_type(NEW.metadata_json, '$.categoryId') <> 'text'
    OR json_type(NEW.metadata_json, '$.privacyStatus') <> 'text'
    OR json_type(NEW.metadata_json, '$.madeForKids') NOT IN ('true','false')
    OR json_type(NEW.metadata_json, '$.syntheticDisclosure') NOT IN ('true','false')
    OR json_type(NEW.metadata_json, '$.defaultLanguage') <> 'text'
    OR json_type(NEW.metadata_json, '$.chapters') <> 'array'
  THEN RAISE(ABORT, 'PUB-01: upload metadata requires every explicit flag') END;
  SELECT CASE WHEN json_extract(NEW.metadata_json, '$.syntheticDisclosure') <> NEW.disclosure_toggle
    THEN RAISE(ABORT, 'PC-4: metadata synthetic disclosure mismatch') END;
END;

CREATE TRIGGER trg_publish_manifest_no_update
BEFORE UPDATE ON publish_manifest
BEGIN SELECT RAISE(ABORT, 'PUB-01: publish manifest is append-only'); END;

CREATE TRIGGER trg_publish_manifest_no_delete
BEFORE DELETE ON publish_manifest
BEGIN SELECT RAISE(ABORT, 'PUB-01: publish manifest is append-only'); END;

CREATE TABLE youtube_upload_session (
  id                    TEXT PRIMARY KEY,
  manifest_id           TEXT NOT NULL UNIQUE REFERENCES publish_manifest(id),
  upload_url_hash       TEXT NOT NULL CHECK (
                          length(upload_url_hash) = 64 AND upload_url_hash NOT GLOB '*[^0-9a-f]*'),
  total_bytes           INTEGER NOT NULL CHECK (total_bytes > 0),
  confirmed_bytes       INTEGER NOT NULL DEFAULT 0 CHECK (
                          confirmed_bytes >= 0 AND confirmed_bytes <= total_bytes),
  state                 TEXT NOT NULL DEFAULT 'INITIATED'
                        CHECK (state IN ('INITIATED','UPLOADING','UPLOADED','VERIFIED','FAILED')),
  created_at            TEXT NOT NULL,
  updated_at            TEXT NOT NULL
);

CREATE TRIGGER trg_upload_session_monotonic
BEFORE UPDATE ON youtube_upload_session
BEGIN
  SELECT CASE WHEN NEW.manifest_id <> OLD.manifest_id
    OR NEW.upload_url_hash <> OLD.upload_url_hash
    OR NEW.total_bytes <> OLD.total_bytes
    OR NEW.confirmed_bytes < OLD.confirmed_bytes
  THEN RAISE(ABORT, 'PUB-01: resumable upload state must be monotonic') END;
  SELECT CASE WHEN NEW.state = 'UPLOADED' AND NEW.confirmed_bytes <> NEW.total_bytes
    THEN RAISE(ABORT, 'PUB-01: UPLOADED requires every byte confirmed') END;
END;

CREATE TRIGGER trg_upload_session_no_delete
BEFORE DELETE ON youtube_upload_session
BEGIN SELECT RAISE(ABORT, 'PUB-01: upload session evidence is append-only'); END;

CREATE TABLE youtube_video_binding (
  id                            TEXT PRIMARY KEY,
  package_id                    TEXT NOT NULL UNIQUE REFERENCES production_package(id),
  upload_session_id             TEXT NOT NULL UNIQUE REFERENCES youtube_upload_session(id),
  youtube_video_id              TEXT NOT NULL UNIQUE CHECK (length(trim(youtube_video_id)) > 0),
  master_sha256                 TEXT NOT NULL CHECK (
                                  length(master_sha256) = 64 AND master_sha256 NOT GLOB '*[^0-9a-f]*'),
  verification_evidence_r2_key  TEXT NOT NULL CHECK (length(trim(verification_evidence_r2_key)) > 0),
  bound_at                      TEXT NOT NULL
);

CREATE TRIGGER trg_video_binding_requires_verified_upload
BEFORE INSERT ON youtube_video_binding
BEGIN
  SELECT CASE WHEN COALESCE((
    SELECT state FROM youtube_upload_session WHERE id = NEW.upload_session_id
  ), '') <> 'VERIFIED' THEN RAISE(ABORT, 'PUB-01: video binding requires VERIFIED upload') END;
  SELECT CASE WHEN COALESCE((
    SELECT release.master_sha256
    FROM youtube_upload_session session
    JOIN publish_manifest manifest ON manifest.id = session.manifest_id
    JOIN release_assessment release ON release.id = manifest.release_assessment_id
    WHERE session.id = NEW.upload_session_id AND manifest.package_id = NEW.package_id
  ), '') <> NEW.master_sha256 THEN RAISE(ABORT, 'PUB-01: YouTube video/master checksum mismatch') END;
END;

CREATE TRIGGER trg_video_binding_no_update
BEFORE UPDATE ON youtube_video_binding
BEGIN SELECT RAISE(ABORT, 'PUB-01: video binding is append-only'); END;

CREATE TRIGGER trg_video_binding_no_delete
BEFORE DELETE ON youtube_video_binding
BEGIN SELECT RAISE(ABORT, 'PUB-01: video binding is append-only'); END;

-- migrate:down

DROP TRIGGER trg_video_binding_no_delete;
DROP TRIGGER trg_video_binding_no_update;
DROP TRIGGER trg_video_binding_requires_verified_upload;
DROP TABLE youtube_video_binding;
DROP TRIGGER trg_upload_session_no_delete;
DROP TRIGGER trg_upload_session_monotonic;
DROP TABLE youtube_upload_session;
DROP TRIGGER trg_publish_manifest_no_delete;
DROP TRIGGER trg_publish_manifest_no_update;
DROP TRIGGER trg_publish_manifest_authorization;
DROP TABLE publish_manifest;
DROP TRIGGER trg_release_assessment_no_delete;
DROP TRIGGER trg_release_assessment_no_update;
DROP TRIGGER trg_release_requires_distribution_master;
DROP TABLE release_assessment;

-- migrate:end
