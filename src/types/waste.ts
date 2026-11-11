export type BinWorkflowStatus =
  | 'Pending'
  | 'Before captured'
  | 'After captured'
  | 'Awaiting review'
  | 'Verified cleared';

export type TravelModeOption = 'WALKING' | 'DRIVING';

export type ActiveRoleView = 'FIELD_CREW' | 'SUPERVISOR_COMMAND';

export interface LatLngPoint {
  lat: number;
  lng: number;
}

export interface EvidencePhotoRecord {
  stage: 'BEFORE' | 'AFTER';
  dataUrl: string;
  capturedAtUtc: string;
  lat: number;
  lng: number;
  accuracyMeters: number;
  distanceToBinMeters: number;
  workerId: string;
  isSimulated: boolean;
  sha256Hash: string;
  captureMethod: 'LIVE_CAMERA' | 'SYNTHETIC_VIEWFINDER' | 'FILE_UPLOAD' | 'SEEDED_RECORD';
}

export interface AuditLogEntry {
  id: string;
  timestampUtc: string;
  actor: string;
  action: string;
  statusFrom?: BinWorkflowStatus;
  statusTo: BinWorkflowStatus;
  isSimulated: boolean;
  sha256Digest?: string;
  notes?: string;
}

export interface WasteBinAsset {
  id: string;
  label: string;
  zoneName: string;
  landmarkContext: string;
  preAssignedUcCode: string;
  preAssignedUcLabel: string;
  isFictionalDemoAsset: true;
  coordinates: LatLngPoint;
  capacityLiters: number;
  mountType: 'Pole-Mounted Steel Basket' | 'Pedestrian Curbside Bin' | 'Twin-Compartment Public Bin';
  status: BinWorkflowStatus;
  isSimulatedEvidence: boolean;
  beforePhoto?: EvidencePhotoRecord;
  afterPhoto?: EvidencePhotoRecord;
  submittedAtUtc?: string;
  verifiedAtUtc?: string;
  verifiedBySupervisorId?: string;
  rejectionReason?: string;
  reverseGeocodedStreet?: string;
  auditTrail: AuditLogEntry[];
}

export interface WorkerTelemetryState {
  position: LatLngPoint;
  accuracyMeters: number;
  timestampMs: number;
  source: 'DESK_SIMULATOR' | 'LIVE_DEVICE_GPS';
  workerId: string;
  workerName: string;
}

export interface RouteComputationResult {
  binId: string;
  travelMode: TravelModeOption;
  roadDistanceMeters: number;
  durationSeconds: number;
  isFallbackEstimate: boolean;
  computedAtMs: number;
}
