# DWES Live Updates (SSE) — Operations Notes

DWES pushes data changes to signed-in users over Server-Sent Events at
`GET /api/events/stream`. Screens then refresh **only the affected** project, panel, row, or
KPI — no page reload, no spinner, no lost selection. Interval polling is a **fallback only**
and runs solely while the stream is down.

---

## 1. Reverse proxies must not buffer the stream

A buffering proxy holds SSE frames until its buffer fills. The browser still looks
"connected", so live updates arrive late or not at all.

**Two defences are in place:**

1. **The backend declares it** — `/api/events/stream` responds with
   `X-Accel-Buffering: no` and `Cache-Control: no-cache, no-transform`.
   nginx honours `X-Accel-Buffering` even when `proxy_buffering` is left on, so the stream
   stays correct behind a proxy DWES does not control.
2. **The bundled nginx config sets it explicitly** — `infra/nginx/conf.d/dwes.conf`:

   ```nginx
   location = /api/events/stream {
     proxy_pass http://dwes_api;
     include /etc/nginx/proxy_params.conf;   # HTTP/1.1 + Connection "" (required for SSE)
     proxy_buffering off;
     proxy_cache off;
   }
   ```

**If you deploy behind a different proxy**, confirm all of the following:

| Requirement | Why |
|---|---|
| HTTP/1.1 to the upstream (`proxy_http_version 1.1`, `Connection ""`) | HTTP/1.0 cannot stream a chunked response |
| Response buffering **off** for this path | Otherwise frames are held back |
| Read timeout **> 25 s** (the heartbeat interval; DWES ships 120 s) | Otherwise the proxy kills an idle stream |
| No response compression/transform on this path | A compressor re-buffers the body |

**Cloudflare:** SSE works, but disable any "Rocket Loader"/optimization on the path.
**Verify quickly** — a healthy stream emits a heartbeat frame immediately and then every 25 s:

```bash
curl -N -H "Authorization: Bearer <token>" https://<host>/api/events/stream
```

**If the stream is unusable, DWES still works**: the client detects the dead stream (no frame
within 65 s) and automatically resumes interval polling. The app degrades to "slightly
delayed" — never to "broken".

---

## 2. The event bus is in-process — single backend instance only

`EventsService` fans events out through an in-memory RxJS subject. This matches how DWES is
deployed today (one Nest process).

**Constraint:** with **two or more backend replicas**, a client connected to replica A would
not receive events published by replica B. Screens on that client would fall back to their
last known data until the next poll or navigation — a silent staleness bug, not a crash.

**Before scaling horizontally**, replace the in-process subject with a shared channel.
The touch point is deliberately small — `EventsService.publish()` / `asObservable()` in
`backend/src/events/events.service.ts`; nothing else in the app publishes or subscribes:

- **PostgreSQL `LISTEN`/`NOTIFY`** — no new infrastructure (the DB is already there);
  publish becomes `NOTIFY dwes_events, '<json>'`, and each replica `LISTEN`s. Payloads are
  capped at 8 kB, which is ample for these events.
- **Redis Pub/Sub** — if Redis is introduced for any other reason.

Until then, run exactly one backend process. Do not set a replica count above 1.

---

## 3. What is streamed, and to whom

Events are **role-filtered on the server** (`backend/src/events/event-visibility.ts`) so the
stream never widens REST authorization:

| Role | Receives |
|---|---|
| System Admin / Production Supervisor / Operations Director | all changes |
| QA / QC Engineer | project, panel, assignment, inspection scopes |
| Wiring Technician | assignment events, plus changes to panels they are **currently assigned to** — nothing about any other panel or project |

Each mutation is tagged with the originating **browser tab** (`X-DWES-Client-Id`). That tab
skips its own echo (it already refreshed locally), while every other client — including the
same user on a second device — applies the change.
