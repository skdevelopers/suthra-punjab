import React, { useEffect, useRef, useState } from 'react';
import {
  Camera,
  CheckCircle2,
  RefreshCw,
  ShieldAlert,
  Upload,
  X,
} from 'lucide-react';
import {
  EvidencePhotoRecord,
  WasteBinAsset,
  WorkerTelemetryState,
} from '../types/waste';
import { renderEvidenceToCanvas } from '../utils/canvasWatermark';

interface CameraEvidenceModalProps {
  isOpen: boolean;
  stage: 'BEFORE' | 'AFTER';
  bin: WasteBinAsset;
  worker: WorkerTelemetryState;
  distanceToBinMeters: number;
  isDemoMode: boolean;
  onClose: () => void;
  onConfirmCapture: (record: EvidencePhotoRecord) => void;
}

export const CameraEvidenceModal: React.FC<CameraEvidenceModalProps> = ({
  isOpen,
  stage,
  bin,
  worker,
  distanceToBinMeters,
  isDemoMode,
  onClose,
  onConfirmCapture,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [cameraState, setCameraState] = useState<
    'REQUESTING' | 'LIVE_STREAM' | 'SYNTHETIC_FALLBACK' | 'FILE_UPLOADED'
  >('REQUESTING');
  const [cameraNotice, setCameraNotice] = useState<string | null>(null);
  const [watermarkedDataUrl, setWatermarkedDataUrl] = useState<string>('');
  const [sha256Hash, setSha256Hash] = useState<string>('');
  const [capturedTimestampUtc, setCapturedTimestampUtc] = useState<string>(
    new Date().toISOString()
  );
  const [uploadedImageEl, setUploadedImageEl] =
    useState<HTMLImageElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    let cancelled = false;
    setCameraState('REQUESTING');
    setCameraNotice(null);
    setUploadedImageEl(null);
    const initialNowUtc = new Date().toISOString();
    setCapturedTimestampUtc(initialNowUtc);

    async function startCamera() {
      if (
        typeof navigator === 'undefined' ||
        !navigator.mediaDevices ||
        !navigator.mediaDevices.getUserMedia
      ) {
        if (!cancelled) {
          setCameraState('SYNTHETIC_FALLBACK');
          setCameraNotice(
            'Browser camera API unavailable in this container — using interactive viewfinder synthesizer (or upload a file below).'
          );
        }
        return;
      }

      try {
        const mediaStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
          audio: false,
        });
        if (cancelled) {
          mediaStream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = mediaStream;
        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream;
          await videoRef.current.play().catch(() => {});
        }
        setCameraState('LIVE_STREAM');
      } catch {
        if (!cancelled) {
          setCameraState('SYNTHETIC_FALLBACK');
          setCameraNotice(
            'Camera hardware/permission unavailable in preview iframe — active procedural field viewfinder & file upload fallback enabled.'
          );
        }
      }
    }

    startCamera();

    return () => {
      cancelled = true;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
    };
  }, [isOpen, stage, bin.id]);

  // Render watermarked canvas whenever state or timestamp updates
  useEffect(() => {
    if (!isOpen || !previewCanvasRef.current) return;

    const sourceEl =
      cameraState === 'FILE_UPLOADED' && uploadedImageEl
        ? uploadedImageEl
        : cameraState === 'LIVE_STREAM' && videoRef.current
          ? videoRef.current
          : null;

    const result = renderEvidenceToCanvas(previewCanvasRef.current, {
      binId: bin.id,
      binLabel: bin.label,
      zoneName: bin.zoneName,
      stage,
      lat: worker.position.lat,
      lng: worker.position.lng,
      accuracyMeters: worker.accuracyMeters,
      distanceMeters: distanceToBinMeters,
      utcTimestamp: capturedTimestampUtc,
      workerId: worker.workerId,
      isSimulated: isDemoMode,
      sourceElement: sourceEl,
    });

    setWatermarkedDataUrl(result.dataUrl);
    setSha256Hash(result.sha256Hash);
  }, [
    isOpen,
    cameraState,
    uploadedImageEl,
    bin.id,
    bin.label,
    bin.zoneName,
    stage,
    worker.position.lat,
    worker.position.lng,
    worker.accuracyMeters,
    worker.workerId,
    distanceToBinMeters,
    capturedTimestampUtc,
    isDemoMode,
  ]);

  if (!isOpen) return null;

  const handleSnapFrame = () => {
    const freshUtc = new Date().toISOString();
    setCapturedTimestampUtc(freshUtc);
    if (!previewCanvasRef.current) return;

    const sourceEl =
      cameraState === 'FILE_UPLOADED' && uploadedImageEl
        ? uploadedImageEl
        : cameraState === 'LIVE_STREAM' && videoRef.current
          ? videoRef.current
          : null;

    const result = renderEvidenceToCanvas(previewCanvasRef.current, {
      binId: bin.id,
      binLabel: bin.label,
      zoneName: bin.zoneName,
      stage,
      lat: worker.position.lat,
      lng: worker.position.lng,
      accuracyMeters: worker.accuracyMeters,
      distanceMeters: distanceToBinMeters,
      utcTimestamp: freshUtc,
      workerId: worker.workerId,
      isSimulated: isDemoMode,
      sourceElement: sourceEl,
    });
    setWatermarkedDataUrl(result.dataUrl);
    setSha256Hash(result.sha256Hash);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        setUploadedImageEl(img);
        setCameraState('FILE_UPLOADED');
        setCapturedTimestampUtc(new Date().toISOString());
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const handleConfirm = () => {
    // Ensure we have a fresh render if needed
    let finalDataUrl = watermarkedDataUrl;
    let finalHash = sha256Hash;
    if (previewCanvasRef.current && !finalDataUrl) {
      const rendered = renderEvidenceToCanvas(previewCanvasRef.current, {
        binId: bin.id,
        binLabel: bin.label,
        zoneName: bin.zoneName,
        stage,
        lat: worker.position.lat,
        lng: worker.position.lng,
        accuracyMeters: worker.accuracyMeters,
        distanceMeters: distanceToBinMeters,
        utcTimestamp: capturedTimestampUtc,
        workerId: worker.workerId,
        isSimulated: isDemoMode,
      });
      finalDataUrl = rendered.dataUrl;
      finalHash = rendered.sha256Hash;
    }

    onConfirmCapture({
      stage,
      dataUrl: finalDataUrl,
      capturedAtUtc: capturedTimestampUtc,
      lat: worker.position.lat,
      lng: worker.position.lng,
      accuracyMeters: worker.accuracyMeters,
      distanceToBinMeters,
      workerId: worker.workerId,
      isSimulated: isDemoMode,
      sha256Hash: finalHash,
      captureMethod:
        cameraState === 'LIVE_STREAM'
          ? 'LIVE_CAMERA'
          : cameraState === 'FILE_UPLOADED'
            ? 'FILE_UPLOAD'
            : 'SYNTHETIC_VIEWFINDER',
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-xs p-3 sm:p-6 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="camera-modal-title"
    >
      <div className="w-full max-w-3xl rounded-xl bg-white border border-slate-200 shadow-2xl overflow-hidden my-auto">
        {/* Top Header */}
        <div className="bg-[#065F46] text-white px-5 py-4 flex items-center justify-between gap-4">
          <div>
            <div className="text-xs font-mono text-emerald-200">
              MODULE A — HTML5 CANVAS WATERMARKED EVIDENCE CAPTURE
            </div>
            <h2
              id="camera-modal-title"
              className="text-base sm:text-lg font-bold tracking-tight"
            >
              {stage === 'BEFORE'
                ? `Step 1: Capture "Before" Photo (Unserviced Bin — ${bin.id})`
                : `Step 2: Capture "After" Photo (Cleared Bin — ${bin.id})`}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close camera modal"
            className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-lg bg-emerald-900/60 hover:bg-emerald-900 text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 sm:p-6 space-y-4">
          {/* Operational Integrity Disclosure */}
          <div className="rounded-lg bg-slate-50 border border-slate-200 px-3.5 py-2.5 text-xs text-slate-700 flex items-start gap-2.5">
            <ShieldAlert className="w-4 h-4 text-[#065F46] shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold text-slate-900">
                Operational Evidence Governance:
              </span>{' '}
              In-app camera capture acts as an operational documentation tool,
              not cryptographic proof of a live scene. Clearance verification
              relies on 15m geofence telemetry, standardized canvas watermarks,
              and human Supervisor Approval Queue review.
            </div>
          </div>

          {cameraNotice && (
            <div className="rounded-lg bg-amber-50 border border-amber-200 px-3.5 py-2 text-xs text-amber-900 flex items-center justify-between gap-2">
              <span>{cameraNotice}</span>
              <span className="font-mono font-semibold shrink-0">
                {cameraState === 'FILE_UPLOADED'
                  ? 'FILE LOADED'
                  : 'VIEWFINDER SYNTHESIS READY'}
              </span>
            </div>
          )}

          {/* Hidden live video element used as source when WebRTC stream is active */}
          <video
            ref={videoRef}
            playsInline
            muted
            className={
              cameraState === 'LIVE_STREAM'
                ? 'w-full max-h-44 object-cover rounded-lg border border-slate-300 bg-slate-900'
                : 'hidden'
            }
          />

          {/* Main HTML5 Watermarked Canvas Preview */}
          <div className="relative rounded-lg overflow-hidden border border-slate-300 bg-slate-950">
            <canvas
              ref={previewCanvasRef}
              data-testid="evidence-watermark-canvas"
              className="w-full h-auto block max-h-[380px] object-contain mx-auto"
            />
          </div>

          {/* Watermark Metadata Breakdown */}
          <div className="rounded-lg bg-slate-900 text-slate-100 p-3.5 font-mono text-xs space-y-1.5">
            <div className="flex flex-wrap items-center justify-between gap-2 text-emerald-400 font-semibold">
              <span>
                WATERMARK OVERLAY: EVIDENCE RECORD | {bin.id} | STAGE: {stage}
              </span>
              {isDemoMode && (
                <span className="text-amber-300">
                  TAG: DEMO — SIMULATED EVIDENCE
                </span>
              )}
            </div>
            <div className="text-slate-300 break-all">
              COORDS: {worker.position.lat.toFixed(5)},{' '}
              {worker.position.lng.toFixed(5)} (±
              {Math.round(worker.accuracyMeters)}m) · DIST TO PIN:{' '}
              {distanceToBinMeters.toFixed(1)}m · UTC: {capturedTimestampUtc} ·
              WORKER: {worker.workerId}
            </div>
            <div className="text-slate-400 break-all">
              SIMULATED SHA-256 UPLOAD HASH: {sha256Hash}
            </div>
          </div>

          {/* Controls */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-200">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleSnapFrame}
                className="min-h-[44px] px-3.5 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 text-xs font-semibold inline-flex items-center gap-2 transition-colors whitespace-nowrap"
              >
                <RefreshCw className="w-4 h-4" />
                Refresh Timestamp / Frame
              </button>

              <label className="min-h-[44px] px-3.5 py-2 rounded-lg border border-slate-300 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-semibold inline-flex items-center gap-2 cursor-pointer transition-colors whitespace-nowrap">
                <Upload className="w-4 h-4" />
                Fallback File Input
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleFileUpload}
                  className="sr-only"
                  aria-label="Upload fallback evidence photo"
                />
              </label>
            </div>

            <div className="flex items-center gap-2.5 ml-auto">
              <button
                type="button"
                onClick={onClose}
                className="min-h-[44px] px-4 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold transition-colors whitespace-nowrap"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                className="min-h-[44px] px-5 py-2.5 rounded-lg bg-[#065F46] hover:bg-emerald-800 text-white text-xs sm:text-sm font-semibold inline-flex items-center gap-2 shadow-xs transition-colors whitespace-nowrap"
              >
                <Camera className="w-4 h-4" />
                <CheckCircle2 className="w-4 h-4" />
                {stage === 'BEFORE'
                  ? 'Confirm & Stamp Before Photo'
                  : 'Confirm & Stamp After Photo'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
