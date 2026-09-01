#!/usr/bin/env python3
"""Fail closed unless the Stage 10 Python/NLTK runtime works as the image user."""

from __future__ import annotations

import argparse
import getpass
import importlib
import importlib.metadata
import json
import os
import re
from pathlib import Path

import nltk
from g2p_en import G2p


ARPABET = re.compile(r"^[A-Z]+[0-2]?$")
NLTK_DATA = "/usr/local/share/nltk_data"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", required=True)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    if os.environ.get("NLTK_DATA") != NLTK_DATA:
        raise RuntimeError("NLTK_DATA_NOT_SHARED")
    if getpass.getuser() != "node":
        raise RuntimeError("STAGE10_RUNTIME_USER_MISMATCH")

    for module_name in ("torch", "torchaudio", "whisperx"):
        importlib.import_module(module_name)

    nltk.data.find("taggers/averaged_perceptron_tagger")
    nltk.data.find("taggers/averaged_perceptron_tagger_eng")
    nltk.data.find("corpora/cmudict")
    phonemes = [
        token for token in G2p()("The Federal Reserve held rates steady.")
        if ARPABET.fullmatch(token)
    ]
    if not phonemes:
        raise RuntimeError("G2P_PREFLIGHT_EMPTY")

    marker = {
        "schemaVersion": 1,
        "runtimeUser": getpass.getuser(),
        "nltkData": NLTK_DATA,
        "phonemeCount": len(phonemes),
        "g2pEnVersion": importlib.metadata.version("g2p-en"),
        "whisperxVersion": importlib.metadata.version("whisperx"),
    }
    Path(args.output).write_text(
        json.dumps(marker, sort_keys=True, separators=(",", ":")) + "\n",
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()
