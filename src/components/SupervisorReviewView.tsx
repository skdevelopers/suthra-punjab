import React, { useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  Database,
  FileCheck2,
  RotateCcw,
  ShieldCheck,
} from 'lucide-react';
import { BinWorkflowStatus, WasteBinAsset } from '../types/waste';
import { SeparatedKpiSummary } from '../utils/geofenceAndWorkflow';

interface SupervisorReviewViewProps {
  bins: WasteBinAsset[];
  kpis: SeparatedKpiSummary;
  onApproveBin: (binId: string, supervisorId: string) => void;
  onRejectBin: (binId: string, supervisorId: string, reason: string) => void;
  onSelectBinForInspection: (binId: string) => void;
}

export const SupervisorReviewView: React.FC<SupervisorReviewViewProps> = ({
  bins,
  kpis,
  onApproveBin,
  onRejectBin,
  onSelectBinForInspection,
}) => {
  const [statusFilter, setStatusFilter] = useState<'ALL' | BinWorkflowStatus>('ALL');
  const [rejectNotesByBin, setRejectNotesByBin] = useState<Record<string, string>>({});
  const supervisorId = 'SUP-LHR-UC42-09';

  const awaitingQueue = bins.filter((b) => b.status === 'Awaiting review');
  const filteredBins =
    statusFilter === 'ALL'
      ? bins
      : bins.filter((b) => b.status === statusFilter);

  return (
    <div className="space-y-6">
      {/* 1. Separated KPI Section: Live Operational KPIs vs. Simulated Demo Audit Sandbox */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
        {/* Live Operational KPIs */}
        <div className="lg:col-span-8 rounded-xl bg-white border border-slate-200 p-5 flex flex-col justify-between">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100">
            <div>
              <div className="text-xs font-mono font-semibold text-[#065F46]">
                LIVE OPERATIONAL METRICS (FIELD GPS VERIFIED ONLY)
              </div>
              <h2 className="text-base font-bold text-slate-900">
                Operational Clearance KPIs — Lahore UC-42 Fictional Demo Fleet
              </h2>
            </div>
            <span className="text-xs text-slate-500 font-mono">
              Simulated records excluded from live KPIs
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-4">
            <div className="p-3 rounded-lg bg-slate-50 border border-slate-200/80">
              <div className="text-xs text-slate-500">Seeded Demo Assets</div>
              <div
                data-testid="kpi-operational-total"
                className="text-2xl font-bold font-mono tabular-nums text-slate-900 mt-1"
              >
                {kpis.operational.totalAssets}
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                Fictional Demo Bins
              </div>
            </div>

            <div className="p-3 rounded-lg bg-slate-50 border border-slate-200/80">
              <div className="text-xs text-slate-500">Pending Service</div>
              <div
                data-testid="kpi-operational-pending"
                className="text-2xl font-bold font-mono tabular-nums text-slate-900 mt-1"
              >
                {kpis.operational.pendingCount}
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                Unserviced in shift
              </div>
            </div>

            <div className="p-3 rounded-lg bg-slate-50 border border-slate-200/80">
              <div className="text-xs text-slate-500">Live Awaiting Review</div>
              <div
                data-testid="kpi-operational-awaiting"
                className="text-2xl font-bold font-mono tabular-nums text-amber-700 mt-1"
              >
                {kpis.operational.awaitingReviewCount}
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                Non-simulated queue
              </div>
            </div>

            <div className="p-3 rounded-lg bg-emerald-50/70 border border-emerald-200">
              <div className="text-xs font-medium text-[#065F46]">
                Verified Cleared (Live)
              </div>
              <div
                data-testid="kpi-operational-verified"
                className="text-2xl font-bold font-mono tabular-nums text-[#065F46] mt-1"
              >
                {kpis.operational.verifiedClearedCount}
              </div>
              <div className="text-[11px] text-emerald-800 mt-0.5">
                Supervisor signed-off
              </div>
            </div>
          </div>
        </div>

        {/* Simulated Demo Audit Sandbox Counter */}
        <div className="lg:col-span-4 rounded-xl bg-amber-50/60 border border-amber-200 p-5 flex flex-col justify-between">
          <div className="pb-3 border-b border-amber-200/80">
            <div className="text-xs font-mono font-semibold text-amber-900">
              DEMO AUDIT SANDBOX (QUARANTINED)
            </div>
            <h2 className="text-base font-bold text-amber-950">
              Simulated Demo Records Counter
            </h2>
            <p className="text-xs text-amber-800 mt-1">
              Captures created with Desk Simulator ON are tagged{' '}
              <code className="font-mono font-semibold">
                DEMO — SIMULATED EVIDENCE
              </code>{' '}
              and isolated here so they never inflate operational KPIs.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-2.5 pt-4">
            <div className="p-2.5 rounded-lg bg-white border border-amber-200">
              <div className="text-[11px] text-amber-900">Total Simulated</div>
              <div
                data-testid="kpi-sandbox-total"
                className="text-xl font-bold font-mono tabular-nums text-amber-950 mt-0.5"
              >
                {kpis.simulatedSandbox.simulatedSubmissionsCount}
              </div>
            </div>
            <div className="p-2.5 rounded-lg bg-white border border-amber-200">
              <div className="text-[11px] text-amber-900">In Review Queue</div>
              <div
                data-testid="kpi-sandbox-awaiting"
                className="text-xl font-bold font-mono tabular-nums text-amber-800 mt-0.5"
              >
                {kpis.simulatedSandbox.simulatedAwaitingReviewCount}
              </div>
            </div>
            <div className="p-2.5 rounded-lg bg-white border border-amber-200">
              <div className="text-[11px] text-amber-900">Sandbox Approved</div>
              <div
                data-testid="kpi-sandbox-verified"
                className="text-xl font-bold font-mono tabular-nums text-emerald-800 mt-0.5"
              >
                {kpis.simulatedSandbox.simulatedVerifiedCount}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 2. Supervisor Approval Queue (Awaiting review) */}
      <div className="rounded-xl bg-white border border-slate-200 overflow-hidden">
        <div className="bg-[#065F46] text-white px-5 py-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <ClipboardCheck className="w-5 h-5 text-emerald-200 shrink-0" />
            <div>
              <div className="text-xs font-mono text-emerald-200">
                STAGE 4 WORKFLOW GATE — HUMAN SUPERVISOR VERIFICATION
              </div>
              <h2 className="text-base sm:text-lg font-bold tracking-tight">
                Supervisor Approval Queue (`Awaiting review` —{' '}
                {awaitingQueue.length}{' '}
                {awaitingQueue.length === 1 ? 'Submission' : 'Submissions'})
              </h2>
            </div>
          </div>
          <div className="text-xs font-mono text-emerald-100">
            Active Reviewer: {supervisorId}
          </div>
        </div>

        {awaitingQueue.length === 0 ? (
          <div className="p-8 text-center space-y-2">
            <FileCheck2 className="w-8 h-8 text-emerald-700 mx-auto" />
            <div className="text-sm font-semibold text-slate-900">
              All Submitted Field Evidence Packages Reviewed
            </div>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              No bins are currently waiting in the <code className="font-mono">Awaiting review</code> state. Switch to Field Crew View to capture Before & After evidence on a Pending bin.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-200">
            {awaitingQueue.map((bin) => (
              <div key={bin.id} className="p-5 space-y-4">
                {/* Submission Header */}
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
                      <span className="font-bold text-slate-900 text-sm">
                        {bin.id}
                      </span>
                      <span aria-hidden="true" className="text-slate-400">
                        ·
                      </span>
                      <span className="text-amber-800 font-semibold">
                        Status: {bin.status}
                      </span>
                      <span aria-hidden="true" className="text-slate-400">
                        ·
                      </span>
                      <span className="text-slate-600">
                        {bin.preAssignedUcLabel} (Fictional Demo Asset)
                      </span>
                      {bin.isSimulatedEvidence && (
                        <>
                          <span aria-hidden="true" className="text-slate-400">
                            ·
                          </span>
                          <span className="text-amber-900 font-bold bg-amber-100 px-2 py-0.5 rounded">
                            DEMO — SIMULATED EVIDENCE
                          </span>
                        </>
                      )}
                    </div>
                    <h3 className="text-base font-bold text-slate-900">
                      {bin.label}
                    </h3>
                    <div className="text-xs text-slate-600">
                      {bin.landmarkContext} · Submitted UTC:{' '}
                      <span className="font-mono">
                        {bin.submittedAtUtc || 'N/A'}
                      </span>
                    </div>
                  </div>

                  {/* Supervisor Decision Controls */}
                  <div className="flex flex-wrap items-center gap-2.5">
                    <input
                      type="text"
                      value={rejectNotesByBin[bin.id] || ''}
                      onChange={(e) =>
                        setRejectNotesByBin((prev) => ({
                          ...prev,
                          [bin.id]: e.target.value,
                        }))
                      }
                      placeholder="Optional rejection/re-inspect note..."
                      aria-label={`Rejection note for ${bin.id}`}
                      className="min-h-[44px] rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-800 w-56"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        onRejectBin(
                          bin.id,
                          supervisorId,
                          rejectNotesByBin[bin.id] ||
                            'Re-inspection requested by Supervisor'
                        )
                      }
                      className="min-h-[44px] px-3.5 py-2 rounded-lg border border-red-300 bg-white hover:bg-red-50 text-red-700 text-xs font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
                    >
                      <RotateCcw className="w-4 h-4" />
                      Reject / Re-inspect
                    </button>
                    <button
                      type="button"
                      onClick={() => onApproveBin(bin.id, supervisorId)}
                      className="min-h-[44px] px-4 py-2 rounded-lg bg-[#065F46] hover:bg-emerald-800 text-white text-xs font-semibold inline-flex items-center gap-1.5 shadow-xs transition-colors whitespace-nowrap"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      Approve & Mark Verified Cleared
                    </button>
                  </div>
                </div>

                {/* Side-by-Side Watermarked Before & After Evidence Pair */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* BEFORE PHOTO */}
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-2">
                    <div className="flex items-center justify-between text-xs font-mono">
                      <span className="font-bold text-amber-900">
                        STEP 1: BEFORE PHOTO (UNSERVICED)
                      </span>
                      <span className="text-slate-600">
                        {bin.beforePhoto?.capturedAtUtc}
                      </span>
                    </div>
                    {bin.beforePhoto ? (
                      <>
                        <img
                          src={bin.beforePhoto.dataUrl}
                          alt={`Before evidence watermarked photo for ${bin.id}`}
                          referrerPolicy="no-referrer"
                          className="w-full h-52 object-contain rounded bg-slate-900 border border-slate-300"
                        />
                        <div className="text-[11px] font-mono text-slate-600 space-y-0.5 break-all">
                          <div>
                            GPS: {bin.beforePhoto.lat.toFixed(5)},{' '}
                            {bin.beforePhoto.lng.toFixed(5)} (±
                            {Math.round(bin.beforePhoto.accuracyMeters)}m) ·
                            Dist: {bin.beforePhoto.distanceToBinMeters.toFixed(1)}
                            m · Worker: {bin.beforePhoto.workerId}
                          </div>
                          <div className="text-slate-500">
                            SHA-256: {bin.beforePhoto.sha256Hash}
                          </div>
                        </div>
                      </>
                    ) : (
                      <div className="h-52 flex items-center justify-center text-xs text-slate-400">
                        No Before photo attached
                      </div>
                    )}
                  </div>

                  {/* AFTER PHOTO */}
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-2">
                    <div className="flex items-center justify-between text-xs font-mono">
                      <span className="font-bold text-[#065F46]">
                        STEP 2: AFTER PHOTO (CLEARED STATE)
                      </span>
                      <span className="text-slate-600">
                        {bin.afterPhoto?.capturedAtUtc}
                      </span>
                    </div>
                    {bin.afterPhoto ? (
                      <>
                        <img
                          src={bin.afterPhoto.dataUrl}
                          alt={`After evidence watermarked photo for ${bin.id}`}
                          referrerPolicy="no-referrer"
                          className="w-full h-52 object-contain rounded bg-slate-900 border border-slate-300"
                        />
                        <div className="text-[11px] font-mono text-slate-600 space-y-0.5 break-all">
                          <div>
                            GPS: {bin.afterPhoto.lat.toFixed(5)},{' '}
                            {bin.afterPhoto.lng.toFixed(5)} (±
                            {Math.round(bin.afterPhoto.accuracyMeters)}m) ·
                            Dist: {bin.afterPhoto.distanceToBinMeters.toFixed(1)}m
                            · Worker: {bin.afterPhoto.workerId}
                          </div>
                          <div className="text-slate-500">
                            SHA-256: {bin.afterPhoto.sha256Hash}
                          </div>
                        </div>
                      </>
                    ) : (
                      <div className="h-52 flex items-center justify-center text-xs text-slate-400">
                        No After photo attached
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 3. Full 8-Asset Fictional Demo Registry & Workflow State Ledger */}
      <div className="rounded-xl bg-white border border-slate-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-xs font-mono text-slate-500">
              SEEDED ASSET REGISTRY — MALL ROAD, LIBERTY MARKET & GULBERG
            </div>
            <h2 className="text-base font-bold text-slate-900">
              All 8 Fictional Demo Trash Basket Assets (`DEMO-LHR-UC42-01` – `08`)
            </h2>
          </div>

          {/* Interactive Status Filter Controls */}
          <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-lg">
            {(
              [
                'ALL',
                'Pending',
                'Before captured',
                'After captured',
                'Awaiting review',
                'Verified cleared',
              ] as const
            ).map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => setStatusFilter(st)}
                className={`px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                  statusFilter === st
                    ? 'bg-[#065F46] text-white shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {st === 'ALL' ? 'All 8 Assets' : st}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-mono text-slate-600">
                <th className="py-3 px-4">ASSET ID</th>
                <th className="py-3 px-4">FICTIONAL DEMO ASSET & SECTOR</th>
                <th className="py-3 px-4">PRE-ASSIGNED UC METADATA</th>
                <th className="py-3 px-4">5-STAGE WORKFLOW STATE</th>
                <th className="py-3 px-4">EVIDENCE MODE</th>
                <th className="py-3 px-4 text-right">ACTION</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-xs">
              {filteredBins.map((bin) => (
                <tr key={bin.id} className="hover:bg-slate-50/80">
                  <td className="py-3 px-4 font-mono font-bold text-slate-900 whitespace-nowrap">
                    {bin.id}
                  </td>
                  <td className="py-3 px-4">
                    <div className="font-semibold text-slate-900">
                      {bin.label}
                    </div>
                    <div className="text-slate-500 text-[11px]">
                      {bin.zoneName} · {bin.coordinates.lat.toFixed(4)},{' '}
                      {bin.coordinates.lng.toFixed(4)}
                    </div>
                  </td>
                  <td className="py-3 px-4 text-slate-600 font-mono text-[11px]">
                    {bin.preAssignedUcCode} · Fictional Demo Asset
                  </td>
                  <td className="py-3 px-4 font-mono font-semibold whitespace-nowrap">
                    <span
                      className={
                        bin.status === 'Verified cleared'
                          ? 'text-[#065F46]'
                          : bin.status === 'Awaiting review'
                            ? 'text-amber-700'
                            : bin.status === 'Before captured' ||
                                bin.status === 'After captured'
                              ? 'text-blue-700'
                              : 'text-slate-600'
                      }
                    >
                      {bin.status}
                    </span>
                  </td>
                  <td className="py-3 px-4 font-mono text-[11px] whitespace-nowrap">
                    {bin.status === 'Pending' ? (
                      <span className="text-slate-400">—</span>
                    ) : bin.isSimulatedEvidence ? (
                      <span className="text-amber-800 font-semibold">
                        DEMO — SIMULATED EVIDENCE
                      </span>
                    ) : (
                      <span className="text-[#065F46] font-semibold">
                        LIVE FIELD GPS RECORD
                      </span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-right whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => onSelectBinForInspection(bin.id)}
                      className="px-3 py-1.5 rounded-md border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 font-semibold text-xs transition-colors"
                    >
                      Open in Field View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 4. Production Backend & RBAC Architecture Footnote */}
      <div className="rounded-xl bg-slate-900 text-slate-200 p-4 text-xs flex items-start gap-3">
        <Database className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <div className="font-semibold text-white">
            Production Deployment Architecture Note (RBAC, PostGIS & Object Storage)
          </div>
          <p className="text-slate-300 leading-relaxed">
            The <strong>Demo Role Switcher</strong> is provided strictly for
            single-screen prototype evaluation. Production Suthra Punjab
            deployments enforce strict Role-Based Access Control (RBAC) via a{' '}
            <code className="font-mono text-emerald-300">
              Laravel + PostgreSQL / PostGIS
            </code>{' '}
            backend with authoritative server-generated UTC timestamps,
            server-computed SHA-256 upload digests, and immutable S3-compatible
            object storage buckets.
          </p>
        </div>
      </div>
    </div>
  );
};
