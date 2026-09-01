"use client";

import { Circle, CircleMarker, MapContainer, Polyline, TileLayer, Tooltip } from "react-leaflet";
import type { AssetMapProps } from "@/types/asset";
import { COLOR, SERIES, formatDateTime } from "@/lib/design-system";
import "leaflet/dist/leaflet.css";

/**
 * Section 4: the GPS breadcrumb.
 *
 * Leaflet's default marker pulls three PNGs by relative URL and 404s under a
 * bundler — the usual fix is an `L.Icon.Default.mergeOptions` shim pointing at
 * a CDN. We sidestep the whole problem instead: `CircleMarker` is drawn in SVG,
 * needs no image at all, and takes the design system's colours directly.
 */
export function AssetMapInner({
  breadcrumb,
  geofence,
  currentPosition,
  height = "400px",
}: AssetMapProps) {
  const center = currentPosition ?? breadcrumb.at(-1) ?? geofence ?? { lat: 0, lng: 0 };
  const path: [number, number][] = breadcrumb.map((p) => [p.lat, p.lng]);

  return (
    <section className="overflow-hidden rounded-plate border border-line bg-plate shadow-plate">
      <header className="flex items-center justify-between gap-3 border-b border-line/60 px-4 py-2.5">
        <h3 className="stamp text-stamp text-steel">GPS track</h3>
        <span className="font-mono text-data-xs text-mute">{breadcrumb.length} fixes</span>
      </header>

      <div style={{ height }}>
        <MapContainer
          center={[center.lat, center.lng]}
          zoom={15}
          style={{ height: "100%", width: "100%", background: COLOR.dust }}
          scrollWheelZoom
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          {geofence ? (
            <Circle
              center={[geofence.lat, geofence.lng]}
              radius={geofence.radiusMeters}
              pathOptions={{
                color: SERIES.primary,
                fillColor: SERIES.primary,
                fillOpacity: 0.08,
                weight: 2,
                dashArray: "6 4",
              }}
            >
              <Tooltip direction="top">
                {geofence.label ?? "Site geofence"} · {geofence.radiusMeters} m
              </Tooltip>
            </Circle>
          ) : null}

          {path.length > 1 ? (
            <Polyline
              positions={path}
              pathOptions={{ color: SERIES.primary, weight: 3, opacity: 0.75 }}
            />
          ) : null}

          {currentPosition ? (
            /* hi-vis is the accent for "the thing you care about right now" */
            <CircleMarker
              center={[currentPosition.lat, currentPosition.lng]}
              radius={7}
              pathOptions={{
                color: COLOR.plate,
                weight: 3,
                fillColor: COLOR.hivis,
                fillOpacity: 1,
              }}
            >
              <Tooltip direction="top">
                Current position
                {currentPosition.ts ? ` · ${formatDateTime(currentPosition.ts)} UTC` : ""}
              </Tooltip>
            </CircleMarker>
          ) : null}
        </MapContainer>
      </div>
    </section>
  );
}
