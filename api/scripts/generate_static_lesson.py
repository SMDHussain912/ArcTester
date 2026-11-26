#!/usr/bin/env python3
"""Generate a static ArcTester lesson package using a locally hosted llama.cpp server.

No cloud model API is called. Output is a JSON package for Admin > Lesson Studio import.
"""
from __future__ import annotations

import argparse
import json
import re
import urllib.error
import urllib.request
from pathlib import Path


def slugify(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")[:80] or "lesson"


def validate_scene_timeline(scene: dict, scene_index: int) -> None:
    duration_ms = scene.get("durationMs")
    visual = scene.get("visual") or {}
    items = visual.get("items") or []
    steps = visual.get("steps") or []
    timeline = scene.get("timeline", [])
    if not isinstance(timeline, list) or len(timeline) > 48:
        raise SystemExit(f"Validation failed: scene {scene_index + 1} timeline must be an array with at most 48 actions.")
    if not isinstance(duration_ms, int) or isinstance(duration_ms, bool):
        raise SystemExit(f"Validation failed: scene {scene_index + 1} durationMs must be an integer.")
    for action_index, action in enumerate(timeline):
        prefix = f"scene {scene_index + 1}, timeline action {action_index + 1}"
        if not isinstance(action, dict):
            raise SystemExit(f"Validation failed: {prefix} must be an object.")
        kind = action.get("action")
        if kind not in {"reveal_item", "highlight_item", "reveal_step", "emphasize_text"}:
            raise SystemExit(f"Validation failed: {prefix} uses an unsupported action.")
        at_ms = action.get("atMs")
        if not isinstance(at_ms, int) or isinstance(at_ms, bool) or at_ms < 0 or at_ms >= duration_ms:
            raise SystemExit(f"Validation failed: {prefix} atMs must be an integer within the scene duration.")
        action_duration = action.get("durationMs", 600)
        if not isinstance(action_duration, int) or isinstance(action_duration, bool) or not 100 <= action_duration <= 10000:
            raise SystemExit(f"Validation failed: {prefix} durationMs must be between 100 and 10000.")
        if kind == "emphasize_text":
            if "targetIndex" in action:
                raise SystemExit(f"Validation failed: {prefix} emphasize_text must not include targetIndex.")
            continue
        target_index = action.get("targetIndex")
        target_list = steps if kind == "reveal_step" else items
        if not isinstance(target_index, int) or isinstance(target_index, bool) or not 0 <= target_index < len(target_list):
            target_name = "visual.steps" if kind == "reveal_step" else "visual.items"
            raise SystemExit(f"Validation failed: {prefix} targetIndex must refer to an existing {target_name} entry.")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--title", required=True, help="Lesson title")
    parser.add_argument("--subject", required=True, help="ECET subject")
    parser.add_argument("--topic", required=True, help="Topic")
    parser.add_argument("--outline", required=True, help="Trusted syllabus notes / learning points")
    parser.add_argument("--endpoint", default="http://127.0.0.1:8080/v1/chat/completions")
    parser.add_argument("--output", default="")
    args = parser.parse_args()

    prompt = f"""Create one accurate beginner-friendly AP ECET CSE lesson package as STRICT JSON only.
Use ONLY the supplied outline for factual scope. Do not invent syllabus claims. Explain in plain English.
No markdown fences, HTML, executable code, or external links.
The JSON must exactly match this structure:
{{
"title": string, "subject": string, "topic": string,
"script": {{
"title": same string,
"learningObjectives": 2-5 short strings,
"sections": 2-6 objects {{ "heading": string, "explanation": 1-3 paragraphs, "example": string, "teacherCue": string }},
"keyTakeaways": 3-6 strings, "groundingNotes": [outline limitations or source note]
}},
"storyboard": {{ "scenes": 4-7 objects }}
Each scene: sceneType one of title_card,text_reveal,diagram,equation,step_sequence,checkpoint; title; narration (natural voice narration, 1-4 sentences); onScreenText; durationMs (2500-45000); visual object; timeline array (0-48 safe cue actions).
Timeline actions are objects with atMs (integer milliseconds from scene start), action, optional targetIndex (zero-based), and optional durationMs (100-10000, default 600).
Allowed actions: reveal_item (targetIndex into visual.items), highlight_item (targetIndex into visual.items), reveal_step (targetIndex into visual.steps), emphasize_text (no targetIndex).
For diagrams, reveal useful items progressively; for step_sequence, reveal each step in order with spaced atMs cues. Add occasional highlights/emphasis only when it supports understanding. Keep every atMs less than scene duration. Do not include JavaScript, expressions, URLs, or executable content.
Use at least one diagram with 2+ visual.items and valid connections, or a step_sequence with 2+ visual.steps.
Last scene MUST be checkpoint. Keep total duration <= 8 minutes.
Use simple ASCII formulas when needed. Do not include answer keys.
Title: {args.title}
Subject: {args.subject}
Topic: {args.topic}
Trusted outline:
{args.outline}
"""
    request = urllib.request.Request(
        args.endpoint,
        data=json.dumps({
            "model": "local-model",
            "temperature": 0.2,
            "max_tokens": 6500,
            "response_format": {"type": "json_object"},
            "messages": [
                {"role": "system", "content": "You are a careful educational content author. Return valid JSON only."},
                {"role": "user", "content": prompt},
            ],
        }).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=300) as response:
            payload = json.loads(response.read().decode())
        raw = payload["choices"][0]["message"]["content"]
        package = json.loads(raw)
    except (urllib.error.URLError, KeyError, IndexError, json.JSONDecodeError) as exc:
        raise SystemExit(f"Local model request/output failed: {exc}") from exc

    if package.get("title") != package.get("script", {}).get("title"):
        raise SystemExit("Validation failed: package title and script.title must match.")
    scenes = package.get("storyboard", {}).get("scenes", [])
    for scene_index, scene in enumerate(scenes):
        if not isinstance(scene, dict):
            raise SystemExit(f"Validation failed: scene {scene_index + 1} must be an object.")
        scene.setdefault("timeline", [])
        validate_scene_timeline(scene, scene_index)
    if len(scenes) < 3 or scenes[-1].get("sceneType") != "checkpoint":
        raise SystemExit("Validation failed: at least 3 scenes and final checkpoint are required.")
    if not any(scene.get("sceneType") in {"diagram", "step_sequence"} for scene in scenes):
        raise SystemExit("Validation failed: include a diagram or step_sequence scene.")
    if sum(int(scene.get("durationMs", 0)) for scene in scenes) > 8 * 60 * 1000:
        raise SystemExit("Validation failed: storyboard exceeds 8 minutes.")
    if not isinstance(package.get("script", {}).get("sections"), list) or len(package["script"]["sections"]) < 2:
        raise SystemExit("Validation failed: script needs at least two explanation sections.")

    destination = Path(args.output) if args.output else Path("api/content/lesson-drafts") / f"{slugify(args.title)}.lesson.json"
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(json.dumps(package, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Created static lesson package: {destination}")
    print("Next: import it in Admin > Lesson Studio, review, then publish. Students do not invoke the model.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
