#!/usr/bin/env python3
"""Prepare ArcTester TensorFlow training samples from a private CSV.

The input CSV may contain student_id locally. The output contains only a keyed
HMAC-SHA256 group pseudonym; raw identifiers and the secret are never emitted.
"""
import argparse
import csv
import hashlib
import hmac
import json
import os
import sys
from pathlib import Path

FEATURES = (
    "completed_attempts",
    "previous_accuracy",
    "recent_average_accuracy",
    "overall_average_accuracy",
    "previous_question_count",
)
REQUIRED = ("student_id", *FEATURES, "next_score")


def fraction(value: str, field: str, row_number: int) -> float:
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        raise ValueError(f"row {row_number}: {field} must be numeric") from None
    if not 0.0 <= parsed <= 1.0:
        raise ValueError(f"row {row_number}: {field} must be a fraction from 0 to 1")
    return parsed


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input_csv", type=Path)
    parser.add_argument("output_json", type=Path)
    args = parser.parse_args()

    secret = os.environ.get("ARCTESTER_GROUP_HMAC_SECRET", "")
    if len(secret.encode("utf-8")) < 32:
        print("Set ARCTESTER_GROUP_HMAC_SECRET to a private random secret of at least 32 bytes.", file=sys.stderr)
        return 2

    samples = []
    groups = set()
    with args.input_csv.open("r", encoding="utf-8-sig", newline="") as source:
        reader = csv.DictReader(source)
        missing = [name for name in REQUIRED if name not in (reader.fieldnames or [])]
        if missing:
            print("Missing CSV columns: " + ", ".join(missing), file=sys.stderr)
            return 2

        for row_number, row in enumerate(reader, start=2):
            student_id = (row.get("student_id") or "").strip()
            if not student_id:
                raise ValueError(f"row {row_number}: student_id is required for local grouping")
            try:
                completed = int(row["completed_attempts"])
                question_count = int(row["previous_question_count"])
            except (TypeError, ValueError):
                raise ValueError(f"row {row_number}: count fields must be integers") from None
            if completed < 3 or question_count < 1:
                raise ValueError(f"row {row_number}: completed_attempts must be >=3 and previous_question_count >=1")

            group_id = hmac.new(secret.encode("utf-8"), student_id.encode("utf-8"), hashlib.sha256).hexdigest()
            groups.add(group_id)
            features = {
                "completed_attempts": completed,
                "previous_accuracy": fraction(row["previous_accuracy"], "previous_accuracy", row_number),
                "recent_average_accuracy": fraction(row["recent_average_accuracy"], "recent_average_accuracy", row_number),
                "overall_average_accuracy": fraction(row["overall_average_accuracy"], "overall_average_accuracy", row_number),
                "previous_question_count": question_count,
            }
            samples.append({
                "features": features,
                "target": fraction(row["next_score"], "next_score", row_number),
                "groupId": group_id,
            })

    if len(samples) < 30:
        raise ValueError(f"Need at least 30 rows; found {len(samples)}")
    if len(groups) < 5:
        raise ValueError(f"Need at least 5 distinct learners; found {len(groups)}")

    args.output_json.write_text(json.dumps(samples, indent=2) + "\n", encoding="utf-8")
    print(f"Prepared {len(samples)} rows from {len(groups)} pseudonymous learner groups.")
    print(f"Output: {args.output_json}")
    print("Raw student IDs and the HMAC secret were not written to the output.")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (OSError, ValueError) as error:
        print(f"Dataset preparation failed: {error}", file=sys.stderr)
        raise SystemExit(1)
