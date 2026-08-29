#!/usr/bin/env python3
"""Bounded G-02G-B live evidence acquisition and dual calibration."""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import os
import shutil
import subprocess
import sys
import tarfile
import tempfile
import urllib.error
import urllib.request
from pathlib import Path, PurePosixPath
from typing import Any


MDC_BASE = "https://mozilladatacollective.com/api"
ELEVENLABS_BASE = "https://api.elevenlabs.io/v1"
HTTP_USER_AGENT = "youtube-ai-factory-v2-g02gb/1 (+https://github.com/HungQuach301/youtube-ai-factory-v2)"


def canonical_bytes(value: Any) -> bytes:
    return (json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False) + "\n").encode()


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(json.dumps(value, sort_keys=True, indent=2, ensure_ascii=False).encode() + b"\n")


def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(8 * 1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def request_json(url: str, *, token: str, method: str = "GET", payload: Any | None = None) -> dict[str, Any]:
    data = None if payload is None else canonical_bytes(payload)
    request = urllib.request.Request(url, data=data, method=method)
    request.add_header("Authorization", f"Bearer {token}")
    request.add_header("User-Agent", HTTP_USER_AGENT)
    request.add_header("Accept", "application/json")
    if data is not None:
        request.add_header("Content-Type", "application/json")
    with urllib.request.urlopen(request, timeout=60) as response:
        return json.load(response)


def download_file(url: str, target: Path, max_bytes: int) -> int:
    request = urllib.request.Request(url, headers={"User-Agent": HTTP_USER_AGENT})
    total = 0
    with urllib.request.urlopen(request, timeout=120) as response, target.open("wb") as output:
        while True:
            block = response.read(8 * 1024 * 1024)
            if not block:
                break
            total += len(block)
            if total > max_bytes:
                raise RuntimeError("MDC_ARCHIVE_EXCEEDS_PINNED_MAX_BYTES")
            output.write(block)
    return total


def extract_rows(archive: Path) -> list[dict[str, str]]:
    rows: list[dict[str, str]] = []
    allowed = {"validated.tsv", "train.tsv", "dev.tsv", "test.tsv"}
    with tarfile.open(archive, "r:gz") as bundle:
        for member in bundle:
            if not member.isfile() or PurePosixPath(member.name).name not in allowed:
                continue
            extracted = bundle.extractfile(member)
            if extracted is None:
                continue
            text = extracted.read().decode("utf-8-sig", errors="strict").splitlines()
            rows.extend(dict(row) for row in csv.DictReader(text, delimiter="\t"))
    if not rows:
        raise RuntimeError("MDC_TSV_ROWS_NOT_FOUND")
    return rows


def select_candidates(rows: list[dict[str, str]], config: dict[str, Any]) -> list[dict[str, str]]:
    seed = config["dataset"]["selectionSeed"]
    candidates: list[tuple[str, dict[str, str]]] = []
    seen: set[tuple[str, str]] = set()
    for row in rows:
        path = (row.get("path") or row.get("clip") or "").strip()
        sentence = (row.get("sentence") or row.get("sentence_text") or "").strip()
        client = (row.get("client_id") or row.get("speaker_id") or path).strip()
        if not path or not sentence or len(sentence) < 20 or len(sentence) > 180:
            continue
        key = (path, sentence)
        if key in seen:
            continue
        seen.add(key)
        rank = hashlib.sha256(f"{seed}:{path}:{sentence}".encode()).hexdigest()
        candidates.append((rank, {"path": path, "sentence": sentence, "client": client}))
    candidates.sort(key=lambda item: item[0])
    selected: list[dict[str, str]] = []
    speakers: set[str] = set()
    for _, row in candidates:
        if row["client"] in speakers:
            continue
        speakers.add(row["client"])
        selected.append(row)
        if len(selected) >= config["dataset"]["candidatePoolSize"]:
            break
    if len(selected) < config["dataset"]["targetSamples"]:
        raise RuntimeError("MDC_INSUFFICIENT_UNIQUE_SPEAKERS")
    return selected


def extract_candidate_audio(archive: Path, candidates: list[dict[str, str]], target: Path) -> dict[str, Path]:
    wanted = {row["path"]: row for row in candidates}
    by_basename: dict[str, str] = {}
    for source_path in wanted:
        basename = PurePosixPath(source_path).name
        existing = by_basename.get(basename)
        if existing is not None and existing != source_path:
            raise RuntimeError("MDC_CANDIDATE_BASENAME_COLLISION")
        by_basename[basename] = source_path

    extracted: dict[str, Path] = {}
    target.mkdir(parents=True, exist_ok=True)
    with tarfile.open(archive, "r:gz") as bundle:
        for member in bundle:
            if not member.isfile():
                continue
            member_path = PurePosixPath(member.name)
            matched = member.name if member.name in wanted else by_basename.get(member_path.name)
            if matched is None or matched not in wanted or matched in extracted:
                continue
            source = bundle.extractfile(member)
            if source is None:
                continue
            safe_name = hashlib.sha256(matched.encode()).hexdigest()[:24] + Path(matched).suffix
            output = target / safe_name
            with output.open("wb") as handle:
                shutil.copyfileobj(source, handle)
            extracted[matched] = output
            if len(extracted) == len(wanted):
                break
    return extracted

def duration_seconds(path: Path) -> float:
    result = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", str(path)],
        check=True,
        capture_output=True,
        text=True,
    )
    return float(result.stdout.strip())


def levenshtein(reference: list[str], observed: list[str]) -> int:
    previous = list(range(len(observed) + 1))
    for ref_index, ref_phone in enumerate(reference, start=1):
        current = [ref_index]
        for obs_index, obs_phone in enumerate(observed, start=1):
            current.append(previous[obs_index - 1] if ref_phone == obs_phone else min(
                previous[obs_index - 1] + 1,
                previous[obs_index] + 1,
                current[obs_index - 1] + 1,
            ))
        previous = current
    return previous[-1]


def calibration(samples: list[dict[str, Any]]) -> dict[str, Any]:
    if not 10 <= len(samples) <= 15:
        return {"calibrated": False, "gateEvaluated": False, "errorFloor": None, "threshold": None, "failures": ["ALIGNER_REAL_SAMPLE_COUNT"]}
    errors = []
    total_edits = 0
    total_reference = 0
    for sample in samples:
        edits = levenshtein(sample["referencePhonemes"], sample["observedPhonemes"])
        count = len(sample["referencePhonemes"])
        total_edits += edits
        total_reference += count
        errors.append({"sampleId": sample["id"], "editCount": edits, "referenceCount": count, "phonemeErrorRate": edits / count})
    floor = total_edits / total_reference
    return {
        "calibrated": True,
        "gateEvaluated": True,
        "errorFloor": floor,
        "threshold": max(0.01, floor * 2),
        "sampleErrors": errors,
        "alignerPins": {"whisperX": "3.4.2", "montrealForcedAligner": "3.3.8"},
        "measurementMethod": "whisperx_forced_word_alignment_then_arpabet_per",
    }


def validate_production(samples: list[dict[str, Any]], human: dict[str, Any]) -> dict[str, Any]:
    if not human.get("calibrated"):
        return {"evaluated": False, "passed": False, "threshold": None, "aggregatePhonemeErrorRate": None, "failures": ["INDEPENDENT_HUMAN_CALIBRATION_REQUIRED"]}
    errors = []
    edits_total = 0
    reference_total = 0
    for sample in samples:
        edits = levenshtein(sample["referencePhonemes"], sample["observedPhonemes"])
        count = len(sample["referencePhonemes"])
        edits_total += edits
        reference_total += count
        errors.append({"sampleId": sample["id"], "editCount": edits, "referenceCount": count, "phonemeErrorRate": edits / count})
    aggregate = edits_total / reference_total
    failures = []
    if aggregate > human["threshold"]:
        failures.append("PRODUCTION_VOICE_AGGREGATE_THRESHOLD_EXCEEDED")
    if any(item["phonemeErrorRate"] > human["threshold"] for item in errors):
        failures.append("PRODUCTION_VOICE_SAMPLE_THRESHOLD_EXCEEDED")
    return {"evaluated": True, "passed": not failures, "threshold": human["threshold"], "aggregatePhonemeErrorRate": aggregate, "sampleErrors": errors, "failures": failures}


def run_observer(items: list[dict[str, Any]], output: Path, model: str) -> list[dict[str, Any]]:
    observer_input = output.parent / f"{output.stem}-input.json"
    write_json(observer_input, {"items": items})
    subprocess.run([
        sys.executable,
        "scripts/whisperx-phoneme-observer.py",
        "--input", str(observer_input),
        "--output", str(output),
        "--model", model,
    ], check=True)
    observed = json.loads(output.read_text(encoding="utf-8"))["items"]
    by_id = {item["id"]: item for item in observed}
    return [{**item, **by_id[item["id"]]} for item in items]


def generate_tts(config: dict[str, Any], key: str, output: Path) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    voice = config["productionVoice"]
    scripts = voice["scripts"]
    total_characters = sum(len(item["text"]) for item in scripts)
    if len(scripts) > voice["maxProviderCalls"] or total_characters > voice["maxTotalCharacters"]:
        raise RuntimeError("QUALIFICATION_PROVIDER_BOUND_EXCEEDED")
    output.mkdir(parents=True, exist_ok=True)
    records = []
    for item in scripts:
        url = f"{ELEVENLABS_BASE}/text-to-speech/{voice['voiceId']}?output_format={voice['outputFormat']}"
        body = canonical_bytes({"text": item["text"], "model_id": voice["modelId"], "voice_settings": voice["voiceSettings"]})
        request = urllib.request.Request(url, data=body, method="POST")
        request.add_header("xi-api-key", key)
        request.add_header("Content-Type", "application/json")
        request.add_header("Accept", "audio/mpeg")
        with urllib.request.urlopen(request, timeout=120) as response:
            audio = response.read()
        if len(audio) < 1024:
            raise RuntimeError(f"ELEVENLABS_AUDIO_TOO_SMALL:{item['id']}")
        path = output / f"{item['id']}.mp3"
        path.write_bytes(audio)
        records.append({
            "id": item["id"],
            "audioPath": str(path),
            "transcript": item["text"],
            "audioSha256": sha256_bytes(audio),
            "durationSec": duration_seconds(path),
            "provenance": "qualified_tts_validation",
            "voiceId": voice["voiceId"],
            "modelId": voice["modelId"],
            "domainTags": item["domainTags"],
        })
    return records, {"provider": "ELEVENLABS", "qualificationProviderCallCount": len(records), "totalCharacters": total_characters, "maxProviderCalls": voice["maxProviderCalls"], "maxTotalCharacters": voice["maxTotalCharacters"], "productionProviderDispatch": "OFF"}


def build_bundle(config: dict[str, Any], human_samples: list[dict[str, Any]], tts_samples: list[dict[str, Any]], usage: dict[str, Any]) -> dict[str, Any]:
    human_result = calibration(human_samples)
    production_result = validate_production(tts_samples, human_result)
    return {
        "schemaVersion": 1,
        "workPackage": "G-02G-B",
        "qualificationState": "CALIBRATION_EVIDENCE_READY" if human_result.get("calibrated") and production_result.get("passed") else "NOT_QUALIFIED",
        "productionEligible": False,
        "productionProviderDispatch": "OFF",
        "autoPublish": "OFF",
        "humanCalibration": human_result,
        "productionVoiceValidation": production_result,
        "humanSamples": human_samples,
        "productionSamples": tts_samples,
        "providerUsage": usage,
        "sourceAudioRetention": {"commonVoiceAudioRetained": False, "commonVoiceArchiveRetained": False},
    }


def write_bundle(output: Path, bundle: dict[str, Any]) -> None:
    output.mkdir(parents=True, exist_ok=True)
    write_json(output / "human-calibration.json", bundle["humanCalibration"])
    write_json(output / "production-validation.json", bundle["productionVoiceValidation"])
    write_json(output / "corpus-evidence.json", bundle["humanSamples"])
    write_json(output / "production-evidence.json", bundle["productionSamples"])
    write_json(output / "provider-usage.json", bundle["providerUsage"])
    write_json(output / "replay-input.json", bundle)
    manifest = {"schemaVersion": 1, "workPackage": "G-02G-B", "canonicalBundleSha256": sha256_bytes(canonical_bytes(bundle)), "qualificationState": bundle["qualificationState"], "productionEligible": False, "productionProviderDispatch": "OFF", "autoPublish": "OFF"}
    write_json(output / "manifest.json", manifest)


def live(config: dict[str, Any], output: Path) -> None:
    mdc_key = os.environ.get("MDC_API_KEY", "")
    eleven_key = os.environ.get("ELEVENLABS_API_KEY", "")
    if not mdc_key:
        raise RuntimeError("MDC_API_KEY_UNAVAILABLE")
    if not eleven_key:
        raise RuntimeError("ELEVENLABS_API_KEY_UNAVAILABLE")

    dataset = config["dataset"]
    try:
        session = request_json(
            f"{MDC_BASE}/datasets/{dataset['datasetId']}/download",
            token=mdc_key,
            method="POST",
        )
    except urllib.error.HTTPError as error:
        if error.code == 403:
            raise RuntimeError("MDC_DOWNLOAD_ACCESS_FORBIDDEN") from error
        raise
    download_url = session.get("downloadUrl")
    if not isinstance(download_url, str) or not download_url.startswith("https://"):
        raise RuntimeError("MDC_DOWNLOAD_URL_MISSING")

    with tempfile.TemporaryDirectory(prefix="g02gb-") as temporary:
        root = Path(temporary)
        archive = root / "common-voice.tar.gz"
        size = download_file(download_url, archive, dataset["maxArchiveBytes"])
        declared_size = int(session.get("sizeBytes") or size)
        if size != declared_size:
            raise RuntimeError("MDC_ARCHIVE_SIZE_MISMATCH")
        archive_sha = sha256_file(archive)
        declared_checksum = str(session.get("checksum") or "").removeprefix("sha256:")
        if declared_checksum and archive_sha != declared_checksum:
            raise RuntimeError("MDC_ARCHIVE_CHECKSUM_MISMATCH")

        candidates = select_candidates(extract_rows(archive), config)
        extracted = extract_candidate_audio(archive, candidates, root / "corpus-audio")
        human_items = []
        for row in candidates:
            path = extracted.get(row["path"])
            if path is None:
                continue
            duration = duration_seconds(path)
            if not 1.0 <= duration <= 12.0:
                continue
            source_hash = sha256_file(path)
            speaker = "speaker-" + hashlib.sha256(f"{dataset['datasetId']}:{row['client']}".encode()).hexdigest()[:16]
            human_items.append({
                "id": "cv-" + hashlib.sha256(row["path"].encode()).hexdigest()[:16],
                "audioPath": str(path),
                "audioSha256": source_hash,
                "transcript": row["sentence"],
                "durationSec": duration,
                "provenance": "licensed_human_corpus",
                "speakerId": speaker,
                "corpus": {"provider": "MOZILLA_DATA_COLLECTIVE", "datasetId": dataset["datasetId"], "datasetName": dataset["datasetName"], "datasetVersion": dataset["datasetVersion"], "licenseId": dataset["licenseId"], "sourceClipId": row["path"], "locale": dataset["locale"], "speakerPseudonym": speaker, "sourceAudioSha256": source_hash, "retainedSourceAudio": False},
            })
            if len(human_items) == dataset["targetSamples"]:
                break
        if len(human_items) != dataset["targetSamples"]:
            raise RuntimeError(f"MDC_QUALITY_FILTER_INSUFFICIENT_SAMPLES:{len(extracted)}:{len(human_items)}")

        observed_human = run_observer(human_items, root / "human-observed.json", config["observer"]["model"])
        human_result = calibration(observed_human)
        if not human_result.get("calibrated"):
            raise RuntimeError("INDEPENDENT_HUMAN_CALIBRATION_FAILED")

        tts_items, usage = generate_tts(config, eleven_key, output / "tts-audio")
        observed_tts = run_observer(tts_items, root / "tts-observed.json", config["observer"]["model"])

        for sample in observed_human:
            sample.pop("audioPath", None)
        for sample in observed_tts:
            sample["audioPath"] = f"tts-audio/{Path(sample['audioPath']).name}"
        bundle = build_bundle(config, observed_human, observed_tts, usage)
        write_bundle(output, bundle)


def replay(source: Path, output: Path) -> None:
    bundle = json.loads((source / "replay-input.json").read_text(encoding="utf-8"))
    for sample in bundle["productionSamples"]:
        relative = sample["audioPath"]
        actual = source / relative
        if sha256_file(actual) != sample["audioSha256"]:
            raise RuntimeError(f"TTS_REPLAY_AUDIO_HASH_MISMATCH:{sample['id']}")
        target = output / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(actual, target)
    rebuilt = build_bundle({}, bundle["humanSamples"], bundle["productionSamples"], bundle["providerUsage"])
    write_bundle(output, rebuilt)


def verify(first: Path, second: Path) -> None:
    first_manifest = json.loads((first / "manifest.json").read_text(encoding="utf-8"))
    second_manifest = json.loads((second / "manifest.json").read_text(encoding="utf-8"))
    accepted = first_manifest["canonicalBundleSha256"] == second_manifest["canonicalBundleSha256"]
    receipt = {"accepted": accepted, "replayed": True, "firstCanonicalSha256": first_manifest["canonicalBundleSha256"], "replayCanonicalSha256": second_manifest["canonicalBundleSha256"], "providerCallsDuringReplay": 0}
    write_json(first / "replay-receipt.json", receipt)
    if not accepted:
        raise RuntimeError("DUAL_CALIBRATION_REPLAY_MISMATCH")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--config")
    parser.add_argument("--output")
    parser.add_argument("--replay-from")
    parser.add_argument("--verify", nargs=2, metavar=("FIRST", "REPLAY"))
    args = parser.parse_args()
    if args.verify:
        verify(Path(args.verify[0]), Path(args.verify[1]))
        return
    if not args.output:
        parser.error("--output is required")
    output = Path(args.output)
    try:
        if args.replay_from:
            replay(Path(args.replay_from), output)
        else:
            if not args.config:
                parser.error("--config is required for live execution")
            config = json.loads(Path(args.config).read_text(encoding="utf-8"))
            live(config, output)
    except (RuntimeError, urllib.error.HTTPError, urllib.error.URLError, subprocess.CalledProcessError) as error:
        output.mkdir(parents=True, exist_ok=True)
        code = error.args[0] if isinstance(error, RuntimeError) and error.args else type(error).__name__
        if isinstance(error, urllib.error.HTTPError):
            code = f"HTTP_{error.code}"
        write_json(output / "failure.json", {"accepted": False, "errorCode": str(code), "productionEligible": False, "productionProviderDispatch": "OFF", "autoPublish": "OFF"})
        raise


if __name__ == "__main__":
    main()
