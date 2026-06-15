# Release v0.5.6 — Local AI models & accurate token counting

## Features

- Chat with local AI models: connect Ollama or any OpenAI-compatible server (LM Studio, llama.cpp, vLLM) from the new sections in AI settings — no cloud account needed (#92)
- Local models can read and edit your document directly, just like the cloud assistants (#92)
- The current document rides along with each message to local models, so small models answer about your file without extra round trips (#92)
- The Codex model picker now lists the models actually available in your Codex CLI instead of a fixed list (#92)
- Added the latest Claude models to the model picker (#92)
- The context bar warns when a conversation gets close to the model's limit, so you know when to start a fresh chat (#92)
- Long conversations are compacted automatically for small-context local models, keeping older turns from crowding out your question (#92)

## Bug fixes

- The context window size now matches the model you are actually chatting with — it no longer dropped to a smaller model's limit after the first reply (#99)
- The Codex context window is detected from your installed CLI instead of a stale built-in value (#99)
- Session instructions are sent once per conversation instead of with every message, so each turn wastes fewer tokens (#99)
- Token usage no longer double-counts cached tokens on Codex (#99)
- Edits proposed by local models no longer fail on Windows documents because of line-ending differences (#92)
- Pinned-fragment markers no longer leak into the document when a local model edits a pinned section (#92)
