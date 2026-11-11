import {
  buildEvidenceWatermarkLines,
  computeSimulatedSha256Hex,
  WatermarkInput,
} from './geofenceAndWorkflow';

export interface RenderWatermarkedCanvasOptions extends WatermarkInput {
  sourceElement?: HTMLVideoElement | HTMLImageElement | null;
  binLabel: string;
  zoneName: string;
  distanceMeters: number;
}

/**
 * Draws either a live camera frame / uploaded image OR a realistic procedural field inspection scene
 * onto an HTML5 <canvas>, and overlays the standardized Suthra Punjab Evidence Watermark banner.
 */
export function renderEvidenceToCanvas(
  canvas: HTMLCanvasElement,
  options: RenderWatermarkedCanvasOptions
): { dataUrl: string; sha256Hash: string } {
  const width = 960;
  const height = 720;
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return {
      dataUrl: '',
      sha256Hash: computeSimulatedSha256Hex(options.binId + options.utcTimestamp),
    };
  }

  // 1. Draw underlying scene (live camera video / image if provided and ready, otherwise realistic procedural bin scene)
  let drewExternalSource = false;
  if (options.sourceElement) {
    try {
      if (
        options.sourceElement instanceof HTMLVideoElement &&
        options.sourceElement.readyState >= 2 &&
        options.sourceElement.videoWidth > 0
      ) {
        ctx.drawImage(options.sourceElement, 0, 0, width, height);
        drewExternalSource = true;
      } else if (
        options.sourceElement instanceof HTMLImageElement &&
        options.sourceElement.complete &&
        options.sourceElement.naturalWidth > 0
      ) {
        ctx.drawImage(options.sourceElement, 0, 0, width, height);
        drewExternalSource = true;
      }
    } catch {
      drewExternalSource = false;
    }
  }

  if (!drewExternalSource) {
    drawProceduralFieldBinScene(ctx, width, height, options);
  }

  // 2. Draw optical viewfinder reticle & corner brackets
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
  ctx.lineWidth = 2;
  const pad = 28;
  const bracket = 26;
  // Top-left
  ctx.beginPath();
  ctx.moveTo(pad, pad + bracket);
  ctx.lineTo(pad, pad);
  ctx.lineTo(pad + bracket, pad);
  // Top-right
  ctx.moveTo(width - pad - bracket, pad);
  ctx.lineTo(width - pad, pad);
  ctx.lineTo(width - pad, pad + bracket);
  // Bottom-left (above watermark bar)
  const bottomY = height - 152;
  ctx.moveTo(pad, bottomY - bracket);
  ctx.lineTo(pad, bottomY);
  ctx.lineTo(pad + bracket, bottomY);
  // Bottom-right
  ctx.moveTo(width - pad - bracket, bottomY);
  ctx.lineTo(width - pad, bottomY);
  ctx.lineTo(width - pad, bottomY - bracket);
  ctx.stroke();

  // 3. Top-left stage & asset telemetry pill inside canvas
  ctx.fillStyle =
    options.stage === 'BEFORE'
      ? 'rgba(180, 83, 9, 0.92)'
      : 'rgba(6, 95, 70, 0.92)';
  ctx.fillRect(pad + 10, pad + 10, 340, 38);
  ctx.fillStyle = '#ffffff';
  ctx.font = '600 15px "IBM Plex Mono", monospace';
  ctx.fillText(
    `STAGE: ${options.stage === 'BEFORE' ? 'STEP 1 — BEFORE (UNSERVICED)' : 'STEP 2 — AFTER (CLEARED)'}`,
    pad + 22,
    pad + 34
  );

  if (options.isSimulated) {
    ctx.fillStyle = 'rgba(124, 45, 18, 0.92)';
    ctx.fillRect(width - pad - 310, pad + 10, 300, 38);
    ctx.fillStyle = '#fed7aa';
    ctx.font = '600 14px "IBM Plex Mono", monospace';
    ctx.fillText(
      'DEMO — SIMULATED EVIDENCE',
      width - pad - 294,
      pad + 34
    );
  }

  // 4. Standardized Bottom Evidence Watermark Scrim
  const barHeight = 136;
  const barY = height - barHeight;
  ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
  ctx.fillRect(0, barY, width, barHeight);

  // Top emerald accent rule on watermark bar
  ctx.fillStyle = options.stage === 'BEFORE' ? '#f59e0b' : '#10b981';
  ctx.fillRect(0, barY, width, 4);

  const lines = buildEvidenceWatermarkLines(options);
  const digestPayload = `${lines.join('|')}|dist=${options.distanceMeters.toFixed(1)}`;
  const sha256Hash = computeSimulatedSha256Hex(digestPayload);

  ctx.fillStyle = '#f8fafc';
  ctx.font = '600 14px "IBM Plex Mono", monospace';
  ctx.fillText(lines[0], 20, barY + 30);

  ctx.fillStyle = '#cbd5e1';
  ctx.font = '500 13px "IBM Plex Mono", monospace';
  ctx.fillText(
    `ASSET: ${options.binLabel} (${options.zoneName}) | PROXIMITY: ${options.distanceMeters.toFixed(1)}m FROM PIN (≤15m GATE PASS)`,
    20,
    barY + 56
  );

  ctx.fillStyle = '#94a3b8';
  ctx.font = '400 12px "IBM Plex Mono", monospace';
  ctx.fillText(
    `SHA-256 UPLOAD DIGEST (SIMULATED): ${sha256Hash}`,
    20,
    barY + 82
  );

  if (options.isSimulated && lines[1]) {
    ctx.fillStyle = '#fbbf24';
    ctx.font = '600 13px "IBM Plex Mono", monospace';
    ctx.fillText(
      `⚠ ${lines[1]}`,
      20,
      barY + 110
    );
  } else {
    ctx.fillStyle = '#34d399';
    ctx.font = '600 13px "IBM Plex Mono", monospace';
    ctx.fillText(
      'LIVE DEVICE TELEMETRY RECORD — SUTHRA PUNJAB FIELD EVIDENCE MODULE A',
      20,
      barY + 110
    );
  }

  const dataUrl = canvas.toDataURL('image/jpeg', 0.88);
  return { dataUrl, sha256Hash };
}

function drawProceduralFieldBinScene(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  options: RenderWatermarkedCanvasOptions
) {
  // Daylight urban street backdrop
  const skyGrad = ctx.createLinearGradient(0, 0, 0, height * 0.55);
  skyGrad.addColorStop(0, '#cfe2f3');
  skyGrad.addColorStop(1, '#e2e8f0');
  ctx.fillStyle = skyGrad;
  ctx.fillRect(0, 0, width, height * 0.55);

  // Distant urban trees & Lahore boulevard silhouette
  ctx.fillStyle = '#64748b';
  ctx.fillRect(0, height * 0.42, width, height * 0.13);
  ctx.fillStyle = '#334155';
  for (let x = 40; x < width; x += 140) {
    ctx.beginPath();
    ctx.arc(x, height * 0.42, 48, 0, Math.PI * 2);
    ctx.fill();
  }

  // Sidewalk & curb
  ctx.fillStyle = '#94a3b8';
  ctx.fillRect(0, height * 0.52, width, 24);
  ctx.fillStyle = '#475569';
  ctx.fillRect(0, height * 0.52 + 24, width, height * 0.48);

  // Curb hazard stripes
  for (let x = 0; x < width; x += 80) {
    ctx.fillStyle = x % 160 === 0 ? '#f59e0b' : '#1e293b';
    ctx.fillRect(x, height * 0.52, 40, 14);
  }

  // Public Waste Basket Asset (Center)
  const centerX = width / 2;
  const binTopY = 230;
  const binW = 210;
  const binH = 240;

  // Steel mounting post
  ctx.fillStyle = '#334155';
  ctx.fillRect(centerX - 10, binTopY - 30, 20, binH + 85);

  // If BEFORE: draw overflow litter around & on top of the bin
  if (options.stage === 'BEFORE') {
    // Ground litter items around base
    const groundItems = [
      { dx: -155, dy: 245, w: 46, h: 28, color: '#e2e8f0', label: 'Plastic Bag' },
      { dx: -95, dy: 258, w: 34, h: 20, color: '#fde047', label: 'Wrapper' },
      { dx: 115, dy: 248, w: 50, h: 30, color: '#cbd5e1', label: 'Cup/Carton' },
      { dx: 165, dy: 262, w: 38, h: 22, color: '#fca5a5', label: 'Packaging' },
    ];
    for (const item of groundItems) {
      ctx.fillStyle = item.color;
      ctx.beginPath();
      ctx.roundRect(centerX + item.dx, binTopY + item.dy, item.w, item.h, 6);
      ctx.fill();
      ctx.strokeStyle = '#475569';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    // Overflowing mound at top of basket
    const moundColors = ['#f1f5f9', '#cbd5e1', '#fef08a', '#93c5fd', '#fecaca'];
    for (let i = 0; i < 7; i++) {
      ctx.fillStyle = moundColors[i % moundColors.length];
      ctx.beginPath();
      ctx.arc(
        centerX - 70 + i * 24,
        binTopY - 8 + (i % 2) * 8,
        24,
        0,
        Math.PI * 2
      );
      ctx.fill();
      ctx.strokeStyle = '#64748b';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  }

  // Main Bin Cylinder (Deep GovTech Emerald)
  const binGrad = ctx.createLinearGradient(
    centerX - binW / 2,
    binTopY,
    centerX + binW / 2,
    binTopY
  );
  binGrad.addColorStop(0, '#064e3b');
  binGrad.addColorStop(0.5, '#047857');
  binGrad.addColorStop(1, '#064e3b');
  ctx.fillStyle = binGrad;
  ctx.beginPath();
  ctx.roundRect(centerX - binW / 2, binTopY, binW, binH, 14);
  ctx.fill();
  ctx.strokeStyle = '#ecfdf5';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Bin Rim
  ctx.fillStyle = '#022c22';
  ctx.fillRect(centerX - binW / 2 - 8, binTopY - 6, binW + 16, 16);

  // Stencil ID plate on Bin Body
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(centerX - 88, binTopY + 55, 176, 74);
  ctx.fillStyle = '#065f46';
  ctx.font = '700 13px "Plus Jakarta Sans", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('SUTHRA PUNJAB — DEMO ASSET', centerX, binTopY + 78);
  ctx.fillStyle = '#0f172a';
  ctx.font = '700 16px "IBM Plex Mono", monospace';
  ctx.fillText(options.binId, centerX, binTopY + 102);
  ctx.fillStyle = '#475569';
  ctx.font = '500 11px "IBM Plex Mono", monospace';
  ctx.fillText('FICTIONAL DEMO BASKET', centerX, binTopY + 120);

  // If AFTER: draw sanitized gleam & cleared verification checkmark badge on bin
  if (options.stage === 'AFTER') {
    ctx.fillStyle = '#10b981';
    ctx.beginPath();
    ctx.arc(centerX + 85, binTopY - 22, 26, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.font = '700 22px sans-serif';
    ctx.fillText('✓', centerX + 85, binTopY - 14);
  }

  ctx.textAlign = 'left';
}

/**
 * Generates a lightweight SVG Data URL with the standardized watermark for seeded demo records
 * so the Supervisor Review Queue has immediate Before/After visual evidence on initial load.
 */
export function createSeededWatermarkedSvgDataUrl(
  options: RenderWatermarkedCanvasOptions
): { dataUrl: string; sha256Hash: string } {
  const lines = buildEvidenceWatermarkLines(options);
  const sha256Hash = computeSimulatedSha256Hex(lines.join('|'));
  const isBefore = options.stage === 'BEFORE';

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600" viewBox="0 0 800 600">
    <rect width="800" height="320" fill="#dbeafe" />
    <rect y="320" width="800" height="280" fill="#475569" />
    <rect y="310" width="800" height="16" fill="#94a3b8" />
    <rect x="392" y="160" width="16" height="260" fill="#1e293b" />
    ${
      isBefore
        ? `<circle cx="355" cy="182" r="24" fill="#fef08a" stroke="#64748b" stroke-width="2"/>
           <circle cx="395" cy="174" r="26" fill="#f1f5f9" stroke="#64748b" stroke-width="2"/>
           <circle cx="435" cy="184" r="22" fill="#fca5a5" stroke="#64748b" stroke-width="2"/>
           <rect x="240" y="380" width="44" height="24" rx="5" fill="#e2e8f0" />
           <rect x="515" y="388" width="48" height="26" rx="5" fill="#fde047" />`
        : `<circle cx="485" cy="165" r="22" fill="#10b981" stroke="#ffffff" stroke-width="3"/>
           <text x="485" y="173" text-anchor="middle" fill="#ffffff" font-family="sans-serif" font-size="20" font-weight="bold">✓</text>`
    }
    <rect x="305" y="185" width="190" height="215" rx="12" fill="#065f46" stroke="#ecfdf5" stroke-width="2" />
    <rect x="298" y="180" width="204" height="14" rx="4" fill="#022c22" />
    <rect x="322" y="230" width="156" height="68" rx="4" fill="#ffffff" />
    <text x="400" y="250" text-anchor="middle" fill="#065f46" font-family="monospace" font-size="11" font-weight="bold">SUTHRA PUNJAB DEMO</text>
    <text x="400" y="272" text-anchor="middle" fill="#0f172a" font-family="monospace" font-size="14" font-weight="bold">${options.binId}</text>
    <text x="400" y="290" text-anchor="middle" fill="#475569" font-family="monospace" font-size="10">FICTIONAL DEMO ASSET</text>
    <rect x="24" y="24" width="320" height="34" rx="4" fill="${isBefore ? '#b45309' : '#065f46'}" />
    <text x="38" y="46" fill="#ffffff" font-family="monospace" font-size="13" font-weight="bold">STAGE: ${options.stage} (${isBefore ? 'UNSERVICED BIN' : 'CLEARED BIN'})</text>
    ${
      options.isSimulated
        ? `<rect x="510" y="24" width="266" height="34" rx="4" fill="#7c2d12" />
           <text x="524" y="46" fill="#fed7aa" font-family="monospace" font-size="13" font-weight="bold">DEMO — SIMULATED EVIDENCE</text>`
        : ''
    }
    <rect y="476" width="800" height="124" fill="#0f172a" fill-opacity="0.94" />
    <rect y="476" width="800" height="4" fill="${isBefore ? '#f59e0b' : '#10b981'}" />
    <text x="18" y="504" fill="#f8fafc" font-family="monospace" font-size="11.5" font-weight="bold">${lines[0]}</text>
    <text x="18" y="528" fill="#cbd5e1" font-family="monospace" font-size="11">ASSET: ${options.binLabel} (${options.zoneName}) | PROXIMITY: ${options.distanceMeters.toFixed(1)}m FROM PIN</text>
    <text x="18" y="552" fill="#94a3b8" font-family="monospace" font-size="10.5">SHA-256 DIGEST: ${sha256Hash}</text>
    <text x="18" y="578" fill="${options.isSimulated ? '#fbbf24' : '#34d399'}" font-family="monospace" font-size="11" font-weight="bold">${
      options.isSimulated
        ? 'DEMO — SIMULATED EVIDENCE (SANDBOX RECORD — EXCLUDED FROM LIVE KPIs)'
        : 'FIELD TELEMETRY RECORD — MODULE A MOBILE VISIT EVIDENCE'
    }</text>
  </svg>`;

  return {
    dataUrl: `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`,
    sha256Hash,
  };
}
