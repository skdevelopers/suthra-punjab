# Executive demo readiness register

Reviewed against `main` at `e499ca3957d2f094a032eacef848dd7d07f1ce2c` (11 November 2026). Status: **code-reviewed, runtime/deployment not verified**.

| Priority | Gap | Acceptance gate |
|---|---|---|
| P0 | Evidence 'SHA-256' is simulated metadata digest, not actual image-byte hash. | Compute real Web Crypto SHA-256 on exact evidence bytes; verify with independent digest; remove misleading simulated hash claim. |
| P0 | Browser live-GPS evidence is still a demo; cannot become official operations. | Tag every record PROTOTYPE; production metrics remain zero with no approved backend. |
| P0 | Data exists only in React state; refresh resets workflow. | Clearly disclose reset behavior or implement IndexedDB demo-only persistence. |
| P0 | Browser calls Maps Geocoding REST URL, exposing a key subject to differing restriction/CORS requirements. | Switch to browser Maps JS Geocoder (where supported), or backend proxy with proper credentials and allowed access. |
| P0 | No verified end-to-end HTTPS deployment / Google Cloud key and billing configuration. | Valid hostname, TLS, Maps allowed referrers, rendered map, camera/GPS permission checks and executive walkthrough. |
| P1 | Demo role switcher is not authentication. | Keep demo-only; production reviewers require backend-enforced RBAC. |
| P1 | 15m geofence cannot establish worker authenticity or cleaning. | Preserve uncertainty warnings and supervisor review; no fraud-proof claims. |
| P1 | Router and Routes Library integration need browser-level validation. | Distinguish Haversine and road distance; do not fabricate ETA; verify walking/driving behavior. |
| P1 | Existing `geofenceAndWorkflow.test.ts` has no configured script in `package.json`. | Add executable test harness/CI, verify passing tests, add regression cases. |
| P1 | Static hosting does not provide trusted audit trail/storage. | Laravel + PostGIS + object storage and server controls before any pilot. |
| P2 | Scope is Module A field evidence. Fixed CCTV and One Map Health are not implemented. | Position future scope separately and do not market as deployed features. |

## Deployment safety notes

- No government source data; eight fictional Lahore demo assets.
- Never deploy a backend AI key, PITB token, or private secret inside the Vite frontend.
- Restrict access for executive presentations; assume browser screenshots/evidence can be copied.
- Clear demo browser state between presentations and use privacy-aware demonstration content.
- Confirm department representatives' names, offices and titles from official correspondence before personalized briefings.
