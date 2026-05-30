# IntervueX AI — Architecture & Failure Handling

## Stack

| Layer | Technology |
|-------|------------|
| Frontend | React (Vite) + MediaRecorder + Web Speech API |
| API | Node.js + Express (`server/`) |
| Real-time | WebSocket (`/ws/proctoring`) |
| Storage | Local filesystem (dev) → S3/R2 in production |
| Merge queue | In-process queue (dev) → SQS + Lambda + FFmpeg |
| Transcription | Mock / Deepgram (`DEEPGRAM_API_KEY`) |

## Media flow

1. **Frontend** — `MediaRecorder` emits 3s WebM chunks.
2. **Upload** — `POST /api/chunks/:sessionId` with deterministic keys `chunk_NNN.webm`.
3. **Validation** — Empty chunks (&lt; 256 bytes) rejected.
4. **Merge** — On complete, `AUDIO_MERGE_QUEUE` (in-process) runs FFmpeg concat (or byte fallback).
5. **Transcription** — Merged file → Deepgram or mock from Q&A answers.

## Session persistence (`session_data`)

Central state in `server/data/sessions.json`:

- `questionIndex`, `answers`, `tabWarnings`, `flags`
- `uploadedChunkKeys`, `chunkSequence`
- `mergeStatus`, `transcriptionStatus`, `transcription`

**Resume:** `localStorage` + `POST /api/sessions` with `resumeFrom`.

## Failure scenarios & mitigations

| Scenario | Mitigation |
|----------|------------|
| Network interruption | Chunk upload retries (3×); pending queue; local session cache |
| Corrupted / empty chunks | Server rejects &lt; 256 bytes; skips tiny blobs client-side |
| Camera disconnect | `track.onended` → WebSocket `camera_disconnect` flag |
| WebSocket drop | Auto-reconnect with exponential backoff |
| API offline | Frontend degrades to local-only mode (toast warns user) |
| Out-of-order chunks | Sorted by `chunk_NNN` filename before FFmpeg merge |

## Running locally

```bash
# Terminal 1 — API + WebSocket
cd Ai-interview/server && npm install && npm run dev

# Terminal 2 — Frontend (proxies /api and /ws)
cd Ai-interview && npm install && npm run dev

# Or both:
npm run dev:all
```

Optional: install [FFmpeg](https://ffmpeg.org/) for proper chunk merging.

Optional: `DEEPGRAM_API_KEY=your_key` in server environment for live transcription.

## Production mapping

| Dev | Production |
|-----|------------|
| `server/uploads/` | Cloudflare R2 / AWS S3 |
| In-process queues | SQS `AUDIO_MERGE_QUEUE_URL`, `TRANSCRIPTION_QUEUE_URL` |
| `sessions.json` | MongoDB `AiInterview.session_data` |
| JSON logs | AWS CloudWatch |
| Vite proxy | API Gateway + ALB |

## Observability

Server logs structured JSON via `utils/logger.js` (level, message, sessionId, durationMs).

Failed merges/transcriptions set `mergeStatus` / `transcriptionStatus` to `failed` on the session record.
