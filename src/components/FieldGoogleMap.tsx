import React, { useEffect, useRef, useState } from 'react';
import {
  APIProvider,
  AdvancedMarker,
  APILoadingStatus,
  Map as GoogleMap,
  MapMouseEvent,
  useApiLoadingStatus,
  useMap,
  useMapsLibrary,
} from '@vis.gl/react-google-maps';
import {
  Compass,
  LocateFixed,
  Navigation,
  Route as RouteIcon,
} from 'lucide-react';
import {
  LatLngPoint,
  RouteComputationResult,
  TravelModeOption,
  WasteBinAsset,
  WorkerTelemetryState,
} from '../types/waste';
import {
  calculateHaversineDistanceMeters,
  GEOFENCE_MAX_DISTANCE_METERS,
} from '../utils/geofenceAndWorkflow';

interface FieldGoogleMapProps {
  apiKey: string;
  bins: WasteBinAsset[];
  activeBin: WasteBinAsset;
  worker: WorkerTelemetryState;
  travelMode: TravelModeOption;
  isDemoMode: boolean;
  isWithin15m: boolean;
  onSelectBin: (binId: string) => void;
  onMoveWorker: (coords: LatLngPoint) => void;
  onRouteComputed: (result: RouteComputationResult) => void;
  onRouteMatrixComputed: (matrixByBinId: Record<string, { distanceMeters: number; durationSeconds: number }>) => void;
}

let routeMatrixRpcUnsupportedOnKey = false;

/**
 * Inner Map Overlays:
 * - Worker Accuracy Halo Circle & 15m Target Geofence Circle (Amber outside / Emerald inside)
 * - Modern Routes Library: Route.computeRoutes() polyline & RouteMatrix.computeRouteMatrix()
 */
const MapGeofenceAndRouteController: React.FC<{
  bins: WasteBinAsset[];
  activeBin: WasteBinAsset;
  worker: WorkerTelemetryState;
  travelMode: TravelModeOption;
  isWithin15m: boolean;
  onRouteComputed: (result: RouteComputationResult) => void;
  onRouteMatrixComputed: (matrixByBinId: Record<string, { distanceMeters: number; durationSeconds: number }>) => void;
}> = ({
  bins,
  activeBin,
  worker,
  travelMode,
  isWithin15m,
  onRouteComputed,
  onRouteMatrixComputed,
}) => {
  const map = useMap();
  const routesLib = useMapsLibrary('routes');

  const geofenceCircleRef = useRef<google.maps.Circle | null>(null);
  const accuracyCircleRef = useRef<google.maps.Circle | null>(null);
  const routePolylinesRef = useRef<google.maps.Polyline[]>([]);

  // Pan map smoothly when user switches activeBin.id
  useEffect(() => {
    if (!map) return;
    map.panTo(activeBin.coordinates);
  }, [map, activeBin.id, activeBin.coordinates.lat, activeBin.coordinates.lng]);

  // 1. Draw 15m target geofence circle (amber outside / emerald inside) + worker GPS accuracy halo
  useEffect(() => {
    if (!map || typeof google === 'undefined' || !google.maps?.Circle) return;

    if (!geofenceCircleRef.current) {
      geofenceCircleRef.current = new google.maps.Circle({
        map,
        clickable: false,
        zIndex: 20,
      });
    }

    const fenceColor = isWithin15m ? '#059669' : '#d97706';
    geofenceCircleRef.current.setOptions({
      center: activeBin.coordinates,
      radius: GEOFENCE_MAX_DISTANCE_METERS,
      strokeColor: fenceColor,
      strokeOpacity: 0.95,
      strokeWeight: 2.5,
      fillColor: fenceColor,
      fillOpacity: isWithin15m ? 0.24 : 0.16,
      map,
    });

    if (!accuracyCircleRef.current) {
      accuracyCircleRef.current = new google.maps.Circle({
        map,
        clickable: false,
        zIndex: 15,
      });
    }

    const isPoorAcc = worker.accuracyMeters > 25;
    const accColor = isPoorAcc ? '#d97706' : '#2563eb';
    accuracyCircleRef.current.setOptions({
      center: worker.position,
      radius: Math.max(3, worker.accuracyMeters),
      strokeColor: accColor,
      strokeOpacity: 0.75,
      strokeWeight: 1.5,
      fillColor: accColor,
      fillOpacity: 0.12,
      map,
    });
  }, [
    map,
    activeBin.coordinates.lat,
    activeBin.coordinates.lng,
    worker.position.lat,
    worker.position.lng,
    worker.accuracyMeters,
    isWithin15m,
  ]);

  useEffect(() => {
    return () => {
      if (geofenceCircleRef.current) {
        geofenceCircleRef.current.setMap(null);
        geofenceCircleRef.current = null;
      }
      if (accuracyCircleRef.current) {
        accuracyCircleRef.current.setMap(null);
        accuracyCircleRef.current = null;
      }
      routePolylinesRef.current.forEach((p) => p.setMap(null));
      routePolylinesRef.current = [];
    };
  }, []);

  // 2. Modern Routes Library: Route.computeRoutes() for active bin polyline + distance/duration
  useEffect(() => {
    if (!map || !routesLib) return;

    routePolylinesRef.current.forEach((p) => p.setMap(null));
    routePolylinesRef.current = [];

    let cancelled = false;
    const RouteClass = (routesLib as any).Route;
    const originPt = { lat: worker.position.lat, lng: worker.position.lng };
    const destPt = {
      lat: activeBin.coordinates.lat,
      lng: activeBin.coordinates.lng,
    };

    const computeFallback = () => {
      const straight = calculateHaversineDistanceMeters(originPt, destPt);
      const roadEst = Math.round(straight * 1.28);
      const speedMps = travelMode === 'WALKING' ? 1.35 : 7.5;
      const durationSec = Math.max(5, Math.round(roadEst / speedMps));

      if (!cancelled) {
        if (typeof google !== 'undefined' && google.maps?.Polyline) {
          const fallbackLine = new google.maps.Polyline({
            path: [originPt, destPt],
            geodesic: true,
            strokeColor: '#065F46',
            strokeOpacity: 0.85,
            strokeWeight: 4,
            map,
          });
          routePolylinesRef.current = [fallbackLine];
        }
        onRouteComputed({
          binId: activeBin.id,
          travelMode,
          roadDistanceMeters: roadEst,
          durationSeconds: durationSec,
          isFallbackEstimate: true,
          computedAtMs: Date.now(),
        });
      }
    };

    if (!RouteClass || typeof RouteClass.computeRoutes !== 'function') {
      computeFallback();
      return;
    }

    const request = {
      origin: originPt,
      destination: destPt,
      travelMode,
      fields: ['path', 'distanceMeters', 'durationMillis', 'viewport', 'legs'],
    };

    RouteClass.computeRoutes(request)
      .then((res: any) => {
        if (cancelled) return;
        const primaryRoute = res?.routes?.[0];
        if (!primaryRoute) {
          computeFallback();
          return;
        }

        if (typeof primaryRoute.createPolylines === 'function') {
          const polylines: google.maps.Polyline[] =
            primaryRoute.createPolylines();
          polylines.forEach((pl) => {
            pl.setOptions({
              strokeColor: '#065F46',
              strokeOpacity: 0.9,
              strokeWeight: 5,
            });
            pl.setMap(map);
          });
          routePolylinesRef.current = polylines;
        }

        const distanceMeters =
          typeof primaryRoute.distanceMeters === 'number'
            ? primaryRoute.distanceMeters
            : Math.round(
                calculateHaversineDistanceMeters(originPt, destPt) * 1.25
              );
        const durationMillis =
          typeof primaryRoute.durationMillis === 'number'
            ? primaryRoute.durationMillis
            : Math.round(
                (distanceMeters / (travelMode === 'WALKING' ? 1.35 : 7.5)) *
                  1000
              );

        onRouteComputed({
          binId: activeBin.id,
          travelMode,
          roadDistanceMeters: distanceMeters,
          durationSeconds: Math.max(1, Math.round(durationMillis / 1000)),
          isFallbackEstimate: false,
          computedAtMs: Date.now(),
        });
      })
      .catch((err: any) => {
        const msg = String(err?.message || err || '');
        if (
          msg.includes('429') ||
          msg.includes('RESOURCE_EXHAUSTED') ||
          msg.includes('OVER_QUERY_LIMIT') ||
          msg.includes('Quota')
        ) {
          window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
        }
        computeFallback();
      });

    return () => {
      cancelled = true;
      routePolylinesRef.current.forEach((p) => p.setMap(null));
      routePolylinesRef.current = [];
    };
  }, [
    map,
    routesLib,
    worker.position.lat,
    worker.position.lng,
    activeBin.id,
    activeBin.coordinates.lat,
    activeBin.coordinates.lng,
    travelMode,
    onRouteComputed,
  ]);

  // 3. Modern Routes Library: RouteMatrix.computeRouteMatrix() across all 8 bins
  useEffect(() => {
    if (!routesLib) return;
    let cancelled = false;
    const RouteMatrixClass = (routesLib as any).RouteMatrix;
    const originPt = { lat: worker.position.lat, lng: worker.position.lng };

    const buildEstimatedMatrix = () => {
      const fallbackMatrix: Record<
        string,
        { distanceMeters: number; durationSeconds: number }
      > = {};
      const speedMps = travelMode === 'WALKING' ? 1.35 : 7.5;
      for (const b of bins) {
        const straight = calculateHaversineDistanceMeters(
          originPt,
          b.coordinates
        );
        const roadMeters = Math.round(straight * 1.28);
        fallbackMatrix[b.id] = {
          distanceMeters: roadMeters,
          durationSeconds: Math.max(3, Math.round(roadMeters / speedMps)),
        };
      }
      if (!cancelled) {
        onRouteMatrixComputed(fallbackMatrix);
      }
    };

    if (
      routeMatrixRpcUnsupportedOnKey ||
      !RouteMatrixClass ||
      typeof RouteMatrixClass.computeRouteMatrix !== 'function'
    ) {
      buildEstimatedMatrix();
      return;
    }

    const matrixRequest = {
      origins: [originPt],
      destinations: bins.map((b) => b.coordinates),
      travelMode,
      fields: ['distanceMeters', 'durationMillis', 'condition'],
    };

    RouteMatrixClass.computeRouteMatrix(matrixRequest)
      .then((res: any) => {
        if (cancelled) return;
        const rows = res?.matrix?.rows || res?.rows;
        if (!Array.isArray(rows) || !rows[0]?.items) {
          buildEstimatedMatrix();
          return;
        }
        const items = rows[0].items;
        const computed: Record<
          string,
          { distanceMeters: number; durationSeconds: number }
        > = {};
        bins.forEach((b, idx) => {
          const item = items[idx];
          const dist = item?.distanceMeters;
          const durMs = item?.durationMillis;
          if (typeof dist === 'number') {
            computed[b.id] = {
              distanceMeters: dist,
              durationSeconds:
                typeof durMs === 'number'
                  ? Math.round(durMs / 1000)
                  : Math.round(dist / (travelMode === 'WALKING' ? 1.35 : 7.5)),
            };
          } else {
            const straight = calculateHaversineDistanceMeters(
              originPt,
              b.coordinates
            );
            const road = Math.round(straight * 1.28);
            computed[b.id] = {
              distanceMeters: road,
              durationSeconds: Math.round(
                road / (travelMode === 'WALKING' ? 1.35 : 7.5)
              ),
            };
          }
        });
        onRouteMatrixComputed(computed);
      })
      .catch((err: any) => {
        const msg = String(err?.message || err || '');
        if (
          msg.includes('429') ||
          msg.includes('RESOURCE_EXHAUSTED') ||
          msg.includes('OVER_QUERY_LIMIT')
        ) {
          window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
        } else {
          routeMatrixRpcUnsupportedOnKey = true;
        }
        buildEstimatedMatrix();
      });

    return () => {
      cancelled = true;
    };
  }, [
    routesLib,
    worker.position.lat,
    worker.position.lng,
    travelMode,
    onRouteMatrixComputed,
  ]);

  return null;
};

/**
 * Monitors API loading status inside APIProvider and falls back gracefully if offline/unauthenticated.
 */
const MapViewportContent: React.FC<FieldGoogleMapProps> = (props) => {
  const status = useApiLoadingStatus();
  const {
    bins,
    activeBin,
    worker,
    travelMode,
    isDemoMode,
    isWithin15m,
    onSelectBin,
    onMoveWorker,
    onRouteComputed,
    onRouteMatrixComputed,
  } = props;

  if (
    status === APILoadingStatus.FAILED ||
    status === APILoadingStatus.AUTH_FAILURE
  ) {
    return <TacticalFallbackMap {...props} />;
  }

  const handleMapClick = (e: MapMouseEvent) => {
    if (!isDemoMode) return;
    const latLng = e.detail?.latLng;
    if (latLng && typeof latLng.lat === 'number' && typeof latLng.lng === 'number') {
      onMoveWorker({ lat: latLng.lat, lng: latLng.lng });
    }
  };

  return (
    <div className="relative w-full h-full">
      <GoogleMap
        defaultCenter={activeBin.coordinates}
        defaultZoom={17}
        mapId="DEMO_MAP_ID"
        gestureHandling="greedy"
        disableDefaultUI={false}
        streetViewControl={false}
        mapTypeControl={false}
        fullscreenControl={false}
        onClick={handleMapClick}
        internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
        className="w-full h-full"
      >
        <MapGeofenceAndRouteController
          bins={bins}
          activeBin={activeBin}
          worker={worker}
          travelMode={travelMode}
          isWithin15m={isWithin15m}
          onRouteComputed={onRouteComputed}
          onRouteMatrixComputed={onRouteMatrixComputed}
        />

        {/* Render 8 Fictional Demo Bin Assets */}
        {bins.map((bin) => {
          const isSelected = bin.id === activeBin.id;
          const isVerified = bin.status === 'Verified cleared';
          const isReview = bin.status === 'Awaiting review';
          const bgClass = isVerified
            ? 'bg-emerald-700 border-white text-white'
            : isReview
              ? 'bg-amber-600 border-white text-white'
              : isSelected
                ? 'bg-[#065F46] border-amber-300 text-white ring-4 ring-emerald-500/40'
                : 'bg-slate-800 border-white text-white';

          return (
            <AdvancedMarker
              key={bin.id}
              position={bin.coordinates}
              onClick={() => onSelectBin(bin.id)}
              title={`${bin.id} — ${bin.label} (${bin.status})`}
            >
              <button
                type="button"
                onClick={(ev) => {
                  ev.stopPropagation();
                  onSelectBin(bin.id);
                }}
                aria-label={`Select bin ${bin.id}`}
                className={`px-2 py-1 rounded-md border-2 shadow-md font-mono text-[11px] font-bold transition-transform ${
                  isSelected ? 'scale-110' : 'hover:scale-105'
                } ${bgClass}`}
              >
                {bin.id.replace('DEMO-LHR-UC42-', '#')}
              </button>
            </AdvancedMarker>
          );
        })}

        {/* Render Field Worker Marker */}
        <AdvancedMarker
          position={worker.position}
          title={`Field Worker ${worker.workerId} (±${Math.round(worker.accuracyMeters)}m)`}
        >
          <div className="flex flex-col items-center">
            <div className="px-2 py-0.5 rounded bg-blue-700 text-white font-mono text-[10px] font-bold shadow border border-white whitespace-nowrap">
              {worker.workerId} (±{Math.round(worker.accuracyMeters)}m)
            </div>
            <div className="w-4 h-4 rounded-full bg-blue-600 border-2 border-white shadow-md -mt-0.5" />
          </div>
        </AdvancedMarker>
      </GoogleMap>
    </div>
  );
};

/**
 * Interactive Tactical Vector Map Fallback (used when browser API key is not configured or in offline sandbox).
 * Supports clicking anywhere on the map in Desk Simulator mode, selecting any of the 8 bins, and visualizing
 * the 15m target geofence circle (amber outside / emerald inside), worker accuracy halo, and route polyline.
 */
const TacticalFallbackMap: React.FC<FieldGoogleMapProps> = ({
  bins,
  activeBin,
  worker,
  travelMode,
  isDemoMode,
  isWithin15m,
  onSelectBin,
  onMoveWorker,
  onRouteComputed,
  onRouteMatrixComputed,
}) => {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [zoomScale, setZoomScale] = useState<'SECTOR' | 'PROXIMITY_15M'>('PROXIMITY_15M');

  // Compute deterministic fallback route & route matrix whenever worker or activeBin changes
  useEffect(() => {
    const straight = calculateHaversineDistanceMeters(
      worker.position,
      activeBin.coordinates
    );
    const roadEst = Math.round(straight * 1.28);
    const speedMps = travelMode === 'WALKING' ? 1.35 : 7.5;
    onRouteComputed({
      binId: activeBin.id,
      travelMode,
      roadDistanceMeters: roadEst,
      durationSeconds: Math.max(4, Math.round(roadEst / speedMps)),
      isFallbackEstimate: true,
      computedAtMs: Date.now(),
    });

    const matrix: Record<
      string,
      { distanceMeters: number; durationSeconds: number }
    > = {};
    for (const b of bins) {
      const st = calculateHaversineDistanceMeters(worker.position, b.coordinates);
      const rd = Math.round(st * 1.28);
      matrix[b.id] = {
        distanceMeters: rd,
        durationSeconds: Math.max(4, Math.round(rd / speedMps)),
      };
    }
    onRouteMatrixComputed(matrix);
  }, [
    worker.position,
    activeBin.id,
    activeBin.coordinates,
    bins,
    travelMode,
    onRouteComputed,
    onRouteMatrixComputed,
  ]);

  // Project lat/lng around activeBin into SVG 800x440 coordinates
  const spanDeg = zoomScale === 'PROXIMITY_15M' ? 0.0012 : 0.062;
  const centerLat = activeBin.coordinates.lat;
  const centerLng = activeBin.coordinates.lng;

  const projectPoint = (pt: LatLngPoint) => {
    const x = 400 + ((pt.lng - centerLng) / spanDeg) * 620;
    const y = 220 - ((pt.lat - centerLat) / spanDeg) * 620;
    return { x, y };
  };

  const unprojectPoint = (x: number, y: number): LatLngPoint => {
    const lng = centerLng + ((x - 400) / 620) * spanDeg;
    const lat = centerLat - ((y - 220) / 620) * spanDeg;
    return { lat, lng };
  };

  const handleSvgClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!isDemoMode || !svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const scaleX = 800 / rect.width;
    const scaleY = 440 / rect.height;
    const clickX = (e.clientX - rect.left) * scaleX;
    const clickY = (e.clientY - rect.top) * scaleY;
    const newCoords = unprojectPoint(clickX, clickY);
    onMoveWorker(newCoords);
  };

  const activeProjected = projectPoint(activeBin.coordinates);
  const workerProjected = projectPoint(worker.position);

  // Convert meters to pixels at current zoom
  const metersPerDegLat = 111320;
  const pixelsPerMeter = 620 / (spanDeg * metersPerDegLat);
  const geofenceRadiusPx = Math.max(
    14,
    Math.min(140, GEOFENCE_MAX_DISTANCE_METERS * pixelsPerMeter)
  );
  const accuracyRadiusPx = Math.max(
    8,
    Math.min(180, worker.accuracyMeters * pixelsPerMeter)
  );

  return (
    <div className="relative w-full h-full bg-slate-900 overflow-hidden select-none">
      <svg
        ref={svgRef}
        viewBox="0 0 800 440"
        onClick={handleSvgClick}
        data-testid="interactive-geofence-map-surface"
        className={`w-full h-full block ${
          isDemoMode ? 'cursor-crosshair' : 'cursor-default'
        }`}
      >
        <defs>
          <pattern
            id="lahore-grid"
            width="40"
            height="40"
            patternUnits="userSpaceOnUse"
          >
            <path
              d="M 40 0 L 0 0 0 40"
              fill="none"
              stroke="rgba(148, 163, 184, 0.14)"
              strokeWidth="1"
            />
          </pattern>
        </defs>
        <rect width="800" height="440" fill="#0f172a" />
        <rect width="800" height="440" fill="url(#lahore-grid)" />

        {/* Stylized Lahore Arterial Corridors (Mall Road / Canal / Main Blvd Gulberg) */}
        <path
          d="M 40 360 Q 280 240 400 220 T 760 90"
          fill="none"
          stroke="rgba(51, 65, 85, 0.85)"
          strokeWidth="22"
          strokeLinecap="round"
        />
        <path
          d="M 120 40 Q 380 190 400 220 T 690 400"
          fill="none"
          stroke="rgba(30, 41, 59, 0.9)"
          strokeWidth="16"
          strokeLinecap="round"
        />

        {/* Route Polyline between Worker and Active Target Bin */}
        <line
          x1={workerProjected.x}
          y1={workerProjected.y}
          x2={activeProjected.x}
          y2={activeProjected.y}
          stroke="#10b981"
          strokeWidth="3.5"
          strokeDasharray="8 5"
        />

        {/* 15m Target Geofence Circle (Amber outside / Emerald inside) */}
        <circle
          cx={activeProjected.x}
          cy={activeProjected.y}
          r={geofenceRadiusPx}
          fill={
            isWithin15m
              ? 'rgba(16, 185, 129, 0.24)'
              : 'rgba(245, 158, 11, 0.18)'
          }
          stroke={isWithin15m ? '#10b981' : '#f59e0b'}
          strokeWidth="2.5"
        />

        {/* Worker GPS Accuracy Halo */}
        <circle
          cx={workerProjected.x}
          cy={workerProjected.y}
          r={accuracyRadiusPx}
          fill={
            worker.accuracyMeters > 25
              ? 'rgba(245, 158, 11, 0.18)'
              : 'rgba(59, 130, 246, 0.18)'
          }
          stroke={worker.accuracyMeters > 25 ? '#f59e0b' : '#3b82f6'}
          strokeWidth="1.5"
          strokeDasharray="4 3"
        />

        {/* All 8 Fictional Lahore Demo Bins */}
        {bins.map((bin) => {
          const pos = projectPoint(bin.coordinates);
          if (pos.x < -40 || pos.x > 840 || pos.y < -40 || pos.y > 480) {
            return null;
          }
          const isSelected = bin.id === activeBin.id;
          const fill =
            bin.status === 'Verified cleared'
              ? '#059669'
              : bin.status === 'Awaiting review'
                ? '#d97706'
                : isSelected
                  ? '#10b981'
                  : '#475569';

          return (
            <g
              key={bin.id}
              transform={`translate(${pos.x}, ${pos.y})`}
              onClick={(ev) => {
                ev.stopPropagation();
                onSelectBin(bin.id);
              }}
              className="cursor-pointer"
            >
              <circle
                r={isSelected ? 12 : 8}
                fill={fill}
                stroke="#ffffff"
                strokeWidth={isSelected ? 3 : 2}
              />
              <rect
                x="-34"
                y="-30"
                width="68"
                height="16"
                rx="4"
                fill="#022c22"
                stroke={isSelected ? '#34d399' : '#475569'}
                strokeWidth="1"
              />
              <text
                y="-19"
                textAnchor="middle"
                fill="#ffffff"
                fontSize="9.5"
                fontFamily="IBM Plex Mono, monospace"
                fontWeight="bold"
              >
                {bin.id.replace('DEMO-LHR-UC42-', 'BIN-')}
              </text>
            </g>
          );
        })}

        {/* Worker Marker Pin */}
        <g transform={`translate(${workerProjected.x}, ${workerProjected.y})`}>
          <circle r="9" fill="#2563eb" stroke="#ffffff" strokeWidth="2.5" />
          <rect
            x="-56"
            y="13"
            width="112"
            height="18"
            rx="4"
            fill="#1e3a8a"
            stroke="#93c5fd"
            strokeWidth="1"
          />
          <text
            y="25"
            textAnchor="middle"
            fill="#ffffff"
            fontSize="9.5"
            fontFamily="IBM Plex Mono, monospace"
            fontWeight="bold"
          >
            {worker.workerId} (±{Math.round(worker.accuracyMeters)}m)
          </text>
        </g>
      </svg>

      {/* Zoom Scale Toggle */}
      <div className="absolute bottom-3 right-3 flex items-center gap-1.5 bg-slate-900/90 border border-slate-700 rounded-lg p-1">
        <button
          type="button"
          onClick={() => setZoomScale('PROXIMITY_15M')}
          className={`px-2.5 py-1 rounded text-[11px] font-mono font-semibold transition-colors ${
            zoomScale === 'PROXIMITY_15M'
              ? 'bg-[#065F46] text-white'
              : 'text-slate-300 hover:text-white'
          }`}
        >
          15m Geofence Zoom
        </button>
        <button
          type="button"
          onClick={() => setZoomScale('SECTOR')}
          className={`px-2.5 py-1 rounded text-[11px] font-mono font-semibold transition-colors ${
            zoomScale === 'SECTOR'
              ? 'bg-[#065F46] text-white'
              : 'text-slate-300 hover:text-white'
          }`}
        >
          Lahore Sector Overview
        </button>
      </div>
    </div>
  );
};

export const FieldGoogleMap: React.FC<FieldGoogleMapProps> = (props) => {
  const {
    apiKey,
    activeBin,
    worker,
    isDemoMode,
    isWithin15m,
    onMoveWorker,
  } = props;

  const distanceMeters = calculateHaversineDistanceMeters(
    worker.position,
    activeBin.coordinates
  );

  // Simulate Worker Arrival directly inside the 15m geofence (~4.2m from target pin)
  const handleSimulateArrival = () => {
    onMoveWorker({
      lat: activeBin.coordinates.lat + 0.000032,
      lng: activeBin.coordinates.lng + 0.000018,
    });
  };

  // Step worker 38m away from target bin to test locked state
  const handleSimulateStepOutside = () => {
    onMoveWorker({
      lat: activeBin.coordinates.lat + 0.00031,
      lng: activeBin.coordinates.lng - 0.00019,
    });
  };

  return (
    <div className="relative w-full h-[360px] sm:h-[430px] lg:h-[480px] rounded-xl overflow-hidden border border-slate-200 bg-slate-900 shadow-xs">
      {apiKey ? (
        <APIProvider apiKey={apiKey} libraries={['routes']}>
          <MapViewportContent {...props} />
        </APIProvider>
      ) : (
        <TacticalFallbackMap {...props} />
      )}

      {/* Top-Left Geofence Ring Legend & Status Overlay */}
      <div className="absolute top-3 left-3 z-10 max-w-xs sm:max-w-sm rounded-lg bg-slate-950/90 backdrop-blur-xs border border-slate-800 px-3 py-2 text-xs text-slate-100 space-y-1">
        <div className="flex items-center gap-2 font-mono font-semibold">
          <Compass className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          <span>TARGET PIN: {activeBin.id}</span>
          <span aria-hidden="true">·</span>
          <span
            className={
              isWithin15m ? 'text-emerald-400 font-bold' : 'text-amber-400 font-bold'
            }
          >
            {distanceMeters.toFixed(1)}m {isWithin15m ? '(INSIDE 15m)' : '(OUTSIDE 15m)'}
          </span>
        </div>
        <div className="text-[11px] text-slate-300">
          {isDemoMode
            ? 'Desk Simulator Active: Click anywhere on the map or use quick-teleport controls below to position worker.'
            : 'Live Device GPS Active: Watching device coordinates via navigator.geolocation.watchPosition.'}
        </div>
      </div>

      {/* Bottom-Left Desk Simulator Quick Arrival Controls */}
      {isDemoMode && (
        <div className="absolute bottom-3 left-3 z-10 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleSimulateArrival}
            className="min-h-[44px] px-3.5 py-2 rounded-lg bg-[#065F46] hover:bg-emerald-700 text-white text-xs font-semibold shadow-md border border-emerald-400/40 inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
          >
            <LocateFixed className="w-4 h-4 shrink-0" />
            Simulate Worker Arrival at Target Bin
          </button>
          <button
            type="button"
            onClick={handleSimulateStepOutside}
            className="min-h-[44px] px-3 py-2 rounded-lg bg-slate-900/90 hover:bg-slate-800 text-slate-200 text-xs font-medium border border-slate-700 inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
          >
            <Navigation className="w-3.5 h-3.5 shrink-0" />
            Move Worker 38m Away
          </button>
        </div>
      )}

      {/* Top-Right Route Polyline Legend */}
      <div className="hidden sm:flex absolute top-3 right-3 z-10 items-center gap-2 rounded-lg bg-slate-950/85 border border-slate-800 px-3 py-1.5 text-[11px] font-mono text-slate-200">
        <RouteIcon className="w-3.5 h-3.5 text-emerald-400" />
        <span>
          15m Geofence: {isWithin15m ? 'Emerald (Inside)' : 'Amber (Outside)'}
        </span>
      </div>
    </div>
  );
};
