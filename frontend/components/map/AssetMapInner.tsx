"use client";

import { useEffect } from "react";
import { Circle, MapContainer, Marker, Polyline, TileLayer, Tooltip } from "react-leaflet";
import L from "leaflet";
import type { AssetMapProps } from "@/types/asset";
import "leaflet/dist/leaflet.css";

const markerIcon = L.icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

export function AssetMapInner({
  breadcrumb,
  geofence,
  currentPosition,
  height = "400px",
}: AssetMapProps) {
  useEffect(() => {
    L.Icon.Default.mergeOptions({
      iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
      iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
      shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
    });
  }, []);

  const center =
    currentPosition ?? breadcrumb[breadcrumb.length - 1] ?? geofence ?? { lat: 0, lng: 0 };
  const path: [number, number][] = breadcrumb.map((p) => [p.lat, p.lng]);

  return (
    <div className="overflow-hidden rounded-plate border border-line bg-plate">
      <div className="border-b border-line px-4 py-3">
        <h3 className="stamp text-[11px] text-ink">GPS Track</h3>
        {geofence?.label && <p className="mt-0.5 text-[12px] text-mute">{geofence.label}</p>}
      </div>
      <div style={{ height }}>
        <MapContainer
          center={[center.lat, center.lng]}
          zoom={15}
          style={{ height: "100%", width: "100%" }}
          scrollWheelZoom
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {geofence && (
            <Circle
              center={[geofence.lat, geofence.lng]}
              radius={geofence.radiusMeters}
              pathOptions={{ color: "#2b5f8a", fillColor: "#2b5f8a", fillOpacity: 0.1, weight: 2 }}
            >
              <Tooltip permanent direction="center">
                <span className="stamp text-[10px] text-busy">{geofence.label ?? "Site"}</span>
              </Tooltip>
            </Circle>
          )}
          {path.length > 1 && (
            <Polyline positions={path} pathOptions={{ color: "#ff6b1a", weight: 4, opacity: 0.85 }} />
          )}
          {currentPosition && (
            <Marker position={[currentPosition.lat, currentPosition.lng]} icon={markerIcon}>
              <Tooltip>Current position</Tooltip>
            </Marker>
          )}
        </MapContainer>
      </div>
    </div>
  );
}
