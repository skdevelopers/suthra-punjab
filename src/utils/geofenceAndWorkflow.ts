import {
  BinWorkflowStatus,
  LatLngPoint,
  WasteBinAsset,
} from '../types/waste';

export const GEOFENCE_MAX_DISTANCE_METERS = 15;
export const GPS_MAX_ACCURACY_METERS = 25;
export const GPS_MAX_AGE_SECONDS = 15;

export interface ProximityGateInput {
  distanceMeters: number;
  accuracyMeters: number;
  locationTimestampMs: number;
  nowMs: number;
}

export interface ProximityGateEvaluation {
  unlocked: boolean;
  isWithinProximity: boolean;
  isAccuracyAcceptable: boolean;
  isLocationFresh: boolean;
  ageSeconds: number;
  showUncertainWarning: boolean;
  warningMessage: string | null;
  blockingReasons: string[];
}

export type WorkflowAction =
  | 'CAPTURE_BEFORE'
  | 'CAPTURE_AFTER'
  | 'SUBMIT_FOR_REVIEW'
  | 'SUPERVISOR_APPROVE'
  | 'SUPERVISOR_REJECT';

/**
 * Computes straight-line distance in meters between two WGS84 coordinates using the Haversine formula.
 */
export function calculateHaversineDistanceMeters(
  a: LatLngPoint,
  b: LatLngPoint
): number {
  const R = 6371000; // Earth mean radius in meters
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);
  const h =
    sinDLat * sinDLat +
    Math.cos(lat1) * Math.cos(lat2) * sinDLng * sinDLng;
  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
  return R * c;
}

/**
 * Evaluates the 3 strict conditions before unlocking field evidence photo capture:
 * 1. Distance to bin <= 15 meters
 * 2. GPS reported accuracy (coords.accuracy) <= 25 meters
 * 3. Location freshness <= 15 seconds old
 */
export function evaluateProximityAndAccuracyGate(
  input: ProximityGateInput
): ProximityGateEvaluation {
  const ageSeconds = Math.max(
    0,
    (input.nowMs - input.locationTimestampMs) / 1000
  );
  const isWithinProximity =
    input.distanceMeters <= GEOFENCE_MAX_DISTANCE_METERS;
  const isAccuracyAcceptable =
    input.accuracyMeters > 0 && input.accuracyMeters <= GPS_MAX_ACCURACY_METERS;
  const isLocationFresh = ageSeconds <= GPS_MAX_AGE_SECONDS;

  const showUncertainWarning = !isAccuracyAcceptable || !isLocationFresh;
  const warningMessage = showUncertainWarning
    ? 'Location uncertain — waiting for stronger GPS fix'
    : null;

  const blockingReasons: string[] = [];
  if (!isWithinProximity) {
    blockingReasons.push(
      `Worker is ${input.distanceMeters.toFixed(1)}m from pin (must be ≤ ${GEOFENCE_MAX_DISTANCE_METERS}m)`
    );
  }
  if (!isAccuracyAcceptable) {
    blockingReasons.push(
      `GPS accuracy is ±${Math.round(input.accuracyMeters)}m (must be ≤ ±${GPS_MAX_ACCURACY_METERS}m)`
    );
  }
  if (!isLocationFresh) {
    blockingReasons.push(
      `GPS fix is ${Math.round(ageSeconds)}s old (must be ≤ ${GPS_MAX_AGE_SECONDS}s fresh)`
    );
  }

  return {
    unlocked: isWithinProximity && isAccuracyAcceptable && isLocationFresh,
    isWithinProximity,
    isAccuracyAcceptable,
    isLocationFresh,
    ageSeconds,
    showUncertainWarning,
    warningMessage,
    blockingReasons,
  };
}

/**
 * Strict 5-stage state machine for every waste bin asset:
 * Pending -> Before captured -> After captured -> Awaiting review -> Verified cleared
 * (Plus supervisor REJECT returning Awaiting review -> Pending)
 */
export function transitionBinStage(
  currentStatus: BinWorkflowStatus,
  action: WorkflowAction
): BinWorkflowStatus {
  switch (action) {
    case 'CAPTURE_BEFORE':
      if (currentStatus !== 'Pending') {
        throw new Error(
          `Invalid transition: CAPTURE_BEFORE is only allowed from 'Pending' (current: '${currentStatus}')`
        );
      }
      return 'Before captured';

    case 'CAPTURE_AFTER':
      if (currentStatus !== 'Before captured') {
        throw new Error(
          `Invalid transition: CAPTURE_AFTER is only allowed from 'Before captured' (current: '${currentStatus}')`
        );
      }
      return 'After captured';

    case 'SUBMIT_FOR_REVIEW':
      if (currentStatus !== 'After captured') {
        throw new Error(
          `Invalid transition: SUBMIT_FOR_REVIEW is only allowed from 'After captured' (current: '${currentStatus}')`
        );
      }
      return 'Awaiting review';

    case 'SUPERVISOR_APPROVE':
      if (currentStatus !== 'Awaiting review') {
        throw new Error(
          `Invalid transition: SUPERVISOR_APPROVE is only allowed from 'Awaiting review' (current: '${currentStatus}')`
        );
      }
      return 'Verified cleared';

    case 'SUPERVISOR_REJECT':
      if (currentStatus !== 'Awaiting review') {
        throw new Error(
          `Invalid transition: SUPERVISOR_REJECT is only allowed from 'Awaiting review' (current: '${currentStatus}')`
        );
      }
      return 'Pending';

    default:
      throw new Error(`Unsupported workflow action: ${String(action)}`);
  }
}

export interface KpiGroupCounts {
  totalAssets: number;
  pendingCount: number;
  inProgressCaptureCount: number;
  awaitingReviewCount: number;
  verifiedClearedCount: number;
}

export interface SeparatedKpiSummary {
  operational: KpiGroupCounts;
  simulatedSandbox: {
    simulatedSubmissionsCount: number;
    simulatedAwaitingReviewCount: number;
    simulatedVerifiedCount: number;
    simulatedInProgressCount: number;
  };
}

/**
 * Strictly separates Live Operational KPIs from Simulated Demo Evidence records
 * so that captures made in Desk Simulator mode never inflate live operational metrics.
 */
export function computeOperationalVsSimulatedKpis(
  bins: WasteBinAsset[]
): SeparatedKpiSummary {
  const operational: KpiGroupCounts = {
    totalAssets: bins.length,
    pendingCount: 0,
    inProgressCaptureCount: 0,
    awaitingReviewCount: 0,
    verifiedClearedCount: 0,
  };

  const simulatedSandbox = {
    simulatedSubmissionsCount: 0,
    simulatedAwaitingReviewCount: 0,
    simulatedVerifiedCount: 0,
    simulatedInProgressCount: 0,
  };

  for (const bin of bins) {
    if (bin.status === 'Pending') {
      operational.pendingCount += 1;
      continue;
    }

    if (bin.isSimulatedEvidence) {
      simulatedSandbox.simulatedSubmissionsCount += 1;
      if (
        bin.status === 'Before captured' ||
        bin.status === 'After captured'
      ) {
        simulatedSandbox.simulatedInProgressCount += 1;
      } else if (bin.status === 'Awaiting review') {
        simulatedSandbox.simulatedAwaitingReviewCount += 1;
      } else if (bin.status === 'Verified cleared') {
        simulatedSandbox.simulatedVerifiedCount += 1;
      }
    } else {
      if (
        bin.status === 'Before captured' ||
        bin.status === 'After captured'
      ) {
        operational.inProgressCaptureCount += 1;
      } else if (bin.status === 'Awaiting review') {
        operational.awaitingReviewCount += 1;
      } else if (bin.status === 'Verified cleared') {
        operational.verifiedClearedCount += 1;
      }
    }
  }

  return { operational, simulatedSandbox };
}

export interface NearestPendingResult {
  bin: WasteBinAsset;
  straightLineMeters: number;
  effectiveDistanceMeters: number;
}

/**
 * Finds the next nearest bin that requires field crew servicing ('Pending' or 'Before captured' or 'After captured').
 * Uses RouteMatrix road distances when available, falling back to Haversine straight-line distance.
 */
export function findNextNearestPendingBin(
  workerPos: LatLngPoint,
  bins: WasteBinAsset[],
  excludeBinId?: string,
  roadDistanceByBinId?: Record<string, number>
): NearestPendingResult | null {
  const candidates = bins.filter(
    (b) =>
      b.id !== excludeBinId &&
      (b.status === 'Pending' ||
        b.status === 'Before captured' ||
        b.status === 'After captured')
  );

  if (candidates.length === 0) {
    // If no other bin is pending, check if the excluded bin itself is still pending
    const fallback = bins.filter(
      (b) =>
        b.status === 'Pending' ||
        b.status === 'Before captured' ||
        b.status === 'After captured'
    );
    if (fallback.length === 0) return null;
    const onlyBin = fallback[0];
    const straight = calculateHaversineDistanceMeters(
      workerPos,
      onlyBin.coordinates
    );
    return {
      bin: onlyBin,
      straightLineMeters: straight,
      effectiveDistanceMeters: roadDistanceByBinId?.[onlyBin.id] ?? straight,
    };
  }

  let best: NearestPendingResult | null = null;
  for (const bin of candidates) {
    const straightLineMeters = calculateHaversineDistanceMeters(
      workerPos,
      bin.coordinates
    );
    const roadDist = roadDistanceByBinId?.[bin.id];
    const effectiveDistanceMeters =
      typeof roadDist === 'number' && roadDist > 0
        ? roadDist
        : straightLineMeters;

    if (!best || effectiveDistanceMeters < best.effectiveDistanceMeters) {
      best = {
        bin,
        straightLineMeters,
        effectiveDistanceMeters,
      };
    }
  }

  return best;
}

export interface WatermarkInput {
  binId: string;
  stage: 'BEFORE' | 'AFTER';
  lat: number;
  lng: number;
  accuracyMeters: number;
  utcTimestamp: string;
  workerId: string;
  isSimulated: boolean;
}

/**
 * Builds the standardized Evidence Watermark strings required on both Before and After photos:
 * EVIDENCE RECORD | BIN ID | STAGE (BEFORE/AFTER) | LAT, LNG (±ACCURACYm) | UTC TIMESTAMP | WORKER ID
 * (plus DEMO — SIMULATED EVIDENCE if simulated)
 */
export function buildEvidenceWatermarkLines(input: WatermarkInput): string[] {
  const primaryLine = `EVIDENCE RECORD | ${input.binId} | STAGE: ${input.stage} | ${input.lat.toFixed(5)}, ${input.lng.toFixed(5)} (±${Math.round(input.accuracyMeters)}m) | ${input.utcTimestamp} | ${input.workerId}`;
  const lines = [primaryLine];
  if (input.isSimulated) {
    lines.push('DEMO — SIMULATED EVIDENCE (SANDBOX RECORD — NOT LIVE KPI)');
  }
  return lines;
}

/**
 * Generates a deterministic 64-character hex digest simulating a server-side SHA-256 upload hash.
 */
export function computeSimulatedSha256Hex(payload: string): string {
  const seeds = [
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ];
  for (let i = 0; i < payload.length; i++) {
    const code = payload.charCodeAt(i);
    const idx = i & 7;
    seeds[idx] = Math.imul(seeds[idx] ^ code, 0x01000193) >>> 0;
    seeds[(idx + 1) & 7] =
      (seeds[(idx + 1) & 7] + ((seeds[idx] >>> 13) ^ code)) >>> 0;
  }
  return seeds.map((n) => n.toString(16).padStart(8, '0')).join('');
}
