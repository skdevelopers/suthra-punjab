import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Camera,
  CheckCircle2,
  Compass,
  Footprints,
  KeyRound,
  Layers,
  LocateFixed,
  Lock,
  MapPin,
  Navigation,
  Radio,
  Send,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  Truck,
  Unlock,
} from 'lucide-react';
import {
  ActiveRoleView,
  AuditLogEntry,
  BinWorkflowStatus,
  EvidencePhotoRecord,
  LatLngPoint,
  RouteComputationResult,
  TravelModeOption,
  WasteBinAsset,
  WorkerTelemetryState,
} from './types/waste';
import { INITIAL_LAHORE_DEMO_BINS } from './data/lahoreDemoBins';
import {
  calculateHaversineDistanceMeters,
  computeOperationalVsSimulatedKpis,
  evaluateProximityAndAccuracyGate,
  findNextNearestPendingBin,
  GEOFENCE_MAX_DISTANCE_METERS,
  GPS_MAX_ACCURACY_METERS,
  GPS_MAX_AGE_SECONDS,
  transitionBinStage,
} from './utils/geofenceAndWorkflow';
import { FieldGoogleMap } from './components/FieldGoogleMap';
import { CameraEvidenceModal } from './components/CameraEvidenceModal';
import { SupervisorReviewView } from './components/SupervisorReviewView';
import { ApiKeyGovernanceModal } from './components/ApiKeyGovernanceModal';

const WORKFLOW_STAGES: BinWorkflowStatus[] = [
  'Pending',
  'Before captured',
  'After captured',
  'Awaiting review',
  'Verified cleared',
];

const ENV_MAPS_KEY =
  (typeof process !== 'undefined' &&
    (process.env.GOOGLE_MAPS_PLATFORM_KEY || process.env.GOOGLE_MAPS_API_KEY)) ||
  (import.meta as any).env?.VITE_GOOGLE_MAPS_API_KEY ||
  '';

export default function App() {
  // Mandatory Tier 1 & Tier 2 Google Maps Platform Demo Key Quota Banner State
  const [quotaExceeded, setQuotaExceeded] = useState(false);

  useEffect(() => {
    const handleQuotaExceeded = () => setQuotaExceeded(true);
    window.addEventListener('gmp-quota-exceeded', handleQuotaExceeded);
    return () =>
      window.removeEventListener('gmp-quota-exceeded', handleQuotaExceeded);
  }, []);

  // Maps API Key Governance State
  const [customApiKey, setCustomApiKey] = useState<string>('');
  const [isApiKeyModalOpen, setIsApiKeyModalOpen] = useState<boolean>(false);
  const activeApiKey = customApiKey || ENV_MAPS_KEY;

  // Core Role & Demo Simulator State
  const [activeRoleView, setActiveRoleView] =
    useState<ActiveRoleView>('FIELD_CREW');
  const [isDemoMode, setIsDemoMode] = useState<boolean>(true);
  const [travelMode, setTravelMode] = useState<TravelModeOption>('WALKING');

  // Seeded 8 Lahore Fictional Demo Bins
  const [bins, setBins] = useState<WasteBinAsset[]>(INITIAL_LAHORE_DEMO_BINS);
  const [activeBinId, setActiveBinId] = useState<string>('DEMO-LHR-UC42-01');

  // Worker Location & GPS Telemetry State (Starts ~38m away from Bin #01 so presenter sees both locked & unlocked states)
  const [worker, setWorker] = useState<WorkerTelemetryState>({
    position: { lat: 31.55829, lng: 74.32901 },
    accuracyMeters: 6.4,
    timestampMs: Date.now(),
    source: 'DESK_SIMULATOR',
    workerId: 'WRK-LHR-409',
    workerName: 'M. Tariq (Field Crew Alpha)',
  });

  const [nowMs, setNowMs] = useState<number>(Date.now());
  const [simulatePoorGpsFix, setSimulatePoorGpsFix] = useState<boolean>(false);
  const [simulateStaleFix, setSimulateStaleFix] = useState<boolean>(false);
  const [gpsWatchError, setGpsWatchError] = useState<string | null>(null);

  // Route & RouteMatrix State
  const [activeRouteResult, setActiveRouteResult] =
    useState<RouteComputationResult | null>(null);
  const [routeMatrixByBinId, setRouteMatrixByBinId] = useState<
    Record<string, { distanceMeters: number; durationSeconds: number }>
  >({});

  // Camera Modal State
  const [cameraModalState, setCameraModalState] = useState<{
    isOpen: boolean;
    stage: 'BEFORE' | 'AFTER';
  }>({ isOpen: false, stage: 'BEFORE' });

  // Status feedback banner
  const [feedbackBanner, setFeedbackBanner] = useState<{
    tone: 'emerald' | 'amber';
    text: string;
  } | null>(null);

  const activeBin = useMemo(
    () => bins.find((b) => b.id === activeBinId) || bins[0],
    [bins, activeBinId]
  );

  // Keep timestamp fresh in Desk Simulator mode unless simulating a stale fix
  useEffect(() => {
    const interval = window.setInterval(() => {
      const current = Date.now();
      setNowMs(current);
      if (isDemoMode && !simulateStaleFix) {
        setWorker((prev) => ({
          ...prev,
          timestampMs: current - 2000,
        }));
      }
    }, 2000);
    return () => window.clearInterval(interval);
  }, [isDemoMode, simulateStaleFix]);

  // Live Device GPS Watcher when Demo Mode is OFF
  useEffect(() => {
    if (isDemoMode) {
      setGpsWatchError(null);
      setWorker((prev) => ({
        ...prev,
        source: 'DESK_SIMULATOR',
      }));
      return;
    }

    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setGpsWatchError(
        'navigator.geolocation is not supported by this browser. Revert to Desk Simulator Mode to test movement.'
      );
      return;
    }

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        setGpsWatchError(null);
        setWorker((prev) => ({
          ...prev,
          position: {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
          },
          accuracyMeters: pos.coords.accuracy || 12,
          timestampMs: pos.timestamp || Date.now(),
          source: 'LIVE_DEVICE_GPS',
        }));
        setNowMs(Date.now());
      },
      (err) => {
        setGpsWatchError(
          `Live Device GPS signal unavailable (${err.message}). Toggle Desk Simulator ON to simulate field coordinates.`
        );
      },
      {
        enableHighAccuracy: true,
        maximumAge: 5000,
        timeout: 12000,
      }
    );

    return () => {
      navigator.geolocation.clearWatch(watchId);
    };
  }, [isDemoMode]);

  // Reverse Geocoding solely for approximate street context on activeBin
  useEffect(() => {
    if (!activeApiKey || activeBin.reverseGeocodedStreet) return;

    let cancelled = false;
    const { lat, lng } = activeBin.coordinates;
    const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${encodeURIComponent(
      activeApiKey
    )}`;

    fetch(url)
      .then(async (res) => {
        if (res.status === 429) {
          window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
          return null;
        }
        return res.json();
      })
      .then((data) => {
        if (cancelled || !data) return;
        if (
          data.status === 'OVER_QUERY_LIMIT' ||
          data.error?.status === 'RESOURCE_EXHAUSTED'
        ) {
          window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
          return;
        }
        const formatted = data.results?.[0]?.formatted_address;
        if (formatted) {
          setBins((prev) =>
            prev.map((b) =>
              b.id === activeBin.id
                ? { ...b, reverseGeocodedStreet: formatted }
                : b
            )
          );
        }
      })
      .catch(() => {
        // Fallback street context handled cleanly in UI
      });

    return () => {
      cancelled = true;
    };
  }, [activeApiKey, activeBin.id, activeBin.coordinates, activeBin.reverseGeocodedStreet]);

  // Straight-line Haversine distance & 3-condition Proximity/Accuracy Gate
  const straightLineDistanceMeters = useMemo(
    () =>
      calculateHaversineDistanceMeters(worker.position, activeBin.coordinates),
    [worker.position, activeBin.coordinates]
  );

  const effectiveAccuracyMeters = simulatePoorGpsFix
    ? 34.0
    : worker.accuracyMeters;
  const effectiveLocationTimestampMs = simulateStaleFix
    ? nowMs - 21000
    : worker.timestampMs;

  const gateEvaluation = useMemo(
    () =>
      evaluateProximityAndAccuracyGate({
        distanceMeters: straightLineDistanceMeters,
        accuracyMeters: effectiveAccuracyMeters,
        locationTimestampMs: effectiveLocationTimestampMs,
        nowMs,
      }),
    [
      straightLineDistanceMeters,
      effectiveAccuracyMeters,
      effectiveLocationTimestampMs,
      nowMs,
    ]
  );

  // Separated Operational vs Simulated Demo Sandbox KPIs
  const separatedKpis = useMemo(
    () => computeOperationalVsSimulatedKpis(bins),
    [bins]
  );

  // Next Nearest Pending Bin calculation (uses RouteMatrix road distance when available, fallback Haversine)
  const roadDistancesMap = useMemo(() => {
    const out: Record<string, number> = {};
    for (const [id, val] of Object.entries(routeMatrixByBinId)) {
      out[id] = val.distanceMeters;
    }
    return out;
  }, [routeMatrixByBinId]);

  const nextNearestPending = useMemo(
    () =>
      findNextNearestPendingBin(
        worker.position,
        bins,
        activeBin.id,
        roadDistancesMap
      ),
    [worker.position, bins, activeBin.id, roadDistancesMap]
  );

  const handleMoveWorker = useCallback((coords: LatLngPoint) => {
    const current = Date.now();
    setNowMs(current);
    setWorker((prev) => ({
      ...prev,
      position: coords,
      timestampMs: current,
    }));
  }, []);

  const handleSimulateArrivalAtActiveBin = () => {
    handleMoveWorker({
      lat: activeBin.coordinates.lat + 0.000032,
      lng: activeBin.coordinates.lng + 0.000018,
    });
    setFeedbackBanner({
      tone: 'emerald',
      text: `Desk Simulator: Worker marker moved inside 15m target geofence of ${activeBin.id}. Evidence capture unlocked (tagged DEMO — SIMULATED EVIDENCE).`,
    });
  };

  const handleSelectNextNearestPending = () => {
    if (!nextNearestPending) return;
    setActiveBinId(nextNearestPending.bin.id);
    setFeedbackBanner({
      tone: 'emerald',
      text: `Switched target to nearest pending asset: ${nextNearestPending.bin.id} (${nextNearestPending.effectiveDistanceMeters.toFixed(0)}m estimated route).`,
    });
  };

  // Handle Step 1 (Before) & Step 2 (After) Photo Capture Confirmation
  const handleConfirmEvidencePhoto = (record: EvidencePhotoRecord) => {
    setBins((prev) =>
      prev.map((b) => {
        if (b.id !== activeBin.id) return b;

        if (record.stage === 'BEFORE') {
          const nextStatus = transitionBinStage(b.status, 'CAPTURE_BEFORE');
          const auditEntry: AuditLogEntry = {
            id: `AUD-${Date.now()}`,
            timestampUtc: record.capturedAtUtc,
            actor: record.workerId,
            action: `Captured Step 1 BEFORE Photo (${
              record.isSimulated
                ? 'DEMO — SIMULATED EVIDENCE'
                : 'Live Device GPS'
            })`,
            statusFrom: b.status,
            statusTo: nextStatus,
            isSimulated: record.isSimulated,
            sha256Digest: record.sha256Hash,
          };
          return {
            ...b,
            status: nextStatus,
            isSimulatedEvidence: b.isSimulatedEvidence || record.isSimulated,
            beforePhoto: record,
            rejectionReason: undefined,
            auditTrail: [...b.auditTrail, auditEntry],
          };
        } else {
          const afterCapturedStatus = transitionBinStage(
            b.status,
            'CAPTURE_AFTER'
          );
          const auditEntry: AuditLogEntry = {
            id: `AUD-${Date.now()}`,
            timestampUtc: record.capturedAtUtc,
            actor: record.workerId,
            action: `Captured Step 2 AFTER Photo (${
              record.isSimulated
                ? 'DEMO — SIMULATED EVIDENCE'
                : 'Live Device GPS'
            })`,
            statusFrom: b.status,
            statusTo: afterCapturedStatus,
            isSimulated: record.isSimulated,
            sha256Digest: record.sha256Hash,
          };
          return {
            ...b,
            status: afterCapturedStatus,
            isSimulatedEvidence: b.isSimulatedEvidence || record.isSimulated,
            afterPhoto: record,
            auditTrail: [...b.auditTrail, auditEntry],
          };
        }
      })
    );

    setCameraModalState({ isOpen: false, stage: 'BEFORE' });
    setFeedbackBanner({
      tone: 'emerald',
      text:
        record.stage === 'BEFORE'
          ? `Step 1 complete: "Before" watermarked photo recorded for ${activeBin.id}. Clean the bin and capture the "After" photo.`
          : `Step 2 complete: "After" watermarked photo recorded for ${activeBin.id}. Click "Submit Evidence to Supervisor Queue" to transition to Awaiting review.`,
    });
  };

  // Submit After captured -> Awaiting review
  const handleSubmitToSupervisorReview = () => {
    if (activeBin.status !== 'After captured') return;
    const nowUtc = new Date().toISOString();
    setBins((prev) =>
      prev.map((b) => {
        if (b.id !== activeBin.id) return b;
        const nextStatus = transitionBinStage(b.status, 'SUBMIT_FOR_REVIEW');
        const auditEntry: AuditLogEntry = {
          id: `AUD-${Date.now()}`,
          timestampUtc: nowUtc,
          actor: worker.workerId,
          action: 'Submitted Before & After Watermarked Package to Supervisor Approval Queue',
          statusFrom: b.status,
          statusTo: nextStatus,
          isSimulated: b.isSimulatedEvidence,
          sha256Digest: b.afterPhoto?.sha256Hash,
        };
        return {
          ...b,
          status: nextStatus,
          submittedAtUtc: nowUtc,
          auditTrail: [...b.auditTrail, auditEntry],
        };
      })
    );
    setFeedbackBanner({
      tone: 'emerald',
      text: `${activeBin.id} transitioned to "Awaiting review". Switch to Supervisor Review & Command View to inspect and approve clearance.`,
    });
  };

  // Supervisor Approve: Awaiting review -> Verified cleared
  const handleSupervisorApprove = (binId: string, supervisorId: string) => {
    const nowUtc = new Date().toISOString();
    setBins((prev) =>
      prev.map((b) => {
        if (b.id !== binId) return b;
        const nextStatus = transitionBinStage(b.status, 'SUPERVISOR_APPROVE');
        const auditEntry: AuditLogEntry = {
          id: `AUD-${Date.now()}`,
          timestampUtc: nowUtc,
          actor: supervisorId,
          action: 'Supervisor Approved & Marked Verified Cleared',
          statusFrom: b.status,
          statusTo: nextStatus,
          isSimulated: b.isSimulatedEvidence,
        };
        return {
          ...b,
          status: nextStatus,
          verifiedAtUtc: nowUtc,
          verifiedBySupervisorId: supervisorId,
          auditTrail: [...b.auditTrail, auditEntry],
        };
      })
    );
    setFeedbackBanner({
      tone: 'emerald',
      text: `Supervisor ${supervisorId} approved ${binId} → Status set to "Verified cleared".`,
    });
  };

  // Supervisor Reject: Awaiting review -> Pending
  const handleSupervisorReject = (
    binId: string,
    supervisorId: string,
    reason: string
  ) => {
    const nowUtc = new Date().toISOString();
    setBins((prev) =>
      prev.map((b) => {
        if (b.id !== binId) return b;
        const nextStatus = transitionBinStage(b.status, 'SUPERVISOR_REJECT');
        const auditEntry: AuditLogEntry = {
          id: `AUD-${Date.now()}`,
          timestampUtc: nowUtc,
          actor: supervisorId,
          action: `Supervisor Rejected / Re-inspection Required: ${reason}`,
          statusFrom: b.status,
          statusTo: nextStatus,
          isSimulated: b.isSimulatedEvidence,
          notes: reason,
        };
        return {
          ...b,
          status: nextStatus,
          beforePhoto: undefined,
          afterPhoto: undefined,
          submittedAtUtc: undefined,
          rejectionReason: reason,
          auditTrail: [...b.auditTrail, auditEntry],
        };
      })
    );
    setFeedbackBanner({
      tone: 'amber',
      text: `Supervisor returned ${binId} to "Pending" for field re-inspection (${reason}).`,
    });
  };

  const currentRoadDistanceMeters =
    activeRouteResult?.binId === activeBin.id
      ? activeRouteResult.roadDistanceMeters
      : routeMatrixByBinId[activeBin.id]?.distanceMeters ??
        Math.round(straightLineDistanceMeters * 1.28);

  const currentRoadDurationSeconds =
    activeRouteResult?.binId === activeBin.id
      ? activeRouteResult.durationSeconds
      : routeMatrixByBinId[activeBin.id]?.durationSeconds ??
        Math.max(
          4,
          Math.round(
            currentRoadDistanceMeters / (travelMode === 'WALKING' ? 1.35 : 7.5)
          )
        );

  const formatDuration = (sec: number) => {
    if (sec < 60) return `${sec} sec`;
    const mins = Math.floor(sec / 60);
    const rem = sec % 60;
    return rem > 0 ? `${mins} min ${rem}s` : `${mins} min`;
  };

  const awaitingReviewTotalCount = bins.filter(
    (b) => b.status === 'Awaiting review'
  ).length;

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900 overflow-x-hidden">
      {/* Mandatory Google Maps Platform Quota Warning Banner (Case A) */}
      {quotaExceeded && (
        <div className="bg-amber-50 border-b border-amber-200 text-amber-900 px-4 py-2.5 text-xs md:text-sm text-center sticky top-0 z-50 shadow-sm">
          <span>
            Google Maps Platform quota reached. If you are the app owner, visit{' '}
            <a
              href="https://developers.google.com/maps/ai/ai-studio?utm_campaign=gmp_mcp_codeassist_v1_aistudio#quota_exceeded_errors"
              target="_blank"
              rel="noopener noreferrer"
              className="underline font-semibold text-amber-950 hover:text-amber-800"
            >
              maps developer site
            </a>{' '}
            for instructions to update your account.
          </span>
        </div>
      )}

      {/* 1. Subtle Top Prototype Framing Banner */}
      <div className="bg-slate-950 text-slate-200 border-b border-slate-800 px-3 sm:px-4 py-1.5 text-[11px]">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono font-semibold text-emerald-400">
              Interactive Operational Prototype (Simulated Demo Environment)
            </span>
            <span aria-hidden="true" className="text-slate-600">
              ·
            </span>
            <span className="text-slate-300">
              Developed by <strong>SK Developers</strong>
            </span>
          </div>
          <div className="text-slate-400 font-mono text-[10px] sm:text-[11px]">
            Module A: Mobile Field-Visit Evidence Capture · Distinct from Module B: Fixed-CCTV Observation Feed — Separate Integration
          </div>
        </div>
      </div>

      {/* 2. Authoritative GovTech Deep Emerald (#065F46) Header */}
      <header className="bg-[#065F46] text-white border-b border-emerald-900 px-3 sm:px-6 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-3 sm:gap-8">
          {/* Zone 1: Single-line Brand Title */}
          <a
            href="#top"
            className="text-sm sm:text-lg font-bold tracking-tight text-white truncate"
          >
            Suthra Punjab — Field Evidence Module
          </a>

          {/* Zone 2: Concise Navigation Links */}
          <nav
            aria-label="Primary sections"
            className="hidden md:flex items-center gap-6 text-xs font-medium text-emerald-100"
          >
            <a
              href="#workspace-controls"
              className="hover:text-white hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
            >
              Architecture Scope
            </a>
            <a
              href="#geofence-gate"
              className="hover:text-white hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
            >
              15m Geofence Gate
            </a>
            <a
              href="#asset-workflow"
              className="hover:text-white hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
            >
              5-Stage Workflow
            </a>
            <a
              href="#governance-footer"
              className="hover:text-white hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
            >
              Maps Security
            </a>
          </nav>

          {/* Zone 3: 1 Primary Action Button (Maps API Key & Referrer Security Governance) */}
          <div className="flex items-center shrink-0">
            <button
              type="button"
              onClick={() => setIsApiKeyModalOpen(true)}
              className="min-h-[38px] px-2.5 sm:px-3.5 py-1.5 text-[11px] sm:text-xs font-semibold text-emerald-950 bg-emerald-100 hover:bg-white rounded-lg transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
            >
              <KeyRound className="w-3.5 h-3.5 shrink-0" />
              Maps API Security
            </button>
          </div>
        </div>
      </header>

      {/* 3. Workspace Control Bar: Module A/B Distinction, Demo Role Switcher & Demo Mode Toggle */}
      <section
        id="workspace-controls"
        className="bg-white border-b border-slate-200 px-3 sm:px-6 py-3"
      >
        <div className="max-w-7xl mx-auto flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          {/* Module A vs Module B Architectural Notice */}
          <div className="flex items-start sm:items-center gap-2.5 text-xs text-slate-700">
            <Layers className="w-4 h-4 text-[#065F46] shrink-0 mt-0.5 sm:mt-0" />
            <div>
              <span className="font-semibold text-slate-900">
                Module A: Mobile Field-Visit Evidence Capture
              </span>{' '}
              <span aria-hidden="true">·</span> Field apps record geofenced
              visits &amp; watermarked photos while human supervisor review
              confirms clearance{' '}
              <span className="text-slate-500">
                (Module B: Fixed-CCTV Observation Feed — Separate Integration)
              </span>
            </div>
          </div>

          {/* Interactive Role Switcher & Demo Mode Toggle */}
          <div className="flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-center gap-2.5">
            {/* Demo Mode Toggle (Desk Simulator vs Live Device GPS) */}
            <div className="grid grid-cols-2 sm:flex items-center gap-1 p-1 rounded-lg bg-slate-100 border border-slate-200">
              <button
                type="button"
                onClick={() => setIsDemoMode(true)}
                aria-pressed={isDemoMode}
                className={`min-h-[38px] px-2 sm:px-3 py-1.5 rounded-md text-[11px] sm:text-xs font-semibold transition-colors whitespace-nowrap truncate ${
                  isDemoMode
                    ? 'bg-amber-600 text-white shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Demo Mode: ON (Simulator)
              </button>
              <button
                type="button"
                onClick={() => setIsDemoMode(false)}
                aria-pressed={!isDemoMode}
                className={`min-h-[38px] px-2 sm:px-3 py-1.5 rounded-md text-[11px] sm:text-xs font-semibold transition-colors whitespace-nowrap truncate ${
                  !isDemoMode
                    ? 'bg-[#065F46] text-white shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Demo Mode: OFF (Live GPS)
              </button>
            </div>

            {/* Demo Role Switcher */}
            <div
              role="group"
              aria-label="Demo Role Switcher"
              className="grid grid-cols-2 sm:flex items-center gap-1 p-1 rounded-lg bg-slate-100 border border-slate-200"
            >
              <button
                type="button"
                onClick={() => setActiveRoleView('FIELD_CREW')}
                aria-pressed={activeRoleView === 'FIELD_CREW'}
                className={`min-h-[38px] px-2 sm:px-3 py-1.5 rounded-md text-[11px] sm:text-xs font-semibold transition-colors whitespace-nowrap truncate ${
                  activeRoleView === 'FIELD_CREW'
                    ? 'bg-[#065F46] text-white shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                1. Field Crew View
              </button>
              <button
                type="button"
                onClick={() => setActiveRoleView('SUPERVISOR_COMMAND')}
                aria-pressed={activeRoleView === 'SUPERVISOR_COMMAND'}
                className={`min-h-[38px] px-2 sm:px-3 py-1.5 rounded-md text-[11px] sm:text-xs font-semibold transition-colors whitespace-nowrap truncate ${
                  activeRoleView === 'SUPERVISOR_COMMAND'
                    ? 'bg-[#065F46] text-white shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                2. Supervisor Review ({awaitingReviewTotalCount})
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Main Content Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-5 space-y-5">
        {/* Feedback Notification Strip */}
        {feedbackBanner && (
          <div
            className={`rounded-lg px-4 py-2.5 text-xs font-medium flex items-center justify-between gap-3 border ${
              feedbackBanner.tone === 'emerald'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-950'
                : 'bg-amber-50 border-amber-200 text-amber-950'
            }`}
          >
            <span>{feedbackBanner.text}</span>
            <button
              type="button"
              onClick={() => setFeedbackBanner(null)}
              className="text-xs underline font-semibold shrink-0"
            >
              Dismiss
            </button>
          </div>
        )}

        {gpsWatchError && !isDemoMode && (
          <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-2.5 text-xs text-amber-900 flex flex-wrap items-center justify-between gap-2">
            <span>{gpsWatchError}</span>
            <button
              type="button"
              onClick={() => setIsDemoMode(true)}
              className="px-3 py-1 rounded bg-amber-800 text-white font-semibold text-xs whitespace-nowrap"
            >
              Switch to Desk Simulator
            </button>
          </div>
        )}

        {activeRoleView === 'SUPERVISOR_COMMAND' ? (
          <SupervisorReviewView
            bins={bins}
            kpis={separatedKpis}
            onApproveBin={handleSupervisorApprove}
            onRejectBin={handleSupervisorReject}
            onSelectBinForInspection={(binId) => {
              setActiveBinId(binId);
              setActiveRoleView('FIELD_CREW');
            }}
          />
        ) : (
          /* ================= FIELD CREW VIEW ================= */
          <div className="space-y-5">
            {/* Compact KPI & Sandbox Isolation Strip */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="rounded-xl bg-white border border-slate-200 p-3.5">
                <div className="text-xs text-slate-500">
                  Fictional Demo Assets
                </div>
                <div className="text-xl font-bold font-mono tabular-nums text-slate-900 mt-0.5">
                  {separatedKpis.operational.totalAssets} Bins
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">
                  Mall Rd · Liberty · Gulberg
                </div>
              </div>

              <div className="rounded-xl bg-white border border-slate-200 p-3.5">
                <div className="text-xs text-slate-500">Pending Clearance</div>
                <div className="text-xl font-bold font-mono tabular-nums text-slate-900 mt-0.5">
                  {separatedKpis.operational.pendingCount}
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">
                  Requires Before &amp; After
                </div>
              </div>

              <div className="rounded-xl bg-white border border-slate-200 p-3.5">
                <div className="text-xs text-[#065F46] font-medium">
                  Live Verified Cleared
                </div>
                <div className="text-xl font-bold font-mono tabular-nums text-[#065F46] mt-0.5">
                  {separatedKpis.operational.verifiedClearedCount}
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">
                  Excludes simulated records
                </div>
              </div>

              <div className="rounded-xl bg-amber-50/70 border border-amber-200 p-3.5">
                <div className="text-xs text-amber-900 font-medium">
                  Demo Audit Sandbox
                </div>
                <div className="text-xl font-bold font-mono tabular-nums text-amber-950 mt-0.5">
                  {separatedKpis.simulatedSandbox.simulatedSubmissionsCount}{' '}
                  Simulated
                </div>
                <div className="text-[11px] text-amber-800 mt-0.5">
                  Tagged DEMO — SIMULATED EVIDENCE
                </div>
              </div>
            </div>

            {/* Split Workspace: Top/Left Interactive Map + Bottom/Right Active Bin Workflow Card */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
              {/* LEFT / TOP COLUMN: Interactive Google Map + 8-Bin Selector */}
              <div className="lg:col-span-7 space-y-4">
                <FieldGoogleMap
                  apiKey={activeApiKey}
                  bins={bins}
                  activeBin={activeBin}
                  worker={{
                    ...worker,
                    accuracyMeters: effectiveAccuracyMeters,
                  }}
                  travelMode={travelMode}
                  isDemoMode={isDemoMode}
                  isWithin15m={gateEvaluation.isWithinProximity}
                  onSelectBin={(id) => setActiveBinId(id)}
                  onMoveWorker={handleMoveWorker}
                  onRouteComputed={setActiveRouteResult}
                  onRouteMatrixComputed={setRouteMatrixByBinId}
                />

                {/* Horizontal 8 Fictional Demo Assets Selector Strip */}
                <div className="rounded-xl bg-white border border-slate-200 p-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="text-xs font-mono text-slate-500">
                        PRE-LOADED FICTIONAL DEMO DATASET (LAHORE UC-42)
                      </div>
                      <h2 className="text-sm font-bold text-slate-900">
                        Select Target Trash Basket Asset (`DEMO-LHR-UC42-01` through `08`)
                      </h2>
                    </div>

                    {nextNearestPending && (
                      <button
                        type="button"
                        onClick={handleSelectNextNearestPending}
                        className="min-h-[40px] px-3.5 py-1.5 rounded-lg bg-[#065F46] hover:bg-emerald-800 text-white text-xs font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
                      >
                        <Navigation className="w-3.5 h-3.5" />
                        Next Nearest Pending Bin ({nextNearestPending.bin.id.replace('DEMO-LHR-UC42-', '#')})
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {bins.map((bin) => {
                      const isSelected = bin.id === activeBin.id;
                      const dist = calculateHaversineDistanceMeters(
                        worker.position,
                        bin.coordinates
                      );
                      return (
                        <button
                          key={bin.id}
                          type="button"
                          onClick={() => setActiveBinId(bin.id)}
                          className={`p-2.5 rounded-lg border text-left transition-colors ${
                            isSelected
                              ? 'border-[#065F46] bg-emerald-50/70'
                              : 'border-slate-200 bg-slate-50/60 hover:bg-slate-100'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-1 font-mono text-xs font-bold text-slate-900">
                            <span>{bin.id.replace('DEMO-LHR-', '')}</span>
                            <span className="text-[11px] font-normal text-slate-500 tabular-nums">
                              {dist < 1000
                                ? `${dist.toFixed(0)}m`
                                : `${(dist / 1000).toFixed(1)}km`}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-600 truncate mt-0.5">
                            {bin.zoneName}
                          </div>
                          <div className="text-[10px] font-mono font-semibold mt-1 text-slate-700 truncate">
                            {bin.status}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* RIGHT / BOTTOM COLUMN: Active Bin Card, Routes Matrix, 15m Proximity Gate & 5-Stage Capture Workflow */}
              <div
                id="asset-workflow"
                className="lg:col-span-5 rounded-xl bg-white border border-slate-200 overflow-hidden shadow-xs"
              >
                {/* Active Bin Header */}
                <div className="bg-[#065F46] text-white p-4 sm:p-5 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-mono text-emerald-200">
                    <span>{activeBin.id} · FICTIONAL DEMO ASSET</span>
                    <span>CAPACITY: {activeBin.capacityLiters}L</span>
                  </div>
                  <h2 className="text-base sm:text-lg font-bold tracking-tight">
                    {activeBin.label}
                  </h2>
                  <div className="text-xs text-emerald-100 flex flex-wrap items-center gap-1.5">
                    <span>{activeBin.zoneName}</span>
                    <span aria-hidden="true">·</span>
                    <span>{activeBin.mountType}</span>
                  </div>
                </div>

                <div className="p-4 sm:p-5 space-y-5">
                  {/* 5-Stage Workflow Progress Stepper */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-mono font-semibold text-slate-600">
                        5-STAGE SUPERVISOR-VERIFIED WORKFLOW
                      </span>
                      <span
                        data-testid="active-bin-status"
                        className="font-mono font-bold text-[#065F46]"
                      >
                        {activeBin.status}
                      </span>
                    </div>
                    <div className="grid grid-cols-5 gap-1">
                      {WORKFLOW_STAGES.map((st, idx) => {
                        const currentIdx = WORKFLOW_STAGES.indexOf(
                          activeBin.status
                        );
                        const isCompleted = idx < currentIdx;
                        const isCurrent = idx === currentIdx;
                        return (
                          <div
                            key={st}
                            className={`rounded-md px-1.5 py-1.5 text-center border text-[10px] font-mono leading-tight ${
                              isCurrent
                                ? 'bg-[#065F46] text-white border-[#065F46] font-bold'
                                : isCompleted
                                  ? 'bg-emerald-50 text-emerald-900 border-emerald-200 font-semibold'
                                  : 'bg-slate-50 text-slate-400 border-slate-200'
                            }`}
                          >
                            <div>{idx + 1}</div>
                            <div className="truncate">{st}</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Pre-Assigned UC Metadata & Reverse Geocoding Street Context */}
                  <div className="rounded-lg bg-slate-50 border border-slate-200 p-3.5 text-xs space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-slate-900">
                        {activeBin.preAssignedUcLabel}
                      </span>
                      <span className="font-mono text-[11px] text-slate-500">
                        {activeBin.coordinates.lat.toFixed(5)},{' '}
                        {activeBin.coordinates.lng.toFixed(5)}
                      </span>
                    </div>
                    <div className="text-slate-700">
                      <span className="font-medium text-slate-900">
                        Reverse Geocoded Street Context:
                      </span>{' '}
                      {activeBin.reverseGeocodedStreet ||
                        `${activeBin.landmarkContext} (Approximate street context)`}
                    </div>
                    <p className="text-[11px] text-slate-500">
                      Governance Note: Administrative Union Council (UC) tags
                      are pre-assigned asset metadata — reverse geocoding is
                      used solely for approximate street context and cannot
                      verify official UC boundaries.
                    </p>
                  </div>

                  {/* Modern Routes Library (Route & RouteMatrix): WALKING vs DRIVING + Straight-Line vs Road Distance */}
                  <div className="rounded-lg border border-slate-200 p-3.5 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="text-xs font-semibold text-slate-900">
                        Routes Library (`Route` &amp; `RouteMatrix`) Telemetry
                      </div>
                      <div
                        role="group"
                        aria-label="Travel mode selector"
                        className="flex items-center gap-1 p-0.5 rounded-lg bg-slate-100 border border-slate-200"
                      >
                        <button
                          type="button"
                          onClick={() => setTravelMode('WALKING')}
                          aria-pressed={travelMode === 'WALKING'}
                          className={`px-2.5 py-1 rounded text-xs font-semibold inline-flex items-center gap-1 transition-colors whitespace-nowrap ${
                            travelMode === 'WALKING'
                              ? 'bg-[#065F46] text-white'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          <Footprints className="w-3.5 h-3.5" />
                          WALKING
                        </button>
                        <button
                          type="button"
                          onClick={() => setTravelMode('DRIVING')}
                          aria-pressed={travelMode === 'DRIVING'}
                          className={`px-2.5 py-1 rounded text-xs font-semibold inline-flex items-center gap-1 transition-colors whitespace-nowrap ${
                            travelMode === 'DRIVING'
                              ? 'bg-[#065F46] text-white'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          <Truck className="w-3.5 h-3.5" />
                          DRIVING
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200/80">
                        <div className="text-[11px] text-slate-500">
                          Straight-Line (Haversine)
                        </div>
                        <div
                          data-testid="straight-line-distance"
                          className="text-base font-bold font-mono tabular-nums text-slate-900 mt-0.5"
                        >
                          {straightLineDistanceMeters < 1000
                            ? `${straightLineDistanceMeters.toFixed(1)} m`
                            : `${(straightLineDistanceMeters / 1000).toFixed(2)} km`}
                        </div>
                        <div className="text-[10px] text-slate-500 mt-0.5">
                          Used for ≤15m geofence check
                        </div>
                      </div>

                      <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200/80">
                        <div className="text-[11px] text-slate-500">
                          Estimated Road Route ({travelMode})
                        </div>
                        <div
                          data-testid="road-route-distance"
                          className="text-base font-bold font-mono tabular-nums text-slate-900 mt-0.5"
                        >
                          {currentRoadDistanceMeters < 1000
                            ? `${currentRoadDistanceMeters} m`
                            : `${(currentRoadDistanceMeters / 1000).toFixed(2)} km`}{' '}
                          · {formatDuration(currentRoadDurationSeconds)}
                        </div>
                        <div className="text-[10px] text-slate-500 mt-0.5">
                          Computed via Maps Routes API
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Section 4.A: 15-Meter Proximity & Accuracy Check */}
                  <div
                    id="geofence-gate"
                    className={`rounded-lg border p-3.5 space-y-3 ${
                      gateEvaluation.unlocked
                        ? 'bg-emerald-50/60 border-emerald-200'
                        : 'bg-amber-50/60 border-amber-200'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 text-xs font-bold text-slate-900">
                        {gateEvaluation.unlocked ? (
                          <Unlock className="w-4 h-4 text-[#065F46] shrink-0" />
                        ) : (
                          <Lock className="w-4 h-4 text-amber-700 shrink-0" />
                        )}
                        <span>
                          15-Meter Proximity &amp; GPS Accuracy Gate
                        </span>
                      </div>
                      <span
                        data-testid="geofence-gate-state"
                        className={`font-mono text-xs font-bold ${
                          gateEvaluation.unlocked
                            ? 'text-[#065F46]'
                            : 'text-amber-800'
                        }`}
                      >
                        {gateEvaluation.unlocked ? 'UNLOCKED' : 'LOCKED'}
                      </span>
                    </div>

                    {/* Mandatory Amber Warning Badge when accuracy > 25m or fix is stale (> 15s) */}
                    {gateEvaluation.showUncertainWarning && (
                      <div
                        role="alert"
                        data-testid="gps-uncertain-warning-badge"
                        className="rounded-md bg-amber-100 border border-amber-300 px-3 py-2 text-xs font-semibold text-amber-950 flex items-center gap-2"
                      >
                        <AlertTriangle className="w-4 h-4 text-amber-800 shrink-0" />
                        <span>{gateEvaluation.warningMessage}</span>
                      </div>
                    )}

                    {/* 3 Condition Checklist */}
                    <div className="grid grid-cols-3 gap-2 text-[11px] font-mono">
                      <div
                        className={`p-2 rounded border ${
                          gateEvaluation.isWithinProximity
                            ? 'bg-white border-emerald-200 text-emerald-900'
                            : 'bg-white border-amber-300 text-amber-900'
                        }`}
                      >
                        <div className="text-[10px] text-slate-500">
                          1. Pin Distance
                        </div>
                        <div className="font-bold tabular-nums">
                          {straightLineDistanceMeters.toFixed(1)}m / ≤
                          {GEOFENCE_MAX_DISTANCE_METERS}m
                        </div>
                      </div>

                      <div
                        className={`p-2 rounded border ${
                          gateEvaluation.isAccuracyAcceptable
                            ? 'bg-white border-emerald-200 text-emerald-900'
                            : 'bg-white border-amber-300 text-amber-900'
                        }`}
                      >
                        <div className="text-[10px] text-slate-500">
                          2. GPS Accuracy
                        </div>
                        <div className="font-bold tabular-nums">
                          ±{Math.round(effectiveAccuracyMeters)}m / ≤
                          {GPS_MAX_ACCURACY_METERS}m
                        </div>
                      </div>

                      <div
                        className={`p-2 rounded border ${
                          gateEvaluation.isLocationFresh
                            ? 'bg-white border-emerald-200 text-emerald-900'
                            : 'bg-white border-amber-300 text-amber-900'
                        }`}
                      >
                        <div className="text-[10px] text-slate-500">
                          3. Fix Freshness
                        </div>
                        <div className="font-bold tabular-nums">
                          {Math.round(gateEvaluation.ageSeconds)}s / ≤
                          {GPS_MAX_AGE_SECONDS}s
                        </div>
                      </div>
                    </div>

                    {/* Desk Simulator Telemetry Test Controls */}
                    {isDemoMode && (
                      <div className="pt-1 flex flex-wrap items-center justify-between gap-2 border-t border-slate-200/80">
                        <button
                          type="button"
                          onClick={handleSimulateArrivalAtActiveBin}
                          className="min-h-[38px] px-3 py-1.5 rounded-md bg-[#065F46] hover:bg-emerald-800 text-white text-xs font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
                        >
                          <LocateFixed className="w-3.5 h-3.5" />
                          Simulate Worker Arrival at Target Bin
                        </button>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              setSimulatePoorGpsFix((prev) => !prev)
                            }
                            aria-pressed={simulatePoorGpsFix}
                            className={`px-2.5 py-1.5 rounded text-[11px] font-mono border transition-colors whitespace-nowrap ${
                              simulatePoorGpsFix
                                ? 'bg-amber-800 text-white border-amber-900 font-semibold'
                                : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                            }`}
                          >
                            Test Poor GPS (±34m)
                          </button>
                          <button
                            type="button"
                            onClick={() => setSimulateStaleFix((prev) => !prev)}
                            aria-pressed={simulateStaleFix}
                            className={`px-2.5 py-1.5 rounded text-[11px] font-mono border transition-colors whitespace-nowrap ${
                              simulateStaleFix
                                ? 'bg-amber-800 text-white border-amber-900 font-semibold'
                                : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                            }`}
                          >
                            Test Stale Fix (21s)
                          </button>
                        </div>
                      </div>
                    )}

                    <p className="text-[11px] text-slate-600 leading-relaxed">
                      <strong>Integrity Note:</strong> Proximity checks confirm
                      device presence near the pin, while photographic evidence
                      and supervisor review verify actual cleaning.
                    </p>
                  </div>

                  {/* Section 4.B: Two-Step Evidence Capture Workflow Buttons */}
                  <div className="space-y-3 pt-1">
                    {activeBin.rejectionReason && (
                      <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-xs text-red-900">
                        <strong>Supervisor Re-Inspection Note:</strong>{' '}
                        {activeBin.rejectionReason}
                      </div>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {/* Step 1: Capture Before Photo */}
                      <button
                        type="button"
                        disabled={
                          !gateEvaluation.unlocked ||
                          activeBin.status !== 'Pending'
                        }
                        onClick={() =>
                          setCameraModalState({ isOpen: true, stage: 'BEFORE' })
                        }
                        className={`min-h-[46px] px-4 py-2.5 rounded-lg text-xs font-semibold inline-flex items-center justify-center gap-2 transition-colors whitespace-nowrap ${
                          gateEvaluation.unlocked &&
                          activeBin.status === 'Pending'
                            ? 'bg-[#065F46] hover:bg-emerald-800 text-white shadow-xs'
                            : 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed'
                        }`}
                      >
                        <Camera className="w-4 h-4 shrink-0" />
                        {activeBin.beforePhoto
                          ? 'Step 1: Before Captured ✓'
                          : 'Step 1: Capture Before Photo'}
                      </button>

                      {/* Step 2: Capture After Photo */}
                      <button
                        type="button"
                        disabled={
                          !gateEvaluation.unlocked ||
                          activeBin.status !== 'Before captured'
                        }
                        onClick={() =>
                          setCameraModalState({ isOpen: true, stage: 'AFTER' })
                        }
                        className={`min-h-[46px] px-4 py-2.5 rounded-lg text-xs font-semibold inline-flex items-center justify-center gap-2 transition-colors whitespace-nowrap ${
                          gateEvaluation.unlocked &&
                          activeBin.status === 'Before captured'
                            ? 'bg-[#065F46] hover:bg-emerald-800 text-white shadow-xs'
                            : 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed'
                        }`}
                      >
                        <Camera className="w-4 h-4 shrink-0" />
                        {activeBin.afterPhoto
                          ? 'Step 2: After Captured ✓'
                          : 'Step 2: Capture After Photo'}
                      </button>
                    </div>

                    {/* Step 3: Submit to Supervisor Approval Queue */}
                    {activeBin.status === 'After captured' && (
                      <button
                        type="button"
                        onClick={handleSubmitToSupervisorReview}
                        className="w-full min-h-[48px] px-4 py-2.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs sm:text-sm font-bold inline-flex items-center justify-center gap-2 shadow-sm transition-colors"
                      >
                        <Send className="w-4 h-4" />
                        Submit Evidence Package to Supervisor Review Queue
                      </button>
                    )}

                    {activeBin.status === 'Awaiting review' && (
                      <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-xs text-amber-950 flex items-center justify-between gap-2">
                        <span>
                          Evidence queued in{' '}
                          <code className="font-mono font-bold">
                            Awaiting review
                          </code>
                          . Only a Supervisor can mark this asset{' '}
                          <code className="font-mono font-bold">
                            Verified cleared
                          </code>
                          .
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            setActiveRoleView('SUPERVISOR_COMMAND')
                          }
                          className="px-3 py-1.5 rounded bg-[#065F46] text-white font-semibold text-xs whitespace-nowrap shrink-0"
                        >
                          Open Supervisor Queue
                        </button>
                      </div>
                    )}

                    {/* Thumbnails of Captured Watermarked Evidence on Active Card */}
                    {(activeBin.beforePhoto || activeBin.afterPhoto) && (
                      <div className="grid grid-cols-2 gap-2.5 pt-2 border-t border-slate-200">
                        {activeBin.beforePhoto && (
                          <div className="space-y-1">
                            <div className="text-[10px] font-mono font-semibold text-slate-600">
                              BEFORE (WATERMARKED)
                            </div>
                            <img
                              src={activeBin.beforePhoto.dataUrl}
                              alt={`Captured Before evidence for ${activeBin.id}`}
                              referrerPolicy="no-referrer"
                              className="w-full h-28 object-cover rounded border border-slate-300 bg-slate-900"
                            />
                          </div>
                        )}
                        {activeBin.afterPhoto && (
                          <div className="space-y-1">
                            <div className="text-[10px] font-mono font-semibold text-[#065F46]">
                              AFTER (WATERMARKED)
                            </div>
                            <img
                              src={activeBin.afterPhoto.dataUrl}
                              alt={`Captured After evidence for ${activeBin.id}`}
                              referrerPolicy="no-referrer"
                              className="w-full h-28 object-cover rounded border border-slate-300 bg-slate-900"
                            />
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* 4. Governance & Google Maps Platform Compliance Footer */}
      <footer
        id="governance-footer"
        className="bg-white border-t border-slate-200 px-4 sm:px-6 py-4 mt-8 text-xs text-slate-600"
      >
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div>
            <strong>Suthra Punjab – Interactive Operational Prototype</strong>{' '}
            by SK Developers · Production RBAC enforced via Laravel +
            PostgreSQL/PostGIS, server UTC timestamps, SHA-256 upload digests
            &amp; S3 object storage.
          </div>
          <div className="flex flex-wrap items-center gap-4 text-[11px]">
            <a
              href="https://docs.cloud.google.com/api-keys/docs/add-restrictions-api-keys?utm_campaign=gmp_mcp_codeassist_v1_aistudio"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-slate-900"
            >
              API Key Referrer &amp; Scope Restrictions
            </a>
            <a
              href="https://cloud.google.com/maps-platform/terms?utm_campaign=gmp_mcp_codeassist_v1_aistudio"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-slate-900"
            >
              Google Maps Platform Terms of Service
            </a>
          </div>
        </div>
      </footer>

      {/* Live Camera & HTML5 Canvas Watermark Modal */}
      <CameraEvidenceModal
        isOpen={cameraModalState.isOpen}
        stage={cameraModalState.stage}
        bin={activeBin}
        worker={{
          ...worker,
          accuracyMeters: effectiveAccuracyMeters,
        }}
        distanceToBinMeters={straightLineDistanceMeters}
        isDemoMode={isDemoMode}
        onClose={() => setCameraModalState({ isOpen: false, stage: 'BEFORE' })}
        onConfirmCapture={handleConfirmEvidencePhoto}
      />

      {/* Browser Maps API Key & Security Governance Modal */}
      <ApiKeyGovernanceModal
        isOpen={isApiKeyModalOpen}
        currentApiKey={activeApiKey}
        isEnvProvided={Boolean(ENV_MAPS_KEY)}
        onSaveKey={(key) => setCustomApiKey(key)}
        onClose={() => setIsApiKeyModalOpen(false)}
      />
    </div>
  );
}
