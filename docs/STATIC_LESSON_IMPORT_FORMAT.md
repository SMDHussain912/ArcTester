# Static lesson package format

ArcTester can import a prepared lesson as an unpublished draft from the admin Lesson Studio. This path **does not call the lesson-writing model**. The API validates the script and storyboard using the same schemas as generated lessons, then saves them in PostgreSQL.

## File

Use a UTF-8 JSON file, up to 256 KB, with this shape:

```json
{
  "title": "Stack operations",
  "subject": "Computer Science",
  "topic": "Stacks",
  "script": {
    "title": "Stack operations",
    "learningObjectives": [
      "Explain last in, first out order",
      "Trace push and pop operations"
    ],
    "sections": [
      {
        "heading": "What is a stack?",
        "explanation": "A stack is a linear data structure that follows last in, first out order.",
        "example": "A stack of plates: the last plate placed on top is the first one removed.",
        "teacherCue": ""
      },
      {
        "heading": "Push and pop",
        "explanation": "Push adds an element to the top of the stack. Pop removes the element currently at the top.",
        "example": "Push A, then push B. A pop removes B first.",
        "teacherCue": ""
      }
    ],
    "keyTakeaways": [
      "A stack follows LIFO order",
      "Push adds and pop removes at the top"
    ],
    "groundingNotes": []
  },
  "storyboard": {
    "scenes": [
      {
        "sceneType": "title_card",
        "title": "Stacks",
        "narration": "Learn how a stack stores and removes values.",
        "onScreenText": "Stack · LIFO",
        "durationMs": 3000,
        "visual": {}
      },
      {
        "sceneType": "step_sequence",
        "title": "Push and pop",
        "narration": "Push adds to the top. Pop removes from the top.",
        "onScreenText": "Last in, first out",
        "durationMs": 6000,
        "visual": {
          "steps": ["Push A", "Push B", "Pop B"]
        }
      },
      {
        "sceneType": "checkpoint",
        "title": "Quick recall",
        "narration": "If A is pushed and then B is pushed, which value is popped first?",
        "onScreenText": "Which value pops first?",
        "durationMs": 4000,
        "visual": {}
      }
    ]
  }
}
```

## Validation rules

- `title`, `subject`, and `topic` are required; the package title must exactly match `script.title`.
- Script: 2–8 objectives, 2–12 sections, 2–10 takeaways.
- Storyboard: 3–24 scenes, at least one diagram or step sequence, and a final checkpoint.
- Diagram connections must reference visible diagram items; equation scenes need an equation; step sequences need at least two steps.
- Total scene duration cannot exceed eight minutes.
- Import creates a **DRAFT** only. Admin must review, save if needed, and explicitly publish it.
- Do not include answer keys, executable markup, scripts, external URLs, or private student data in lesson content.

The file is imported into the database. Do not rely on Render's local filesystem for persistent uploaded lessons.
