import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateHaversineDistanceMeters,
  evaluateProximityAndAccuracyGate,
  transitionBinStage,
  computeOperationalVsSimulatedKpis,
  findNextNearestPendingBin,
  buildEvidenceWatermarkLines,
  computeSimulatedSha256Hex,
} from './geofenceAndWorkflow';
import { WasteBinAsset } from '../types/waste';

test('calculateHaversineDistanceMeters returns 0 for identical coordinates and accurate meters for Lahore points', () => {
  const pointA = { lat: 31.558, lng: 74.3292 };
  assert.equal(calculateHaversineDistanceMeters(pointA, pointA), 0);

  // Move ~10 meters north (~0.00009 degrees latitude)
  const pointB = { lat: 31.55809, lng: 74.3292 };
  const dist = calculateHaversineDistanceMeters(pointA, pointB);
  assert.equal(dist > 9.5 && dist < 10.5, true);
});

test('evaluateProximityAndAccuracyGate enforces 15m distance, 25m accuracy, and 15s freshness', () => {
  const now = 1_700_000_000_000;

  // 1. All conditions met -> unlocked
  const valid = evaluateProximityAndAccuracyGate({
    distanceMeters: 12.4,
    accuracyMeters: 8,
    locationTimestampMs: now - 4000,
    nowMs: now,
  });
  assert.equal(valid.unlocked, true);
  assert.equal(valid.showUncertainWarning, false);
  assert.equal(valid.warningMessage, null);

  // 2. Distance > 15m -> locked, no GPS uncertainty warning
  const tooFar = evaluateProximityAndAccuracyGate({
    distanceMeters: 19.2,
    accuracyMeters: 10,
    locationTimestampMs: now - 2000,
    nowMs: now,
  });
  assert.equal(tooFar.unlocked, false);
  assert.equal(tooFar.isWithinProximity, false);
  assert.equal(tooFar.showUncertainWarning, false);

  // 3. Poor GPS accuracy (> 25m) -> locked + exact warning badge text
  const poorAccuracy = evaluateProximityAndAccuracyGate({
    distanceMeters: 6.0,
    accuracyMeters: 34,
    locationTimestampMs: now - 2000,
    nowMs: now,
  });
  assert.equal(poorAccuracy.unlocked, false);
  assert.equal(poorAccuracy.isAccuracyAcceptable, false);
  assert.equal(poorAccuracy.showUncertainWarning, true);
  assert.equal(
    poorAccuracy.warningMessage,
    'Location uncertain — waiting for stronger GPS fix'
  );

  // 4. Stale location (> 15s old) -> locked + exact warning badge text
  const staleFix = evaluateProximityAndAccuracyGate({
    distanceMeters: 5.0,
    accuracyMeters: 9,
    locationTimestampMs: now - 18000,
    nowMs: now,
  });
  assert.equal(staleFix.unlocked, false);
  assert.equal(staleFix.isLocationFresh, false);
  assert.equal(staleFix.showUncertainWarning, true);
  assert.equal(
    staleFix.warningMessage,
    'Location uncertain — waiting for stronger GPS fix'
  );
});

test('transitionBinStage enforces strict 5-stage workflow and rejects invalid jumps', () => {
  let stage = transitionBinStage('Pending', 'CAPTURE_BEFORE');
  assert.equal(stage, 'Before captured');

  stage = transitionBinStage(stage, 'CAPTURE_AFTER');
  assert.equal(stage, 'After captured');

  stage = transitionBinStage(stage, 'SUBMIT_FOR_REVIEW');
  assert.equal(stage, 'Awaiting review');

  stage = transitionBinStage(stage, 'SUPERVISOR_APPROVE');
  assert.equal(stage, 'Verified cleared');

  // Rejection path returns Awaiting review -> Pending
  const rejected = transitionBinStage('Awaiting review', 'SUPERVISOR_REJECT');
  assert.equal(rejected, 'Pending');

  // Illegal jump: Pending -> After captured or Verified cleared throws
  assert.throws(() => transitionBinStage('Pending', 'CAPTURE_AFTER'));
  assert.throws(() => transitionBinStage('Pending', 'SUPERVISOR_APPROVE'));
  assert.throws(() => transitionBinStage('Before captured', 'SUPERVISOR_APPROVE'));
});

test('computeOperationalVsSimulatedKpis isolates simulated demo records from live operational KPIs', () => {
  const mockBins: WasteBinAsset[] = [
    {
      id: 'DEMO-LHR-UC42-01',
      label: 'Bin 1',
      zoneName: 'Mall Road',
      landmarkContext: 'GPO Chowk',
      preAssignedUcCode: 'UC-42',
      preAssignedUcLabel: 'UC-42 (Fictional Demo Assignment)',
      isFictionalDemoAsset: true,
      coordinates: { lat: 31.56, lng: 74.31 },
      capacityLiters: 120,
      mountType: 'Pole-Mounted Steel Basket',
      status: 'Pending',
      isSimulatedEvidence: false,
      auditTrail: [],
    },
    {
      id: 'DEMO-LHR-UC42-02',
      label: 'Bin 2',
      zoneName: 'Liberty Market',
      landmarkContext: 'Main Roundabout',
      preAssignedUcCode: 'UC-42',
      preAssignedUcLabel: 'UC-42 (Fictional Demo Assignment)',
      isFictionalDemoAsset: true,
      coordinates: { lat: 31.51, lng: 74.34 },
      capacityLiters: 120,
      mountType: 'Pedestrian Curbside Bin',
      status: 'Verified cleared',
      isSimulatedEvidence: false,
      auditTrail: [],
    },
    {
      id: 'DEMO-LHR-UC42-03',
      label: 'Bin 3',
      zoneName: 'Gulberg',
      landmarkContext: 'MM Alam Road',
      preAssignedUcCode: 'UC-42',
      preAssignedUcLabel: 'UC-42 (Fictional Demo Assignment)',
      isFictionalDemoAsset: true,
      coordinates: { lat: 31.52, lng: 74.35 },
      capacityLiters: 120,
      mountType: 'Twin-Compartment Public Bin',
      status: 'Verified cleared',
      isSimulatedEvidence: true,
      auditTrail: [],
    },
  ];

  const kpis = computeOperationalVsSimulatedKpis(mockBins);
  assert.equal(kpis.operational.totalAssets, 3);
  assert.equal(kpis.operational.pendingCount, 1);
  assert.equal(kpis.operational.verifiedClearedCount, 1);
  assert.equal(kpis.simulatedSandbox.simulatedSubmissionsCount, 1);
  assert.equal(kpis.simulatedSandbox.simulatedVerifiedCount, 1);
});

test('buildEvidenceWatermarkLines and computeSimulatedSha256Hex format standardized evidence strings', () => {
  const lines = buildEvidenceWatermarkLines({
    binId: 'DEMO-LHR-UC42-01',
    stage: 'BEFORE',
    lat: 31.558,
    lng: 74.3292,
    accuracyMeters: 6.4,
    utcTimestamp: '2026-11-11T05:40:00Z',
    workerId: 'WRK-LHR-409',
    isSimulated: true,
  });

  assert.equal(lines.length, 2);
  assert.equal(lines[0].includes('EVIDENCE RECORD | DEMO-LHR-UC42-01 | STAGE: BEFORE'), true);
  assert.equal(lines[1].includes('DEMO — SIMULATED EVIDENCE'), true);

  const hash = computeSimulatedSha256Hex(lines.join('|'));
  assert.equal(hash.length, 64);
});

test('findNextNearestPendingBin selects closest pending bin using RouteMatrix or Haversine', () => {
  const worker = { lat: 31.558, lng: 74.3292 };
  const bins: WasteBinAsset[] = [
    {
      id: 'DEMO-LHR-UC42-01',
      label: 'Far Bin',
      zoneName: 'Gulberg',
      landmarkContext: 'Liberty',
      preAssignedUcCode: 'UC-42',
      preAssignedUcLabel: 'UC-42',
      isFictionalDemoAsset: true,
      coordinates: { lat: 31.51, lng: 74.34 },
      capacityLiters: 100,
      mountType: 'Pole-Mounted Steel Basket',
      status: 'Pending',
      isSimulatedEvidence: false,
      auditTrail: [],
    },
    {
      id: 'DEMO-LHR-UC42-02',
      label: 'Near Bin',
      zoneName: 'Mall Road',
      landmarkContext: 'Charing Cross',
      preAssignedUcCode: 'UC-42',
      preAssignedUcLabel: 'UC-42',
      isFictionalDemoAsset: true,
      coordinates: { lat: 31.5585, lng: 74.3295 },
      capacityLiters: 100,
      mountType: 'Pole-Mounted Steel Basket',
      status: 'Pending',
      isSimulatedEvidence: false,
      auditTrail: [],
    },
  ];

  const nearest = findNextNearestPendingBin(worker, bins);
  assert.equal(nearest?.bin.id, 'DEMO-LHR-UC42-02');
});
