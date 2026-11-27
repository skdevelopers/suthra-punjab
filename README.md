# Suthra Punjab — Smart Waste Field Evidence | Interactive Operational Prototype

**A geospatial field-operations engineering demonstration by [SK Developers](https://skdevelopers.info), architected by Muhammad Salman Khalid (Salman), with Atlas as an AI engineering collaborator.** Our objective is PRIME-level engineering quality—precision, reliability, integrity, maintainability, and excellence. **PRIME is not the product name.**

> **Independent technical demonstration — NOT an official Government of Punjab application.** All seeded waste baskets and Union Council assignments are **fictional demo assets**. This repository is **not** connected to PITB, LG&CD, or operational government databases, and it does not constitute a government endorsement, procurement award, or deployed production system.

## Executive overview

Suthra Punjab demonstrates how district and local-government teams could improve field-visit traceability through a mobile geospatial workflow: select a public waste asset, check reported worker proximity, capture **before** and **after** photographic evidence, and submit records for **human supervisor review**. The interactive **Desk Simulator** allows a live presentation without sending a worker to a physical bin. This project is a field evidence module, **not** a fixed-CCTV monitoring system.

**For secretaries, chief secretaries, commissioners, deputy commissioners, and government IT leaders:** the value proposition is a testable workflow and a proposed integration architecture—not invented impact figures or claims of official deployment. The engineering team can scope a formal discovery, security review, data-sharing agreement, pilot, and production transition with an authorized sponsoring department.

**Contact:** [SK Developers](https://skdevelopers.info) · WhatsApp **+92 300 8666716** · [GitHub](https://github.com/skdevelopers/suthra-punjab)

## What is in the current repository

- React 19 / TypeScript / Vite / Tailwind CSS application.
- Google Maps component with map markers, worker marker, accuracy halo, 15-metre asset circle, and modern Routes / RouteMatrix code paths (subject to API access and runtime verification).
- Fictional Lahore waste basket data in `src/data/lahoreDemoBins.ts`.
- Desk Simulation and browser live-device GPS modes.
- Three-part proximity gate: reported distance **≤15m**, reported accuracy **≤25m**, fix freshness **≤15s**.
- In-app camera preview, synthetic fallback, uploaded-file fallback, canvas **evidence watermark**, and before/after capture UI.
- Workflow: **Pending → Before captured → After captured → Awaiting review → Verified cleared**, with supervisor rejection/reinspection.
- Demo role switcher and separate simulated record counters.
- Source-level geofence/workflow test cases in `src/utils/geofenceAndWorkflow.test.ts` (a dedicated automated test runner is **not** currently configured in package scripts).

### Evidence integrity & limitations

**Do not call this system fraud-proof, tamper-proof, or production-ready.** Browser geolocation can be inaccurate/spoofed and does not prove cleaning. Canvas watermarks are editable and are not proof of original capture. Camera file upload and procedural/synthetic fallback do not establish a live scene. The current code uses **`computeSimulatedSha256Hex`** for a **simulated digest**, not a cryptographic hash of image bytes; the interface must not represent it as a verified SHA-256 content hash. Production evidence assurance requires original image retention, real SHA-256 computed on actual uploaded bytes, server-generated timestamps, authenticated identity, append-only audit history, idempotent submissions, review separation and independent storage controls. Even these controls do not prove a scene is genuine.

**Important prototype limitation:** the waste-bin state lives in React component state. Session changes are **not** authoritative, multi-user, or durable across browser refresh; there is no deployed Laravel API/PostgreSQL backend in this repository. All records—**including those collected using live device GPS—remain prototype records**. Do not present any browser KPI as an official live operational KPI.

### Modules and future integration

**Module A — Mobile Field-Visit Evidence Capture** (implemented prototype): simulated/location-enabled visits, capture, workflow, demo supervisor review.

**Module B — Fixed-CCTV Observation Feed** (separate proposed integration): authorized cameras may generate observations, but these are not proof of cleared service and require review; not implemented here.

**Punjab One Map — Integrated District Intelligence & Operations Platform** is the **proposed expansion**: independent municipal and health domains (DHQ / THQ / RHC) on a cross-department spatial command layer. These wider domains and PITB connectors are **not yet implemented in this repository**. PITB data access would require departmental sponsorship and formal approval under the applicable government procedures. No PITB APIs or credentials are supplied.

## Local development

Requires a modern Node/Bun-compatible environment. Repo includes `bun.lock`.

```bash
bun install --frozen-lockfile
cp .env.example .env
# Set VITE_GOOGLE_MAPS_API_KEY to a Google Maps browser key restricted to your origin & necessary APIs.
bun run dev
```

Open `http://localhost:3000`. To check TypeScript and compile the static assets:

```bash
bun run lint
bun run build
```

The `lint` script runs `tsc --noEmit`; this is not a substitute for browser E2E tests. `GEMINI_API_KEY` should **not** be placed in a browser bundle. At present, a Gemini backend is not required for the static demo. Consult `.env.example` and `vite.config.ts` before changing environment variable names.

## Contabo VPS — Docker executive demo deployment

This repository supplies a **static frontend** Docker image using multi-stage Bun build and unprivileged Nginx. It does **not** expose a private API or database. Run behind an **existing HTTPS reverse proxy** on Contabo—particularly important for browser camera and geolocation secure contexts. The container binds **only to 127.0.0.1** on the VPS and must not be opened directly to the public internet.

### 1. Prepare an isolated application directory

```bash
git clone https://github.com/skdevelopers/suthra-punjab.git
cd suthra-punjab
# Use the reviewed deployment branch until merged into main:
git checkout feat/contabo-executive-demo-readiness
cp .env.example .env
```

Edit `.env` and set `VITE_GOOGLE_MAPS_API_KEY` for the demo hostname. A browser key is **public by design** even when injected by a build argument. Restrict it in Google Cloud Console by HTTPS website referrer **and** allowed APIs. Do not use an unrestricted key or a server-side credential.

### 2. Build and start

```bash
docker compose up -d --build
docker compose ps
curl -fsS http://127.0.0.1:18080/healthz
```

If the host port is occupied, set `DEMO_HTTP_PORT` in `.env` before launch. The demo remains local-only on the VPS until a TLS reverse proxy is configured.

### 3. HTTPS reverse proxy

Use a dedicated hostname you control, e.g. `suthra-demo.skdevelopers.info`, pointed by DNS to the VPS. Configure **the existing** Nginx/Caddy/Virtualmin proxy or ingress—not a second service competing for ports 80/443—to terminate a valid TLS certificate and proxy all traffic to `http://127.0.0.1:18080`. Preserve the `Host` and forwarded HTTPS headers. Enable reasonable request limits and optional password/IP access controls for an invitation-only demonstration. Verify the browser sees **HTTPS**; camera and geolocation generally require secure contexts.

For an existing Nginx TLS server block, the relevant proxy location is:

```nginx
location / {
    proxy_pass http://127.0.0.1:18080;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

Do **not** paste the above as a standalone server block; adapt the current virtual host and certificate configuration. Confirm DNS, firewall, certificate, and Google Maps referrer restrictions before presenting the URL.

### 4. Operational checks & roll back

```bash
docker compose ps
docker compose logs --tail=100 suthra-punjab
curl -fsS http://127.0.0.1:18080/healthz
```

For rollback, use a known-good, reviewed Git commit and rebuild the image; record the deployed commit SHA. This static demo currently has no database, migrations, or shared evidence store. Do not promote it to real field use until an approved backend and security controls are in place.

## Executive presentation checklist

1. Open the **HTTPS** demo and show the *simulated* banner.
2. Confirm Google Maps renders and explain browser-key restrictions.
3. Start Desk Simulation: worker outside the bin remains capture-locked.
4. Move the worker near a fictional bin and show **distance, accuracy and freshness**.
5. Show poor/stale GPS preventing capture.
6. Capture before/after **demo evidence** and inspect watermarks.
7. Submit for reviewer approval; explain the demo role switcher is not authentication.
8. Show the distinct demo audit sandbox and explain the absence of a live government feed.
9. Explain future government integration via formal authorization and security review.

## Production transition proposal

A future authorized deployment should add a Laravel API for assignment authority and approval, PostgreSQL/PostGIS for relational and spatial integrity, object storage for immutable original evidence, trusted server timestamps, real content digests, identity/RBAC, audit event retention, transactional approvals and concurrency/idempotency protection. Add staging, CI/test suites, backups, observability, rollback rehearsal and privacy/security assessment before pilot operations.

### Partnership & evaluation

SK Developers is an independent software engineering and DevOps firm providing system architecture, geospatial application engineering, API integration, cloud infrastructure, reliability engineering and secure operational workflows. To assess a commissioned government pilot, scope the sponsoring department, governance owner, legal data permissions, target district/UCs, operational KPIs, infrastructure, acceptance tests, support terms and procurement process. **This README is a capability demonstration, not a representation of official vendor selection or procurement eligibility.**

**Engineering:** Muhammad Salman Khalid (Salman) · SK Developers · [skdevelopers.info](https://skdevelopers.info) · **+92 300 8666716**
