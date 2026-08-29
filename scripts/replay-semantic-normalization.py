#!/usr/bin/env python3
"""Zero-provider G-02H-A replay over sealed G-02G-B evidence."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
import unicodedata
from pathlib import Path
from typing import Any


ARPABET = re.compile(r"^[A-Z]+[0-2]?$")
NUMBER = re.compile(r"(?<![A-Za-z0-9])\d[\d,]*(?:\.\d+)?(?![A-Za-z0-9])")
CURRENCY = re.compile(r"\$\s*(\d[\d,]*(?:\.\d+)?)")
PERCENT = re.compile(r"(\d[\d,]*(?:\.\d+)?)\s*%")
ACRONYM = re.compile(r"\b[A-Z]{2,6}\b")

ONES = (
    "zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine",
    "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen",
    "seventeen", "eighteen", "nineteen",
)
TENS = ("", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety")


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


def integer_words(value: int) -> str:
    if value < 20:
        return ONES[value]
    if value < 100:
        tens, remainder = divmod(value, 10)
        return TENS[tens] if remainder == 0 else f"{TENS[tens]} {ONES[remainder]}"
    if value < 1_000:
        hundreds, remainder = divmod(value, 100)
        prefix = f"{ONES[hundreds]} hundred"
        return prefix if remainder == 0 else f"{prefix} {integer_words(remainder)}"
    if value < 1_000_000:
        thousands, remainder = divmod(value, 1_000)
        prefix = f"{integer_words(thousands)} thousand"
        return prefix if remainder == 0 else f"{prefix} {integer_words(remainder)}"
    raise RuntimeError(f"NORMALIZATION_INTEGER_OUT_OF_RANGE:{value}")


def number_words(raw: str) -> str:
    cleaned = raw.replace(",", "")
    if "." in cleaned:
        whole, fraction = cleaned.split(".", 1)
        return f"{integer_words(int(whole))} point {' '.join(ONES[int(char)] for char in fraction)}"
    value = int(cleaned)
    if len(cleaned) == 4 and 2000 <= value <= 2099 and value != 2000:
        return f"twenty {integer_words(value % 100)}"
    return integer_words(value)


def normalize_text(value: str) -> str:
    text = unicodedata.normalize("NFKC", value).replace("’", "'")
    text = CURRENCY.sub(lambda match: f" {number_words(match.group(1))} dollar ", text)
    text = PERCENT.sub(lambda match: f" {number_words(match.group(1))} percent ", text)
    text = ACRONYM.sub(lambda match: " ".join(match.group(0)), text)
    text = text.replace("&", " and ")
    text = NUMBER.sub(lambda match: f" {number_words(match.group(0))} ", text)
    text = text.replace("-", " ").replace("'", "")
    text = re.sub(r"[^A-Za-z ]+", " ", text).lower()
    text = re.sub(r"\bdollars\b", "dollar", text)
    return " ".join(text.split())


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


def verify_source_checksums(source: Path, expected_count: int) -> None:
    checksum_file = source / "artifact-sha256s.txt"
    lines = [line for line in checksum_file.read_text(encoding="utf-8").splitlines() if line.strip()]
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


def phonemes(g2p: Any, text: str) -> list[str]:
    return [token for token in g2p(text) if ARPABET.fullmatch(token)]


def build(config: dict[str, Any], source: Path) -> dict[str, Any]:
    verify_source_checksums(source, config["source"]["checksumEntryCount"])
    source_manifest = json.loads((source / "manifest.json").read_text(encoding="utf-8"))
    if source_manifest["canonicalBundleSha256"] != config["source"]["canonicalBundleSha256"]:
        raise RuntimeError("SOURCE_CANONICAL_HASH_MISMATCH")

    source_human = json.loads((source / "human-calibration.json").read_text(encoding="utf-8"))
    if not source_human.get("calibrated") or not source_human.get("gateEvaluated"):
        raise RuntimeError("SOURCE_HUMAN_CALIBRATION_NOT_READY")
    threshold = source_human["threshold"]
    source_validation = json.loads((source / "production-validation.json").read_text(encoding="utf-8"))
    raw_by_id = {item["sampleId"]: item for item in source_validation["sampleErrors"]}
    evidence = json.loads((source / "production-evidence.json").read_text(encoding="utf-8"))

    from g2p_en import G2p
    g2p = G2p()
    samples = []
    total_edits = 0
    total_reference = 0
    for item in evidence:
        reference_text = normalize_text(item["transcript"])
        observed_text = normalize_text(item["observedTranscript"])
        reference = phonemes(g2p, reference_text)
        observed = phonemes(g2p, observed_text)
        if not reference:
            raise RuntimeError(f"NORMALIZED_REFERENCE_EMPTY:{item['id']}")
        edits = levenshtein(reference, observed)
        rate = edits / len(reference)
        raw_rate = raw_by_id[item["id"]]["phonemeErrorRate"]
        state = "PASS"
        if rate > threshold:
            state = "RESIDUAL_MISMATCH"
        elif raw_rate > threshold:
            state = "NORMALIZATION_RESOLVED"
        samples.append({
            "sampleId": item["id"],
            "referenceTranscript": item["transcript"],
            "observedTranscript": item["observedTranscript"],
            "normalizedReference": reference_text,
            "normalizedObserved": observed_text,
            "rawPhonemeErrorRate": raw_rate,
            "normalizedEditCount": edits,
            "normalizedReferenceCount": len(reference),
            "normalizedPhonemeErrorRate": rate,
            "state": state,
        })
        total_edits += edits
        total_reference += len(reference)

    aggregate = total_edits / total_reference
    residual = [sample["sampleId"] for sample in samples if sample["state"] == "RESIDUAL_MISMATCH"]
    validation = {
        "evaluated": True,
        "passed": aggregate <= threshold and not residual,
        "threshold": threshold,
        "humanErrorFloor": source_human["errorFloor"],
        "aggregatePhonemeErrorRate": aggregate,
        "sampleCount": len(samples),
        "normalizationResolvedSampleIds": [sample["sampleId"] for sample in samples if sample["state"] == "NORMALIZATION_RESOLVED"],
        "residualSampleIds": residual,
        "failures": [] if not residual else ["PRODUCTION_VOICE_SAMPLE_THRESHOLD_EXCEEDED"],
    }
    provider_usage = {
        "providerCalls": 0,
        "providerSpendUsd": 0,
        "sourceProviderCallsReused": 12,
        "sourceProviderCharactersReused": 1163,
    }
    return {
        "schemaVersion": 1,
        "workPackage": "G-02H-A",
        "source": config["source"],
        "normalizationProfile": config["normalizationProfile"],
        "productionEligible": False,
        "productionProviderDispatch": "OFF",
        "autoPublish": "OFF",
        "productionValidation": validation,
        "samples": samples,
        "providerUsage": provider_usage,
    }


def write_bundle(output: Path, bundle: dict[str, Any]) -> None:
    output.mkdir(parents=True, exist_ok=True)
    write_json(output / "semantic-normalization-report.json", bundle["samples"])
    write_json(output / "production-validation.json", bundle["productionValidation"])
    write_json(output / "provider-usage.json", bundle["providerUsage"])
    write_json(output / "replay-input.json", bundle)
    digest = hashlib.sha256(canonical_bytes(bundle)).hexdigest()
    write_json(output / "manifest.json", {
        "schemaVersion": 1,
        "workPackage": "G-02H-A",
        "canonicalBundleSha256": digest,
        "passed": bundle["productionValidation"]["passed"],
        "residualSampleIds": bundle["productionValidation"]["residualSampleIds"],
        "productionEligible": False,
        "productionProviderDispatch": "OFF",
        "autoPublish": "OFF",
        "providerCalls": 0,
    })


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
        raise RuntimeError("SEMANTIC_NORMALIZATION_REPLAY_MISMATCH")


def self_test() -> None:
    cases = {
        "A 6.5% rate": "a six point five percent rate",
        "A $1,000 fund": "a one thousand dollar fund",
        "The S&P 500": "the s and p five hundred",
        "Ticker AAPL": "ticker a a p l",
        "In 2026": "in twenty twenty six",
        "A 0.2% ratio": "a zero point two percent ratio",
    }
    actual = {source: normalize_text(source) for source in cases}
    if actual != cases:
        raise RuntimeError(f"NORMALIZATION_SELF_TEST_FAILED:{actual}")
    print(json.dumps({"accepted": True, "caseCount": len(cases)}, sort_keys=True))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--config")
    parser.add_argument("--source")
    parser.add_argument("--output")
    parser.add_argument("--verify", nargs=2, metavar=("FIRST", "SECOND"))
    parser.add_argument("--self-test-normalization", action="store_true")
    args = parser.parse_args()
    if args.self_test_normalization:
        self_test()
        return
    if args.verify:
        verify(Path(args.verify[0]), Path(args.verify[1]))
        return
    if not args.config or not args.source or not args.output:
        parser.error("--config, --source and --output are required")
    config = json.loads(Path(args.config).read_text(encoding="utf-8"))
    bundle = build(config, Path(args.source))
    write_bundle(Path(args.output), bundle)


if __name__ == "__main__":
    try:
        main()
    except (RuntimeError, OSError, ValueError, KeyError) as error:
        print(str(error), file=sys.stderr)
        raise
