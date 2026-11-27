# Punjab-wide Open Geospatial Command — implementation contract

Status: approved direction / architecture specification, NOT implemented. Public site remains an independently built simulated prototype; no government integration or official data implied.

## Map stack
- Replace Google Maps in the field UI with MapLibre GL JS (interactive WebGL) using a licensed OSM-derived vector tile provider or self-hosted OpenMapTiles/Planetiler tiles. For low-cost first demo, Leaflet with an explicitly permitted, attributed raster tile provider is acceptable. Do not use tile.openstreetmap.org as an unrestricted production tile CDN; obey OSM tile policy, rate limits, attribution and caching requirements.
- No Google billing key, card, static-map fallback or Google geocoding dependency in the default path. Remove Google client calls only after replacement passes smoke tests.
- Geolocation via browser navigator.geolocation over HTTPS; draw current worker, GPS accuracy radius and 15m asset geofence separately. Live GPS is not proof of cleaning.
- Routing via OSRM/Valhalla/GraphHopper using legally sourced OSM road graphs; display real road geometry only on successful route computation. Haversine fallback must be visibly labeled straight-line distance, never shown as road routing.
- School/hospital overlays via tagged OSM POIs (amenity=school, amenity=hospital, amenity=clinic, healthcare=*) using a cached server-side Overpass ingestion process, not unrestricted browser requests to public Overpass. Display source, last sync, completeness disclaimer; don't assume POIs exhaustive.
- Punjab boundaries: source authoritative, legally reusable Punjab province, divisions, districts, tehsils and union councils polygons; version each boundary dataset. Don't invent precise boundaries from seed coordinates. Verify licensing and administrative changes.
- Province overview should use aggregated vector tiles/clustering and spatial indexes, never render all individual bins as DOM markers.

## Government hierarchy and authorization
The hierarchy is a proposed workflow, not a claim about statutory powers. Jurisdiction and approvals must be configurable and reviewed with the relevant department.
- Chief Minister: province-wide executive overview (read-only by default).
- Chief Secretary: province-wide interdepartmental oversight and escalations.
- Secretary (relevant department): department-wide policy and operations visibility.
- DG / Director: assigned directorate/program oversight; not automatically subordinate to every Secretary.
- Commissioner: division-wide territorial oversight.
- DC: district-wide oversight.
- AC: assigned subdivision/tehsil oversight.
- Local government/municipal administrator, UC supervisor, sanitation supervisor, field worker: delegated local operations.
- Schools and hospitals belong to separate education/health data domains; mapping them must not grant waste staff authority over their records.

RBAC is not a single ladder: combine role permissions with ABAC jurisdiction scope and organization/program assignment. Support users holding multiple roles; grant least privilege and explicit delegation. Persist all approvals and assignments with effective dates. Deny by default; audit authorization decisions and all evidence mutations. Demo role switcher is not authentication and must remain DEMO ONLY.

## Backend production target
- Laravel API + PostgreSQL/PostGIS authoritative; Redis queue/cache; object storage for immutable evidence originals; signed URLs, server-side SHA-256, timestamps and chain-of-custody audit.
- Core tables: administrative_units(id,type,parent_id,geometry,source_version); organizations; roles; permissions; user_role_assignments(user_id,role_id,organization_id,unit_id,valid_from,valid_to); assets(geom,unit_id); field_events; evidence; review_decisions; poi_features(source_id,category,geom,last_synced_at); audit_events.
- Enforce server-side geospatial jurisdiction, not merely client filters; row-level tenant/program isolation and explicit cross-organization visibility policies.
- Never count simulated evidence in operational KPIs. Approval workflow requires before and after images, supervisor review and provenance; GPS alone insufficient.

## Rollout and acceptance gates
P0: replace static Google map with interactive OSM-based Punjab map; map pan/zoom, attribution, current location, demo bins, 15m circle, no card required; mobile HTTPS verified.
P1: province/division/district/tehsil drill-down with real boundary provenance; school/hospital POI overlays, cached and filterable; accurate route vs straight-line labeling.
P2: backend authentication, hierarchical role + jurisdiction policies, immutable evidence, review workflow, cross-departmental dashboards, tests.
P3: scale/load/security/field tests and authorized integration with government systems.

No public release claims that P1-P3 are implemented until tests and operational verification succeed. Never touch /opt/skos or SKOS containers during Suthra deployment.
