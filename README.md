# IntervueX — AI Interview System

**IntervueX** is a full-stack, browser-based technical interview platform that combines live video capture, voice-driven Q&A, automated proctoring, chunked media upload, server-side transcription, and recruiter analytics. Candidates complete structured interviews in the browser; recruiters review recordings, transcripts, integrity signals, and AI-generated recommendations from a dedicated dashboard.

---

## Table of Contents

1. [Problem Understanding](#problem-understanding)
2. [Architecture Overview](#architecture-overview)
3. [Technical Decisions & Tradeoffs](#technical-decisions--tradeoffs)
4. [Failure Scenarios & Edge Cases](#failure-scenarios--edge-cases)
5. [Recovery Mechanisms](#recovery-mechanisms)
6. [Product Thinking](#product-thinking)
7. [Scalability Considerations](#scalability-considerations)
8. [Observability & Debugging](#observability--debugging)
9. [AI Usage Documentation](#ai-usage-documentation)
10. [Demo & Walkthrough](#demo--walkthrough)

---

## Problem Understanding

### What problem are you solving?

Hiring teams need to evaluate candidates remotely with more signal than a static resume or a one-way video link. Traditional approaches fall short in several ways:

| Challenge | Limitation of common tools |
|-----------|----------------------------|
| **Integrity** | No reliable visibility into tab switching, face presence, or environment |
| **Media reliability** | Long recordings fail on poor networks; uploads block completion |
| **Structured evaluation** | Unstructured calls are hard to compare across candidates |
| **Recruiter workload** | Manual note-taking and inconsistent rubrics slow decisions |
| **Auditability** | Answers, video, and flags are scattered across tools |

### Why is this system needed?

IntervueX addresses these by running the entire interview loop in one system: authenticated sessions, timed role-based question sets, continuous proctoring, resilient chunked recording, automated merge/transcription, scoring/analytics, and a recruiter review surface with video, transcripts, and recommendations.

1. **Consistent interviews** — Predefined profiles (e.g. Web Dev Internship, Full-Stack Engineer) with six questions each and ~20–30 minute targets.
2. **Evidence-backed decisions** — Stored Q&A, merged recordings, optional Whisper/Deepgram transcripts, and integrity metrics.
3. **Resilience** — Chunked uploads, IndexedDB persistence, checkpoint sync, and session recovery after refresh or brief outages.
4. **Real-time visibility** — Recruiters receive live Socket.IO updates when interviews complete and reports are ready.
5. **Operational clarity** — Structured JSON logging on the server and client failure forwarding for support and debugging.

---

## Architecture Overview

### High-level system architecture

IntervueX uses a **React (Vite) SPA** for the client and a **Node.js (Express) API** for business logic, with optional **MongoDB** (JSON file fallback when unset).

```
Browser (Candidate / Recruiter)
├── React App (UI, routing, state)
├── MediaRecorder (3s WebM chunks)
├── Web Speech API (voice recognition + TTS)
├── IndexedDB (pending chunk persistence)
└── localStorage (session progress)
         │
         │ REST /api
         │ WebSocket /ws/proctoring
         │ Socket.IO /socket.io
         ▼
Express API :5000
├── JWT Auth
├── Sessions / Checkpoints (PATCH)
├── Chunk Upload + Deduplication
├── Recruiter Reports & Analytics
└── Merge + Transcription Pipeline
         │
         ├── Local disk uploads/ (dev)
         └── AWS S3 / Cloudflare R2 (prod)
```

**Stack summary:**

| Layer | Technology |
|-------|------------|
| Frontend | React 19, Vite 8, Tailwind CSS 4 |
| Voice UI | Web Speech API (recognition + synthesis) |
| Recording | `MediaRecorder` (WebM, ~8s timeslice + requestData interval) |
| API | Express 4, Multer, JWT |
| Database | MongoDB (optional) or `server/data/sessions.json` |
| Proctoring transport | Raw WebSocket (`/ws/proctoring`) |
| Pipeline / dashboard updates | Socket.IO (`chunk_uploaded`, `transcription_progress`, `interview_completed`, `report_generated`) |
| Object storage | Local filesystem (dev) or S3-compatible (prod) |
| Transcription | Mock, OpenAI Whisper, or Deepgram |
| Merge | FFmpeg (when installed) or byte-concat fallback |

### Media flow (frontend → backend → storage → transcription)

End-to-end path from camera to recruiter playback:

```
Camera + Mic
    │
    ▼ getUserMedia stream
MediaRecorder (no timeslice; requestData every ~8s)
    │
    ▼ WebM blob + sequenceNumber
Chunk Upload Queue (IndexedDB-backed, 4 parallel workers)
    │
    ├── [offline] → persist to IndexedDB, retry on reconnect
    │
    └── [online] → POST /api/chunks/upload (multipart + chunkId)
                        │
                        ▼
                   Storage (local disk / S3)
                        │
                        ▼ On interview complete
                   Audio Merge Queue (FFmpeg concat / byte fallback)
                        │
                        ▼
                   Transcription (Whisper / Deepgram / mock)
                        │
                        ▼
                   Session Store → Recruiter playback
```

Key behaviors:
- **Chunk interval:** ~8 seconds (`CHUNK_INTERVAL_MS` in `mediaRecorder.js`) via `requestData()` calls on a no-timeslice recorder, preserving the WebM header in the first blob.
- **Minimum size:** Blobs under 256 bytes are skipped client-side; server validates similarly.
- **Identifiers:** Each chunk has a deterministic `chunkId` (`sessionId-sequence-timestamp`) for duplicate protection.
- **Sequence resume:** After refresh, recording resumes at `lastChunkIndex + 1` from session checkpoint data.
- **Playback:** Recruiters stream via `GET /api/recordings/:sessionId/video` (auth required).

### WebSocket/event flow explanation

Two real-time channels serve different purposes:

| Channel | Path | Purpose |
|---------|------|---------|
| **Proctoring** | `ws://host/ws/proctoring?sessionId=…` | Tab switches, face absence, camera disconnect; heartbeat |
| **Pipeline / UI** | Socket.IO `/socket.io` | Chunk progress, merge/transcription status, new reports for recruiters |

**Proctoring flow (candidate session):**

```
Candidate Browser → connect(sessionId) → Proctoring WebSocket
                  → heartbeat (every 15s)
                  → tab_switch / face_absence / camera_disconnect events
                  ← proctoring_update (counters, flags written to session)
```

**Socket.IO pipeline events:**

| Event | Emitted when | Consumer action |
|-------|----------------|-----------------|
| `chunk_uploaded` | Chunk stored (or duplicate acknowledged) | Update upload counters |
| `transcription_progress` | Merge/transcribe stages | Show pipeline banner |
| `interview_completed` | Session marked complete, merge started | Refresh recruiter list |
| `report_generated` | Report + analytics persisted | Open review modal data |

Events are scoped to two Socket.IO rooms: `session:<id>` (candidate UI) and `recruiters` (dashboard broadcast).

---

## Technical Decisions & Tradeoffs

### Why you chose your approach

**Web Speech API for voice Q&A** was chosen over a dedicated ASR service during the interview because it adds zero per-session cost, runs entirely in-browser with sub-second latency, and produces a live transcript preview without an extra network round-trip. The tradeoff is browser dependency (Chrome/Edge required) and a separate audio path from the MediaRecorder recording, so the spoken answers feed voice recognition while the full audio+video is simultaneously recorded in chunks.

**JWT + role-based routing** keeps authentication simple and stateless for the two-role model (candidate / recruiter). The tradeoff is that it is not enterprise SSO-ready out of the box, but the architecture supports adding OIDC/SAML at the auth layer without changing downstream logic.

**MongoDB optional with JSON file fallback** means the project runs immediately with zero infrastructure for local development or demos, while the same code paths work against a real database in production. The tradeoff is that the file store is single-instance and not suitable for concurrent writes in production.

**In-process merge/transcription queues** keep the operational surface small for demos and single-server deployments. The queues are designed to be drop-in replaceable with SQS + Lambda workers by swapping the queue adapter — the pipeline interface is the same.

### Why streaming over full upload

| Full upload at end | Chunked streaming (chosen) |
|--------------------|----------------------------|
| Fails entirely if connection drops near finish | Most data already on server before interview ends |
| High memory use — entire recording held in browser RAM | Constant small memory footprint (~one chunk at a time) |
| No partial recovery possible | IndexedDB queue survives refresh; resumes from last uploaded chunk |
| Single long blocking request during submit | Uploads run in parallel with the interview, no blocking step |
| Recruiter sees nothing until complete upload | Recruiter dashboard updates in real time via Socket.IO |

The tradeoff for chunked streaming is merge complexity on the server (chunk ordering, FFmpeg dependency) and additional storage metadata. A byte-concat fallback handles environments where FFmpeg is not installed.

### Why your chosen architecture/design

The system is architected around **three isolation boundaries**:

1. **Client ↔ API** via REST for all session state, with the client maintaining a local copy in `localStorage` + `IndexedDB` so the interview survives API outages.
2. **Candidate ↔ Recruiter** via separate Socket.IO rooms so proctoring events never leak to the recruiter dashboard in real time (only aggregated after completion), and recruiter actions never reach the candidate session.
3. **Upload ↔ Session** as independent concerns — chunk upload failures do not block answer submission, and session completion triggers the merge pipeline rather than waiting for all chunks to be confirmed.

This design means a candidate with a poor network can still complete their interview (answers saved locally, chunks retried later), and a recruiter sees a report even if the merge pipeline is slow.

---

## Failure Scenarios & Edge Cases

### Network interruptions

| Phase | Behavior |
|-------|----------|
| **During interview** | `navigator.onLine` + upload queue pauses; chunks saved to IndexedDB; banner shows offline state |
| **On reconnect** | Queue drains automatically with up to 4 parallel workers; manual **Retry uploads** resets stalled items |
| **Checkpoints** | `patchSession` failures enqueue in `checkpointSyncQueue`; flushed when API health returns (polled every 15s) |
| **API polling** | Health check every 15s; restores "server connected" messaging and triggers flush |

### Duplicate chunks

Duplicates are handled at multiple layers:

1. **Client (memory)** — `chunkId` set deduplicates before enqueue; queue skips already-completed IDs in the same session.
2. **Client (IndexedDB)** — Restored pending chunks are keyed by `id`; re-enqueuing the same key is a no-op.
3. **Server** — `findChunkByChunkId` returns success with `duplicate: true` without re-writing storage.
4. **Race condition** — MongoDB unique index error code `11000` is treated as a successful duplicate acknowledgement.
5. **Disk** — Existing chunk file is skipped; metadata is registered if missing.

Re-uploading the same `chunkId` is always safe. Sequence numbers after a refresh use `lastChunkIndex + 1` to avoid overwriting different content under the same sequence filename.

### Camera/mic disconnects

- `track.onended` fires on every video track; the handler emits a `camera_disconnect` event to the proctoring WebSocket, which writes a flag to the session.
- The proctoring UI shows a live alert immediately.
- The recording queue is not stopped automatically — chunks already in flight are uploaded. The recorder attempts to continue if the track recovers.
- Permission errors distinguish **camera blocked**, **microphone blocked**, or **both**, with different user-facing messages and retry guidance for each case.
- Video-only fallback is allowed for the camera preview but a warning is shown when the mic is missing, because audio is required for the recording.

### Partial upload failures

- Individual chunk failures increment a `failed` counter and re-enqueue with `attempts` reset to enable exponential backoff.
- After `BACKOFF_MS.length` attempts (4 tries: 400ms → 800ms → 1600ms → 3200ms), the chunk is marked stalled and a structured error is logged.
- The interview can still be completed even with stalled chunks — the pipeline uses whatever chunks arrived.
- Stalled chunks remain in IndexedDB and can be retried manually via the **Retry uploads** button, which resets all attempt counters.

### WebSocket reconnects

The proctoring WebSocket (`proctoringSocket.js`) implements exponential backoff reconnection:
- Reconnect delay doubles with each failed attempt up to a maximum of 10 seconds.
- The heartbeat restarts automatically on reconnect.
- Events that arrive while disconnected are buffered in the client and replayed on reconnect via the `patchSession` checkpoint path, so no proctoring events are silently lost.

### Empty/corrupted media chunks

- Client skips blobs under 256 bytes before they reach the upload queue.
- Server `chunkValidator` middleware rejects payloads under the minimum size with HTTP 400 and structured log output.
- FFmpeg concat skips unreadable segments and logs the error; the byte-concat fallback simply concatenates whatever bytes arrived.
- The merge result is marked with `mergeStatus: failed` if FFmpeg exits non-zero, making the failure visible to recruiters without blocking report generation.

---

## Recovery Mechanisms

### How your system handles reconnects

**API reconnect:** A health check polls `GET /health` every 15 seconds. When it returns `ok: true` after a failure period, the system emits an `api_restored` event, flushes the `checkpointSyncQueue` (which replays any session patches that failed during the outage), and triggers a chunk upload retry.

**WebSocket reconnect:** The proctoring socket reconnects automatically with exponential backoff. The candidate UI shows a "Reconnecting…" pill in the proctoring panel. On reconnect, the socket rejoins the session room and the heartbeat resumes; no manual action is required.

**Network reconnect:** `window` online/offline events trigger queue flush and retry immediately when the network is restored. The chunk upload queue also subscribes to these events internally via `subscribeNetworkStatus`, so the queue self-activates without polling.

### Retry/recovery logic

Chunk uploads use a layered retry strategy:

```
Attempt 1 → wait 400ms
Attempt 2 → wait 800ms
Attempt 3 → wait 1600ms
Attempt 4 → wait 3200ms
→ stalled: logged, persisted, surfaced in UI as "Failed"
→ user can reset all attempts via Retry uploads button
```

Session checkpoints (`patchSession`) on failure enqueue to `checkpointSyncQueue`. The queue flushes in order when the API comes back, ensuring the server never has a stale view of the session state for long.

### Chunk recovery strategy

On page load after a refresh, `interviewRecovery.js` merges the server session state with the local `localStorage` progress snapshot:

1. Load server session via `GET /api/sessions/:id`.
2. Load local progress from `localStorage`.
3. Compare timestamps — whichever is newer wins field-by-field.
4. Restore `questionIndex` to `max(answers.length, server.questionIndex, local.questionIndex)`.
5. Restore `answers`, `elapsed`, `liveTranscript`, `uploadedChunkCount`.
6. Resume chunk recording at `lastChunkIndex + 1` to avoid re-uploading already-uploaded segments.
7. Pending IndexedDB chunks are re-enqueued from storage on recorder init.

### Failure handling approach

Client failures (camera errors, speech recognition faults, upload failures) are forwarded to the server via `POST /api/logs/client` using `failureLogger.js`. Each entry includes category, message, session ID, timestamp, and severity. This means production failures can be reproduced from server logs without requiring the candidate to report anything manually.

The system distinguishes **transient failures** (network issues, 5xx responses) which trigger retry, from **permanent failures** (permission denied, format unsupported) which surface a user message and stop retrying.

---

## Product Thinking

### Recruiter experience considerations

- **Single review surface:** Video replay, Q&A transcript, analytics scores, proctoring summary, and AI recommendation are all in one modal — no tab-switching between tools.
- **Live dashboard updates:** Socket.IO pushes new candidates to the recruiter list as interviews complete. Recruiters never need to refresh.
- **Actionable flags:** The proctoring summary distinguishes between tab switches (integrity concern) and face absence (camera setup issue) so recruiters can make informed judgments rather than treating all flags equally.
- **One-click decisions:** Approve and Reject buttons write the decision immediately; the candidate card updates its border color and badge in the grid.
- **Custom interview creation:** Recruiters create topic-driven interviews and distribute a single invite link. Only their own candidates appear in their dashboard, preventing cross-recruiter data leakage.
- **Downloadable reports:** The full report (scores, transcript, flags, strengths, improvements) can be downloaded as plain text for sharing with hiring committees who do not have platform access.

### Candidate experience considerations

- **Voice-guided flow:** IntervueX reads each question aloud via TTS and listens for the spoken answer. Candidates do not need to type. A live transcript preview shows what is being captured so they can self-correct.
- **Progress visibility:** A progress bar and "Q2/6" counter make it clear how far through the interview the candidate is. The elapsed timer and target duration help manage pacing.
- **Repeat question:** A "Repeat Question" button lets candidates hear the question again if they missed it, without counting as a proctoring event.
- **Offline resilience:** If the network drops, a banner explains that progress is saved locally. Candidates are not penalized for network issues outside their control — chunks resume uploading automatically.
- **Hardware check first:** The dashboard requires camera and microphone to be confirmed live before the Start button becomes active. This prevents candidates from discovering hardware issues mid-interview.
- **Session resume:** If a candidate accidentally closes the browser, they can return and resume from exactly the question they were on, with previously submitted answers preserved.

### How suspicious activities are tracked

Proctoring operates across three independent channels:

1. **Tab visibility** (`visibilitychange` event): A 800ms debounce prevents false positives from accidental flicks. Confirmed tab switches are sent to the proctoring WebSocket, incrementing `tabWarnings` on the session and creating a timestamped log entry.
2. **Face presence** (canvas pixel analysis): Every 1.5 seconds, a 64×64 sample of the upper-center of the video frame is analyzed for luminance variance and edge density. If the heuristic detects no face for 3.5 consecutive seconds, a `face_absence` event is fired. A 22-second cooldown prevents alert flooding.
3. **Camera disconnect** (`track.onended`): Fires immediately when the video track ends, sending a `camera_disconnect` event to the proctoring WebSocket.

All events create entries in `proctoringLog` on the session, which recruiters can view as a timestamped event timeline. The integrity score (0–10) penalizes tab switches (−2.5 each), face absences (−1.5 each), and empty answers.

### UX decisions made

- **No timeslice on MediaRecorder:** Using `requestData()` at intervals rather than `timeslice` preserves the WebM header in the first blob, keeping chunks independently playable and making FFmpeg concat more reliable.
- **Wave animation during listening:** Three animated bars under the AI avatar give candidates a clear visual signal that the microphone is active — reducing the anxiety of "is it recording me?"
- **Restore notice banner:** When a session is restored after a refresh, a dismissible info banner explains exactly what was recovered (e.g. "3/6 questions answered, 12 chunks uploaded") so candidates understand their state without guessing.
- **Error messages by cause:** Camera permission errors distinguish "camera blocked" vs "microphone blocked" vs "both blocked" with specific instructions for each, rather than a generic "something went wrong."

---

## Scalability Considerations

### What may break at scale

| Component | Break point |
|-----------|-------------|
| `sessions.json` file store | Concurrent writes will corrupt data beyond a single process |
| In-process merge queue | Cannot span multiple Node.js instances; jobs are lost on restart |
| In-process transcription queue | Same as merge — no durability, no distribution |
| Local disk `uploads/` | Cannot be shared across multiple servers without a network filesystem |
| Single WebSocket server | Sticky sessions required for Socket.IO if behind a load balancer |
| Face presence heuristic | Canvas pixel sampling is CPU-bound; high candidate count will saturate the client CPU |

### Performance bottlenecks

- **FFmpeg merge** is CPU and I/O intensive. A 30-minute interview with 225 chunks (8s each) requires reading and concatenating all chunks sequentially. At scale this should move to a dedicated worker fleet.
- **Chunk deduplication** uses a MongoDB unique index at scale, but the JSON file store does a linear scan. Any production deployment with more than ~100 concurrent sessions needs MongoDB.
- **4 parallel chunk uploads per session** is tunable via `MAX_CONCURRENT_UPLOADS`. Higher values increase throughput but may saturate upload bandwidth on the candidate's network.
- **Deepgram/Whisper transcription** adds latency after merge. The pipeline is async and non-blocking for the candidate, but recruiters see a "processing" state until it completes.

### Future improvements for high concurrency

| Area | Enhancement |
|------|-------------|
| **Queues** | Replace in-process queues with SQS + Lambda/ECS workers for merge and transcription; add dead-letter queues for failed jobs |
| **Storage** | Move all chunk storage to S3/R2 with presigned upload URLs so chunks go directly from browser to object storage, bypassing the API server |
| **Database** | MongoDB with a replica set for high availability; Redis for session caching and Socket.IO adapter |
| **WebSocket** | Redis-backed Socket.IO adapter for multi-instance deployments |
| **Media** | Adaptive chunk size based on measured upload bandwidth; WebCodecs pipeline for lower overhead; HLS for recruiter video playback |
| **Auth** | SSO (OIDC/SAML), magic links, org-level tenancy with row-level security |
| **Proctoring** | Move face detection to a WebWorker to avoid blocking the main thread; consider a lightweight WASM model for gaze direction |
| **Reliability** | Background Sync API for offline chunk uploads; service worker offline shell; cross-device resume via QR code |

---

## Observability & Debugging

### Logging strategy

The server logs structured JSON via `utils/logger.js` with consistent fields: `level`, `message`, `sessionId`, `durationMs`, and any domain-specific context. This makes logs parseable by CloudWatch, Datadog, or any JSON-aware log aggregator without post-processing.

The client mirrors this with `failureLogger.js`, which:
- Logs to the browser console with a `[IntervueX:category]` prefix for local debugging.
- Buffers up to 50 entries in memory for the session lifetime.
- Forwards every entry to `POST /api/logs/client` asynchronously using `keepalive: true` so logs are not lost when the page unloads.
- Skips forwarding when the browser is offline, preventing a log flood on reconnect.

### Error tracking

Errors are categorized at the point of origin:

| Category | Examples |
|----------|---------|
| `camera` | Permission denied, device not found, track ended |
| `speech` | Recognition not allowed, network error, audio capture failure |
| `chunk_upload` | Upload failed after retries, duplicate skipped |
| `chunk_persist` | IndexedDB write failed (quota exceeded) |
| `checkpoint` | `patchSession` failed, synced from queue |
| `recording` | MediaRecorder error, no stream available |
| `session_restore` | Server session not found, merge conflict |
| `complete_session` | Final submission failed after retries |

Each log entry includes `severity` (`error` or `warn`) so monitoring systems can alert on errors without being noisy about expected retry warnings.

### How production failures can be debugged

1. **Client errors** arrive at `POST /api/logs/client` with `sessionId`, category, message, and timestamp. Searching server logs by `sessionId` gives the full timeline of what happened on the candidate's browser.
2. **Chunk upload failures** are logged with `sequenceNumber` and `chunkId`. Cross-referencing with the session's `uploadedChunkKeys` array shows exactly which chunks are missing and at what sequence position.
3. **Merge failures** set `mergeStatus: failed` on the session record. The merge worker logs the FFmpeg stderr output, making codec or file corruption issues diagnosable from the server log.
4. **Transcription failures** set `transcriptionStatus: failed` with an `error` field. The provider error message (e.g. Deepgram API error code) is stored on the session and surfaced to the recruiter in the review panel.
5. **Health endpoint** `GET /health` returns `{ ok, database, ts }` — a quick check to confirm the API and database are reachable before investigating application-level issues.

---

## AI Usage Documentation

### How you used AI tools

AI assistance (Claude and Cursor) was used throughout this project as a collaborative development partner rather than a code generator. The interaction pattern was iterative: describe a system requirement or failure scenario, review the generated approach, critique tradeoffs, request alternatives, and integrate the result with manual adjustments.

### What prompts/thought process you used

The development followed a problem-first approach:

1. **Architecture prompts:** "Design a chunked video upload system that survives network interruptions in a browser interview context. The candidate must not lose progress." → Generated the `chunkUploadQueue` + IndexedDB persistence design.

2. **Failure scenario prompts:** "What are all the ways a 30-minute browser recording session can fail, and how should each be handled without interrupting the candidate?" → Produced the failure taxonomy now reflected in `userMessages.js` and the error category system.

3. **Proctoring design prompts:** "How can I detect face absence in a browser without a machine learning model, using only canvas pixel sampling?" → Generated the luminance variance + edge density heuristic in `facePresence.js`.

4. **Recovery logic prompts:** "A candidate refreshes the page mid-interview. What state needs to be merged between the server session and the localStorage snapshot, and what happens when they disagree?" → Produced the `mergeSessionWithProgress` logic in `interviewRecovery.js`.

5. **UX copy prompts:** "Write error messages for each camera/microphone failure mode that are specific enough to be actionable but not technical." → Produced the `MESSAGES` dictionary in `userMessages.js`.

### What decisions were yours vs AI-assisted

**Decisions that were mine:**

- The overall product scope: voice-guided Q&A + proctoring + recruiter dashboard as a unified system rather than separate tools.
- Choosing no-timeslice MediaRecorder with `requestData()` intervals over timeslice mode, after reading that timeslice can produce non-seekable WebM chunks.
- The two-Socket.IO-room design (`session:<id>` and `recruiters`) to isolate candidate and recruiter event flows.
- Keeping MongoDB optional with a JSON file fallback so the project is zero-infrastructure for evaluation.
- The integrity score formula weighting tab switches more heavily than face absences, based on judgment about signal reliability.
- The 22-second face absence alert cooldown to prevent flooding recruiters with spurious flags.

**AI-assisted decisions:**

- The exponential backoff values (400ms → 800ms → 1600ms → 3200ms) and the 4-parallel-worker limit for chunk uploads.
- The `buildCheckpointPatch` field-selection logic ensuring only changed fields are sent in PATCH requests.
- The canvas sampling region (upper 65% height, center 60% width) for face presence detection.
- The `waitForSpeechSynthesisIdle` polling approach to prevent TTS and speech recognition from overlapping.
- Structuring `failureLogger.js` to use `keepalive: true` on the fetch so logs survive page unloads.

**Reviewed and modified after AI generation:**

- The `resolveQuestionIndex` function required multiple iterations to handle the edge case where `readyToFinish` is true but `answers.length < questions.length` (early exit path).
- The `chunkUploadQueue` drain loop was rewritten to use proper parallel workers instead of the initial sequential version.
- The face presence heuristic thresholds (`variance > 50`, `edgeRatio > 0.055`) were tuned manually after testing against different lighting conditions.

---

## Demo & Walkthrough

### Setup instructions

**Prerequisites:**
- Node.js 20+ and npm 9+
- FFmpeg (optional, recommended for reliable WebM merge)
- HTTPS in production (required for camera/microphone and speech APIs)

**Install and run:**

```bash
# Clone the repository
git clone <repository-url>
cd Ai-interview

# Install all dependencies (frontend + server)
npm run setup

# Run API + frontend together (API on :5000, Vite on :5173)
npm run dev:all
```

Open **http://localhost:5173**. The Vite dev server proxies `/api`, `/health`, `/ws`, and `/socket.io` to the backend automatically.

**Run separately:**

```bash
# Terminal 1 — API server only
npm run dev:server

# Terminal 2 — Frontend only (after API is up)
npm run dev
```

**Demo accounts (seeded on server start):**

| Role | Email | Password |
|------|-------|----------|
| Recruiter | recruiter@demo.com | demo1234 |
| Candidate | candidate@demo.com | demo1234 |

**Environment variables** (copy `server/.env.example` to `server/.env`):

```bash
PORT=5000
JWT_SECRET=<long-random-secret>
NODE_ENV=development

# Optional — MongoDB (omit to use JSON file store)
# MONGODB_URI=mongodb+srv://...

# Optional — transcription
# DEEPGRAM_API_KEY=your_key
# OPENAI_API_KEY=your_key        # for Whisper
```

**Production build:**

```bash
npm run build          # Frontend → dist/
cd server && npm start # API server
```

Serve `dist/` behind nginx or Cloudflare. Route `/api`, `/socket.io`, and `/ws` to the Node process. Ensure WebSocket upgrade headers are enabled.

**Health check:**

```
GET /health
→ { ok: true, service: "intervuex-api", database: "mongodb" | "file-fallback" }
```

### Demo video

[📹 Demo video link — ](https://drive.google.com/file/d/1iwKOWqUgddPIOdsV6tVO6cFGHrKjDNRG/view?usp=drivesdk)

### Live link

[🌐 Live deployment — ](task-intervue-x-5fu5.vercel.app)

### System walkthrough explanation

**Candidate flow:**

1. Sign in or register as a candidate.
2. From the dashboard, allow camera and microphone access — the live preview confirms hardware is working.
3. Choose an interview track (or use a recruiter invite link for a custom interview).
4. Click **Start Interview** — IntervueX reads the first question aloud via the AI voice assistant.
5. Speak the answer. A live transcript shows what is being captured. Click **Submit Answer** when done.
6. Repeat for all 6 questions. The progress bar and question counter track position.
7. After the final answer, click **Finish Interview**. The recording uploads in the background; a completion screen confirms submission.

**Recruiter flow:**

1. Sign in as a recruiter.
2. Go to **My Interviews** → **Create Interview** to define a custom role with topics. Copy the invite link.
3. Share the invite link with candidates. Their completed interviews appear automatically in the **Candidates** tab.
4. Click **Review Interview** on any candidate card to open the full review: video replay, analytics scores (communication, technical, confidence, keyword match), proctoring summary (tab switches, face absence), and the AI recommendation.
5. Click **Approve** or **Reject** to record the decision. Download the full report as plain text if needed.

**Project structure:**

```
Ai-interview/
├── src/                          # React frontend
│   ├── App.jsx                   # Routes, interview UI, recruiter dashboard
│   ├── components/               # Camera, recording, recruiter panels, failures
│   ├── hooks/                    # Camera, voice, chunks, infrastructure, realtime
│   └── lib/
│       ├── interview/            # API, chunks, recovery, profiles, reports
│       ├── failure/              # Logging, user messages, checkpoint sync
│       └── realtime/             # Socket.IO client, events
├── server/
│   ├── index.js                  # Express + HTTP server entrypoint
│   ├── routes/                   # auth, sessions, chunks, reports, recordings
│   ├── services/
│   │   ├── storage/              # local + S3 adapters, chunk merge
│   │   ├── transcription/        # Whisper, Deepgram, mock providers
│   │   ├── analytics/            # Speaking time, scores, keywords
│   │   └── interviewPipeline.js  # Post-complete merge + transcribe orchestration
│   ├── websocket/                # Socket.IO server + proctoring WS handler
│   └── queues/                   # Merge + transcription in-process workers
├── ARCHITECTURE.md               # Supplementary technical notes
└── README.md                     # This document
```

---

*IntervueX — structured remote interviews with integrity, resilience, and recruiter-ready evidence.*
