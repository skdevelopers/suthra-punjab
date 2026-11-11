import React, { useState } from 'react';
import { ExternalLink, KeyRound, ShieldCheck, X } from 'lucide-react';

interface ApiKeyGovernanceModalProps {
  isOpen: boolean;
  currentApiKey: string;
  isEnvProvided: boolean;
  onSaveKey: (newKey: string) => void;
  onClose: () => void;
}

export const ApiKeyGovernanceModal: React.FC<ApiKeyGovernanceModalProps> = ({
  isOpen,
  currentApiKey,
  isEnvProvided,
  onSaveKey,
  onClose,
}) => {
  const [inputKey, setInputKey] = useState(currentApiKey);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSaveKey(inputKey.trim());
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 backdrop-blur-xs p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="api-key-governance-title"
    >
      <div className="w-full max-w-xl rounded-xl bg-white border border-slate-200 shadow-2xl overflow-hidden">
        <div className="bg-[#065F46] text-white px-5 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <KeyRound className="w-5 h-5 text-emerald-200 shrink-0" />
            <div>
              <div className="text-xs font-mono text-emerald-200">
                GOOGLE MAPS PLATFORM — BROWSER KEY & SECURITY GOVERNANCE
              </div>
              <h2
                id="api-key-governance-title"
                className="text-base font-bold tracking-tight"
              >
                Maps API Key Configuration & Referrer Restrictions
              </h2>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Maps API security dialog"
            className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-lg bg-emerald-900/60 hover:bg-emerald-900 text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div className="rounded-lg bg-emerald-50/80 border border-emerald-200 p-3.5 text-xs text-slate-800 space-y-2">
            <div className="font-semibold text-[#065F46] flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 shrink-0" />
              Mandatory Presenter Security Checklist (Google Cloud Console)
            </div>
            <ul className="list-disc pl-5 space-y-1 text-slate-700">
              <li>
                <strong>HTTP Referrer (Website) Restrictions:</strong> Always
                restrict browser Maps API keys to authorized domains (e.g.,{' '}
                <code className="font-mono bg-white px-1 py-0.5 rounded border border-emerald-200">
                  https://*.run.app/*
                </code>{' '}
                and{' '}
                <code className="font-mono bg-white px-1 py-0.5 rounded border border-emerald-200">
                  http://localhost:3000/*
                </code>
                ).
              </li>
              <li>
                <strong>API Scope Restrictions:</strong> Limit the key strictly
                to <em>Maps JavaScript API</em>, <em>Routes API</em>, and{' '}
                <em>Geocoding API</em>.
              </li>
              <li>
                <strong>Zero Server-Side Secrets in Frontend:</strong> Never
                embed service account keys, database credentials, or S3 signing
                secrets in client bundles.
              </li>
            </ul>
            <div className="pt-1">
              <a
                href="https://docs.cloud.google.com/api-keys/docs/add-restrictions-api-keys?utm_campaign=gmp_mcp_codeassist_v1_aistudio"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 font-semibold text-[#065F46] underline hover:text-emerald-900"
              >
                Google Cloud Guide: Restricting an API Key
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="browser-maps-api-key-input"
              className="block text-xs font-semibold text-slate-800"
            >
              Browser Google Maps Platform API Key
            </label>
            <input
              id="browser-maps-api-key-input"
              type="text"
              value={inputKey}
              onChange={(e) => setInputKey(e.target.value)}
              placeholder="Enter browser Maps API key (AIza...)"
              className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-xs font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#065F46]"
            />
            <p className="text-[11px] text-slate-500">
              {isEnvProvided
                ? 'An environment-injected Maps API key is currently active. You can override it for session testing above.'
                : 'No environment variable key was detected at build time. Provide a browser Maps API key above to enable live Google Maps tiles, Routes API, and Reverse Geocoding.'}
            </p>
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[44px] px-4 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700"
            >
              Close
            </button>
            <button
              type="submit"
              className="min-h-[44px] px-5 py-2 rounded-lg bg-[#065F46] hover:bg-emerald-800 text-xs font-semibold text-white"
            >
              Apply Browser Key
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
