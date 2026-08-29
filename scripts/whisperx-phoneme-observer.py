#!/usr/bin/env python3
"""Observe transcripts with pinned WhisperX and emit ARPAbet phoneme sequences."""

from __future__ import annotations

import argparse
import json
import os
import random
import re
from pathlib import Path


ARPABET = re.compile(r"^[A-Z]+[0-2]?$")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--model", default="small.en")
    return parser.parse_args()


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

    def phonemes(text: str) -> list[str]:
        return [token for token in g2p(text) if ARPABET.fullmatch(token)]

    observed = []
    for item in items:
        audio = whisperx.load_audio(item["audioPath"])
        transcription = model.transcribe(audio, batch_size=4, language="en")
        aligned = whisperx.align(
            transcription["segments"],
            align_model,
            align_metadata,
            audio,
            "cpu",
            return_char_alignments=False,
        )
        observed_text = " ".join(
            str(segment.get("text", "")).strip() for segment in aligned.get("segments", [])
        ).strip()
        reference = phonemes(item["transcript"])
        hypothesis = phonemes(observed_text)
        if not reference:
            raise RuntimeError(f"REFERENCE_PHONEMES_EMPTY:{item['id']}")
        observed.append({
            "id": item["id"],
            "referencePhonemes": reference,
            "observedPhonemes": hypothesis,
            "observedTranscript": observed_text,
            "alignedWordCount": len(aligned.get("word_segments", [])),
        })

    Path(args.output).write_text(
        json.dumps({"observer": "whisperx", "version": "3.4.2", "items": observed}, sort_keys=True, indent=2) + "\n",
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()
