# ArcTester Answer Intelligence

The Answer Intelligence API generates post-practice explanations using this fallback order:

1. External AI provider
2. Local OpenAI-compatible model
3. Approved explanation stored with the question snapshot
4. Deterministic offline guide

## External provider configuration

For an OpenAI-compatible provider:

```env
ARCTESTER_AI_PROVIDER=openai-compatible
ARCTESTER_AI_BASE_URL=https://api.openai.com/v1
ARCTESTER_AI_API_KEY=replace-with-server-side-secret
ARCTESTER_AI_MODEL=your-supported-model
```

For Anthropic Claude:

```env
ARCTESTER_AI_PROVIDER=anthropic
ANTHROPIC_API_KEY=replace-with-server-side-secret
ARCTESTER_ANTHROPIC_MODEL=claude-3-5-haiku-latest
```

## Local model configuration

The local endpoint must implement the OpenAI-compatible `/chat/completions` API. Ollama can expose this compatibility endpoint:

```env
ARCTESTER_LOCAL_AI_BASE_URL=http://127.0.0.1:11434/v1
ARCTESTER_LOCAL_AI_MODEL=qwen2.5:3b
```

Use a model actually pulled into the local Ollama instance. For llama.cpp server, set the base URL to its OpenAI-compatible `/v1` endpoint and use the loaded model name.

## API behavior

- Students can request explanations only for questions in their own completed practice attempt.
- The authoritative answer comes from the immutable attempt answer-key snapshot.
- The prompt receives question text, choices, the selected choice and the question-bank explanation; it does not receive a student's name, email or database ID.
- AI output must be valid structured JSON and must preserve the exact four choices and answer-key index. Invalid output falls through to the next provider.
- AI-generated explanations are labelled `ai-generated-unverified`; the system does not claim to have independently verified their reasoning.
- Existing question-bank explanations are preferred over generic offline text when no provider is available.
- Provider keys remain server-side environment variables. They are never returned by the status endpoint.

## Admin status endpoint

`GET /admin/intelligence/status` (administrator session required) reports provider configuration state and fallback order without returning credentials.

## Student endpoint

`POST /tests/:attemptId/questions/:questionId/explanation` (authenticated owner of a completed attempt only).

## Current boundaries

The existing Decision Engine remains evidence-based and rule-driven, with the score predictor used where eligible. Answer explanations do not directly alter marks, student access, exam settings or model activation. Each explanation also returns a small evidence-based next-study action (learn concept, review mistakes, or spaced practice). This is a transparent per-answer policy, not a trained decision model; the existing analytics recommendation engine continues to use accumulated attempt statistics.

The current fallback template is intentionally conservative: it can explain the recorded key but does not pretend to derive a full subject-specific proof when no question-bank explanation or AI provider is available.
