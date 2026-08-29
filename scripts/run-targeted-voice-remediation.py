#!/usr/bin/env python3
"""Bounded G-02H-B replacement for the sole semantic-replay residual."""

from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import os
import shutil
import subprocess
import sys
import tempfile
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any


ELEVENLABS_BASE = "https://api.elevenlabs.io/v1"
HTTP_USER_AGENT = "youtube-ai-factory-v2-g02hb/1 (+https://github.com/HungQuach301/youtube-ai-factory-v2)"
PROVIDER_CALLS_ATTEMPTED = 0


def canonical_bytes(value: Any) -> bytes:
    return (json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False) + "\n").encode()


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(json.dumps(value, sort_keys=True, indent=2, ensure_ascii=False).encode() + b"\n")


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def verify_checksums(source: Path, expected_count: int) -> None:
    lines = [line for line in (source / "artifact-sha256s.txt").read_text(encoding="utf-8").splitlines() if line.strip()]
    if len(lines) != expected_count:
        raise RuntimeError(f"SOURCE_CHECKSUM_ENTRY_COUNT:{len(lines)}")
    root = source.resolve()
    for line in lines:
        digest, relative = line.split("  ", 1)
        candidate = (source / relative.removeprefix("./")).resolve()
        if root not in candidate.parents:
            raise RuntimeError("SOURCE_CHECKSUM_PATH_ESCAPE")
        if sha256_file(candidate) != digest:
            raise RuntimeError(f"SOURCE_CHECKSUM_MISMATCH:{relative}")


def require_manifest(source: Path, expected_hash: str) -> None:
    manifest = json.loads((source / "manifest.json").read_text(encoding="utf-8"))
    if manifest["canonicalBundleSha256"] != expected_hash:
        raise RuntimeError("SOURCE_CANONICAL_HASH_MISMATCH")


def duration_seconds(path: Path) -> float:
    result = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", str(path)],
        check=True,
        capture_output=True,
        text=True,
    )
    return float(result.stdout.strip())


def load_normalizer() -> Any:
    path = Path("scripts/replay-semantic-normalization.py")
    spec = importlib.util.spec_from_file_location("g02h_semantic_normalizer", path)
    if spec is None or spec.loader is None:
        raise RuntimeError("SEMANTIC_NORMALIZER_LOAD_FAILED")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def generate_replacement(config: dict[str, Any], key: str, output: Path) -> dict[str, Any]:
    global PROVIDER_CALLS_ATTEMPTED
    replacement = config["replacement"]
    text = replacement["text"]
    if replacement["maxProviderCalls"] != 1 or len(text) > replacement["maxTotalCharacters"]:
        raise RuntimeError("TARGETED_PROVIDER_BOUND_EXCEEDED")
    body = canonical_bytes({
        "text": text,
        "model_id": replacement["modelId"],
        "voice_settings": replacement["voiceSettings"],
    })
    url = f"{ELEVENLABS_BASE}/text-to-speech/{replacement['voiceId']}?output_format={replacement['outputFormat']}"
    request = urllib.request.Request(url, data=body, method="POST")
    request.add_header("xi-api-key", key)
    request.add_header("User-Agent", HTTP_USER_AGENT)
    request.add_header("Content-Type", "application/json")
    request.add_header("Accept", "audio/mpeg")
    PROVIDER_CALLS_ATTEMPTED += 1
    with urllib.request.urlopen(request, timeout=120) as response:
        audio = response.read()
    if len(audio) < 1024:
        raise RuntimeError("TARGETED_REPLACEMENT_AUDIO_TOO_SMALL")
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_bytes(audio)
    return {
        "id": replacement["id"],
        "replacesSampleId": replacement["replacesSampleId"],
        "audioPath": str(output),
        "audioSha256": hashlib.sha256(audio).hexdigest(),
        "durationSec": duration_seconds(output),
        "transcript": text,
        "voiceId": replacement["voiceId"],
        "modelId": replacement["modelId"],
        "domainTags": replacement["domainTags"],
        "provenance": "qualified_tts_targeted_remediation",
    }


def observe(config: dict[str, Any], item: dict[str, Any], temporary: Path) -> dict[str, Any]:
    input_path = temporary / "observer-input.json"
    output_path = temporary / "observer-output.json"
    write_json(input_path, {"items": [item]})
    subprocess.run([
        sys.executable,
        "scripts/whisperx-phoneme-observer.py",
        "--input", str(input_path),
        "--output", str(output_path),
        "--model", config["observer"]["model"],
    ], check=True)
    observed = json.loads(output_path.read_text(encoding="utf-8"))["items"]
    if len(observed) != 1 or observed[0]["id"] != item["id"]:
        raise RuntimeError("TARGETED_OBSERVER_OUTPUT_INVALID")
    return {**item, **observed[0]}


def validate_replacement(config: dict[str, Any], observed: dict[str, Any], threshold: float) -> dict[str, Any]:
    normalizer = load_normalizer()
    from g2p_en import G2p
    g2p = G2p()
    reference_text = normalizer.normalize_text(observed["transcript"])
    observed_text = normalizer.normalize_text(observed["observedTranscript"])
    reference = normalizer.phonemes(g2p, reference_text)
    hypothesis = normalizer.phonemes(g2p, observed_text)
    edits = normalizer.levenshtein(reference, hypothesis)
    rate = edits / len(reference)
    return {
        "sampleId": config["replacement"]["id"],
        "replacesSampleId": config["replacement"]["replacesSampleId"],
        "referenceTranscript": observed["transcript"],
        "observedTranscript": observed["observedTranscript"],
        "normalizedReference": reference_text,
        "normalizedObserved": observed_text,
        "normalizedEditCount": edits,
        "normalizedReferenceCount": len(reference),
        "normalizedPhonemeErrorRate": rate,
        "state": "PASS" if rate <= threshold else "RESIDUAL_MISMATCH",
    }


def assemble(config: dict[str, Any], semantic_report: list[dict[str, Any]], replacement: dict[str, Any], evidence: dict[str, Any], threshold: float, human_floor: float) -> dict[str, Any]:
    replaced_id = config["replacement"]["replacesSampleId"]
    original = next((sample for sample in semantic_report if sample["sampleId"] == replaced_id), None)
    if original is None or original["state"] != "RESIDUAL_MISMATCH":
        raise RuntimeError("TARGETED_SOURCE_RESIDUAL_MISSING")
    retained = [sample for sample in semantic_report if sample["sampleId"] != replaced_id]
    total_edits = sum(sample["normalizedEditCount"] for sample in retained) + replacement["normalizedEditCount"]
    total_reference = sum(sample["normalizedReferenceCount"] for sample in retained) + replacement["normalizedReferenceCount"]
    aggregate = total_edits / total_reference
    residual = [sample["sampleId"] for sample in retained if sample["normalizedPhonemeErrorRate"] > threshold]
    if replacement["normalizedPhonemeErrorRate"] > threshold:
        residual.append(replacement["sampleId"])
    passed = aggregate <= threshold and not residual
    evidence = {**evidence, "audioPath": f"replacement-audio/{Path(evidence['audioPath']).name}"}
    return {
        "schemaVersion": 1,
        "workPackage": "G-02H-B",
        "qualificationState": "PRODUCTION_VOICE_VALIDATION_READY" if passed else "NOT_QUALIFIED",
        "productionEligible": False,
        "productionProviderDispatch": "OFF",
        "autoPublish": "OFF",
        "source": {"g02gb": config["sourceG02GB"], "g02ha": config["sourceG02HA"]},
        "rejectedSourceSample": original,
        "replacementValidation": replacement,
        "replacementEvidence": evidence,
        "productionValidation": {
            "evaluated": True,
            "passed": passed,
            "threshold": threshold,
            "humanErrorFloor": human_floor,
            "aggregatePhonemeErrorRate": aggregate,
            "sampleCount": len(retained) + 1,
            "residualSampleIds": residual,
            "failures": [] if passed else ["PRODUCTION_VOICE_SAMPLE_THRESHOLD_EXCEEDED"],
        },
        "providerUsage": {
            "provider": "ELEVENLABS",
            "qualificationProviderCallCount": 1,
            "totalCharacters": len(config["replacement"]["text"]),
            "maxProviderCalls": 1,
            "maxTotalCharacters": config["replacement"]["maxTotalCharacters"],
            "productionProviderDispatch": "OFF",
        },
    }


def write_bundle(output: Path, bundle: dict[str, Any]) -> None:
    output.mkdir(parents=True, exist_ok=True)
    write_json(output / "replacement-validation.json", bundle["replacementValidation"])
    write_json(output / "rejected-source-sample.json", bundle["rejectedSourceSample"])
    write_json(output / "production-validation.json", bundle["productionValidation"])
    write_json(output / "provider-usage.json", bundle["providerUsage"])
    write_json(output / "replay-input.json", bundle)
    digest = hashlib.sha256(canonical_bytes(bundle)).hexdigest()
    write_json(output / "manifest.json", {
        "schemaVersion": 1,
        "workPackage": "G-02H-B",
        "canonicalBundleSha256": digest,
        "qualificationState": bundle["qualificationState"],
        "passed": bundle["productionValidation"]["passed"],
        "productionEligible": False,
        "productionProviderDispatch": "OFF",
        "autoPublish": "OFF",
    })


def live(config: dict[str, Any], g02gb: Path, g02ha: Path, output: Path) -> None:
    key = os.environ.get("ELEVENLABS_API_KEY", "")
    if not key:
        raise RuntimeError("ELEVENLABS_API_KEY_UNAVAILABLE")
    verify_checksums(g02gb, config["sourceG02GB"]["checksumEntryCount"])
    verify_checksums(g02ha, config["sourceG02HA"]["checksumEntryCount"])
    require_manifest(g02gb, config["sourceG02GB"]["canonicalBundleSha256"])
    require_manifest(g02ha, config["sourceG02HA"]["canonicalBundleSha256"])
    semantic_validation = json.loads((g02ha / "production-validation.json").read_text(encoding="utf-8"))
    if semantic_validation["residualSampleIds"] != config["sourceG02HA"]["requiredResidualSampleIds"]:
        raise RuntimeError("TARGETED_RESIDUAL_SET_MISMATCH")
    human = json.loads((g02gb / "human-calibration.json").read_text(encoding="utf-8"))
    semantic_report = json.loads((g02ha / "semantic-normalization-report.json").read_text(encoding="utf-8"))
    with tempfile.TemporaryDirectory(prefix="g02hb-") as temporary_dir:
        temporary = Path(temporary_dir)
        audio = output / "replacement-audio" / f"{config['replacement']['id']}.mp3"
        evidence = generate_replacement(config, key, audio)
        observed = observe(config, evidence, temporary)
        replacement = validate_replacement(config, observed, human["threshold"])
    evidence.pop("referencePhonemes", None)
    evidence.pop("observedPhonemes", None)
    evidence["observedTranscript"] = observed["observedTranscript"]
    bundle = assemble(config, semantic_report, replacement, evidence, human["threshold"], human["errorFloor"])
    write_bundle(output, bundle)


def replay(source: Path, output: Path) -> None:
    bundle = json.loads((source / "replay-input.json").read_text(encoding="utf-8"))
    relative = bundle["replacementEvidence"]["audioPath"]
    actual = source / relative
    if sha256_file(actual) != bundle["replacementEvidence"]["audioSha256"]:
        raise RuntimeError("TARGETED_REPLAY_AUDIO_HASH_MISMATCH")
    target = output / relative
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(actual, target)
    write_bundle(output, bundle)


def verify(first: Path, second: Path) -> None:
    one = json.loads((first / "manifest.json").read_text(encoding="utf-8"))
    two = json.loads((second / "manifest.json").read_text(encoding="utf-8"))
    accepted = one["canonicalBundleSha256"] == two["canonicalBundleSha256"]
    write_json(first / "replay-receipt.json", {
        "accepted": accepted,
        "replayed": True,
        "firstCanonicalSha256": one["canonicalBundleSha256"],
        "replayCanonicalSha256": two["canonicalBundleSha256"],
        "providerCallsDuringReplay": 0,
    })
    if not accepted:
        raise RuntimeError("TARGETED_REMEDIATION_REPLAY_MISMATCH")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--config")
    parser.add_argument("--g02gb-source")
    parser.add_argument("--g02ha-source")
    parser.add_argument("--output")
    parser.add_argument("--replay-from")
    parser.add_argument("--verify", nargs=2, metavar=("FIRST", "SECOND"))
    args = parser.parse_args()
    if args.verify:
        verify(Path(args.verify[0]), Path(args.verify[1]))
        return
    if not args.output:
        parser.error("--output is required")
    if args.replay_from:
        replay(Path(args.replay_from), Path(args.output))
        return
    if not args.config or not args.g02gb_source or not args.g02ha_source:
        parser.error("--config and both source paths are required")
    config = json.loads(Path(args.config).read_text(encoding="utf-8"))
    live(config, Path(args.g02gb_source), Path(args.g02ha_source), Path(args.output))


if __name__ == "__main__":
    try:
        main()
    except (RuntimeError, OSError, ValueError, KeyError, urllib.error.HTTPError, subprocess.CalledProcessError) as error:
        output = Path(next((sys.argv[index + 1] for index, value in enumerate(sys.argv[:-1]) if value == "--output"), "g02hb-failure"))
        output.mkdir(parents=True, exist_ok=True)
        write_json(output / "failure.json", {
            "accepted": False,
            "errorCode": str(error),
            "providerCallsAttempted": PROVIDER_CALLS_ATTEMPTED,
            "productionEligible": False,
            "productionProviderDispatch": "OFF",
            "autoPublish": "OFF",
        })
        raise
