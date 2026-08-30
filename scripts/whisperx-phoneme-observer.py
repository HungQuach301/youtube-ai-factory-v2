#!/usr/bin/env python3
"""Observe transcripts with pinned WhisperX and emit normalized ARPAbet sequences."""

from __future__ import annotations

import argparse
import importlib.util
import json
import os
import random
import re
from pathlib import Path
from typing import Any


ARPABET = re.compile(r"^[A-Z]+[0-2]?$")
NORMALIZATION_PROFILE = "en-US-financial-spoken-v1"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--model", default="small.en")
    return parser.parse_args()


def load_normalizer() -> Any:
    path = Path(__file__).with_name("replay-semantic-normalization.py")
    spec = importlib.util.spec_from_file_location("factory_semantic_normalizer", path)
    if spec is None or spec.loader is None:
        raise RuntimeError("SEMANTIC_NORMALIZER_LOAD_FAILED")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def main() -> None:
    args = parse_args()
    os.environ.setdefault("CUBLAS_WORKSPACE_CONFIG", ":4096:8")
    random.seed(20260829)

    import numpy as np
    import torch
    import whisperx
    from g2p_en import G2p

    np.random.seed(20260829)
    torch.manual_seed(20260829)
    torch.use_deterministic_algorithms(True, warn_only=True)

    payload = json.loads(Path(args.input).read_text(encoding="utf-8"))
    items = payload["items"]
    model = whisperx.load_model(
        args.model,
        "cpu",
        compute_type="int8",
        language="en",
        vad_method="silero",
    )
    align_model, align_metadata = whisperx.load_align_model(language_code="en", device="cpu")
    g2p = G2p()
    normalizer = load_normalizer()

    def phonemes(text: str) -> list[str]:
        return [token for token in g2p(text) if ARPABET.fullmatch(token)]

    sample_rate = 16000
    silence = np.zeros(sample_rate, dtype=np.float32)
    clips = []
    boundaries = []
    cursor = 0
    for item in items:
        audio = whisperx.load_audio(item["audioPath"])
        start = cursor / sample_rate
        clips.append(audio)
        cursor += len(audio)
        end = cursor / sample_rate
        boundaries.append((start, end))
        clips.append(silence)
        cursor += len(silence)

    combined_audio = np.concatenate(clips)
    transcription = model.transcribe(combined_audio, batch_size=8, language="en")
    aligned = whisperx.align(
        transcription["segments"],
        align_model,
        align_metadata,
        combined_audio,
        "cpu",
        return_char_alignments=False,
    )

    def belongs_to_interval(segment: dict[str, Any], start: float, end: float) -> bool:
        segment_start = float(segment.get("start", 0.0))
        segment_end = float(segment.get("end", segment_start))
        midpoint = (segment_start + segment_end) / 2
        return start <= midpoint < end

    observed = []
    for item, (start, end) in zip(items, boundaries, strict=True):
        item_segments = [
            segment for segment in aligned.get("segments", [])
            if belongs_to_interval(segment, start, end)
        ]
        observed_text = " ".join(
            str(segment.get("text", "")).strip() for segment in item_segments
        ).strip()
        normalized_reference = normalizer.normalize_text(item["transcript"])
        normalized_observed = normalizer.normalize_text(observed_text)
        reference = phonemes(normalized_reference)
        hypothesis = phonemes(normalized_observed)
        if not reference:
            raise RuntimeError(f"REFERENCE_PHONEMES_EMPTY:{item['id']}")
        observed.append({
            "id": item["id"],
            "referencePhonemes": reference,
            "observedPhonemes": hypothesis,
            "observedTranscript": observed_text,
            "normalizedReferenceTranscript": normalized_reference,
            "normalizedObservedTranscript": normalized_observed,
            "normalizationProfile": NORMALIZATION_PROFILE,
            "alignedWordCount": sum(
                1 for word in aligned.get("word_segments", [])
                if belongs_to_interval(word, start, end)
            ),
        })

    Path(args.output).write_text(
        json.dumps({
            "observer": "whisperx",
            "version": "3.4.2",
            "normalizationProfile": NORMALIZATION_PROFILE,
            "items": observed,
        }, sort_keys=True, indent=2) + "\n",
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()
