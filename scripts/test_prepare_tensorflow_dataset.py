#!/usr/bin/env python3
"""Integration tests for the local, privacy-preserving TensorFlow dataset converter."""
import csv
import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

SCRIPT = Path(__file__).with_name("prepare_tensorflow_dataset.py")
SECRET = "test-only-secret-with-at-least-32-bytes"


def write_csv(path: Path, *, learners: int = 5, rows_per_learner: int = 6,
              target: str = "0.72") -> None:
    fields = [
        "student_id",
        "completed_attempts",
        "previous_accuracy",
        "recent_average_accuracy",
        "overall_average_accuracy",
        "previous_question_count",
        "next_score",
    ]
    with path.open("w", encoding="utf-8", newline="") as output:
        writer = csv.DictWriter(output, fieldnames=fields)
        writer.writeheader()
        for learner in range(learners):
            for attempt in range(rows_per_learner):
                writer.writerow({
                    "student_id": f"private-learner-{learner}",
                    "completed_attempts": 3 + attempt,
                    "previous_accuracy": "0.65",
                    "recent_average_accuracy": "0.70",
                    "overall_average_accuracy": "0.66",
                    "previous_question_count": 20,
                    "next_score": target,
                })


class DatasetPreparationTests(unittest.TestCase):
    def run_converter(self, source: Path, destination: Path, secret: str | None = SECRET):
        environment = os.environ.copy()
        if secret is None:
            environment.pop("ARCTESTER_GROUP_HMAC_SECRET", None)
        else:
            environment["ARCTESTER_GROUP_HMAC_SECRET"] = secret
        return subprocess.run(
            [sys.executable, str(SCRIPT), str(source), str(destination)],
            capture_output=True,
            text=True,
            env=environment,
            check=False,
        )

    def test_valid_dataset_emits_only_features_target_and_keyed_groups(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source, destination = root / "private.csv", root / "samples.json"
            write_csv(source)
            result = self.run_converter(source, destination)
            self.assertEqual(result.returncode, 0, result.stderr)
            samples = json.loads(destination.read_text(encoding="utf-8"))
            self.assertEqual(len(samples), 30)
            self.assertEqual(len({sample["groupId"] for sample in samples}), 5)
            self.assertTrue(all(len(sample["groupId"]) == 64 for sample in samples))
            self.assertEqual(
                set(samples[0]["features"]),
                {
                    "completed_attempts",
                    "previous_accuracy",
                    "recent_average_accuracy",
                    "overall_average_accuracy",
                    "previous_question_count",
                },
            )
            serialized = destination.read_text(encoding="utf-8")
            self.assertNotIn("private-learner-", serialized)
            self.assertNotIn(SECRET, serialized)

    def test_same_secret_produces_stable_group_ids(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "private.csv"
            write_csv(source)
            first, second = root / "first.json", root / "second.json"
            self.assertEqual(self.run_converter(source, first).returncode, 0)
            self.assertEqual(self.run_converter(source, second).returncode, 0)
            first_ids = [row["groupId"] for row in json.loads(first.read_text())]
            second_ids = [row["groupId"] for row in json.loads(second.read_text())]
            self.assertEqual(first_ids, second_ids)

    def test_missing_secret_is_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source, destination = root / "private.csv", root / "samples.json"
            write_csv(source)
            result = self.run_converter(source, destination, secret=None)
            self.assertEqual(result.returncode, 2)
            self.assertFalse(destination.exists())

    def test_insufficient_rows_or_learner_groups_are_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source, destination = root / "private.csv", root / "samples.json"
            write_csv(source, learners=4, rows_per_learner=8)
            result = self.run_converter(source, destination)
            self.assertEqual(result.returncode, 1)
            self.assertIn("at least 5 distinct learners", result.stderr.lower())
            write_csv(source, learners=5, rows_per_learner=5)
            result = self.run_converter(source, destination)
            self.assertEqual(result.returncode, 1)
            self.assertIn("at least 30 rows", result.stderr.lower())

    def test_out_of_range_target_is_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source, destination = root / "private.csv", root / "samples.json"
            write_csv(source, target="72")
            result = self.run_converter(source, destination)
            self.assertEqual(result.returncode, 1)
            self.assertIn("next_score", result.stderr)
            self.assertFalse(destination.exists())


if __name__ == "__main__":
    unittest.main()
