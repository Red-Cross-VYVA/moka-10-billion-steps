"use client";
import { useEffect, useRef, useState } from "react";
import type { Map as LibreMap, GeoJSONSource } from "maplibre-gl";
import { type Bounds, type GisSite, validLocation } from "./data";

export const tones: Record<string, string> = {
  unassigned: "#8795a6",
  assigned: "#2879d0",
  in_progress: "#7955ba",
  under_review: "#d39424",
  verified: "#16876b",
  revisit_required: "#dc692b",
  flagged_exception: "#cf4256",
  closed_cancelled: "#465464",
};
export type Layer = "status" | "density" | "photos";
function geojson(sites: GisSite[]): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: sites.filter(validLocation).map((s) => ({
      type: "Feature",
      id: s.site_id,
      properties: {
        id: s.site_id,
        color: tones[s.status] ?? "#8795a6",
        photos: s.photo_count,
      },
      geometry: { type: "Point", coordinates: [s.longitude!, s.latitude!] },
    })),
  };
}
export default function GisMap({
  sites,
  selectedId,
  layer,
  fitVersion,
  onSelect,
  onBounds,
  arabic,
  initialBounds,
}: {
  sites: GisSite[];
  selectedId: string;
  layer: Layer;
  fitVersion: number;
  onSelect: (id: string) => void;
  onBounds: (bounds: Bounds) => void;
  arabic: boolean;
  initialBounds?: Bounds;
}) {
  const host = useRef<HTMLDivElement>(null);
  const instance = useRef<LibreMap | null>(null);
  const latest = useRef({ sites, onSelect, onBounds });
  const [ready, setReady] = useState(false);
  const [failure, setFailure] = useState(false);
  const [retry, setRetry] = useState(0);
  const restoredBounds = useRef(initialBounds);
  useEffect(() => {
    latest.current = { sites, onSelect, onBounds };
  }, [sites, onSelect, onBounds]);
  useEffect(() => {
    let disposed = false;
    let observer: ResizeObserver | undefined;
    setReady(false);
    setFailure(false);
    import("maplibre-gl")
      .then((lib) => {
        if (disposed || !host.current) return;
        lib.setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");
        const map = new lib.Map({
          container: host.current,
          style:
            process.env.NEXT_PUBLIC_MAP_STYLE_URL ||
            "https://tiles.openfreemap.org/styles/positron",
          center: [44.1, 23.8],
          zoom: 4.35,
          attributionControl: { compact: true },
        });
        instance.current = map;
        map.addControl(
          new lib.NavigationControl({ showCompass: false }),
          "top-right",
        );
        map.addControl(new lib.FullscreenControl(), "top-right");
        const bounds = () => {
          const b = map.getBounds();
          latest.current.onBounds([
            b.getWest(),
            b.getSouth(),
            b.getEast(),
            b.getNorth(),
          ]);
        };
        map.on("moveend", bounds);
        map.on("error", () => setFailure(true));
        map.on("load", () => {
          if (disposed) return;
          map.addSource("gis-sites", {
            type: "geojson",
            data: geojson(latest.current.sites),
            cluster: true,
            clusterMaxZoom: 11,
            clusterRadius: 45,
            clusterProperties: {
              covered: ["+", ["case", [">", ["get", "photos"], 0], 1, 0]],
            },
          });
          map.addLayer({
            id: "gis-density",
            type: "heatmap",
            source: "gis-sites",
            maxzoom: 15,
            layout: { visibility: "none" },
            paint: {
              "heatmap-weight": [
                "case",
                ["has", "point_count"],
                ["get", "point_count"],
                1,
              ],
              "heatmap-radius": 32,
              "heatmap-intensity": 1.2,
              "heatmap-opacity": 0.65,
            },
          });
          map.addLayer({
            id: "gis-clusters",
            type: "circle",
            source: "gis-sites",
            filter: ["has", "point_count"],
            paint: {
              "circle-color": "#173f60",
              "circle-radius": [
                "step",
                ["get", "point_count"],
                19,
                100,
                25,
                1000,
                32,
              ],
              "circle-stroke-color": "#ffffff",
              "circle-stroke-width": 3,
            },
          });
          map.addLayer({
            id: "gis-count",
            type: "symbol",
            source: "gis-sites",
            filter: ["has", "point_count"],
            layout: {
              "text-field": ["get", "point_count_abbreviated"],
              "text-size": 12,
            },
            paint: { "text-color": "#ffffff" },
          });
          map.addLayer({
            id: "gis-points",
            type: "circle",
            source: "gis-sites",
            filter: ["!", ["has", "point_count"]],
            paint: {
              "circle-color": ["get", "color"],
              "circle-radius": 7,
              "circle-stroke-color": "#ffffff",
              "circle-stroke-width": 2,
            },
          });
          map.addLayer({
            id: "gis-selection",
            type: "circle",
            source: "gis-sites",
            filter: ["==", ["get", "id"], ""],
            paint: {
              "circle-color": "transparent",
              "circle-radius": 13,
              "circle-stroke-color": "#152e49",
              "circle-stroke-width": 3,
            },
          });
          map.on("click", "gis-points", (e) => {
            const id = e.features?.[0]?.properties?.id;
            if (id) latest.current.onSelect(String(id));
          });
          map.on("click", "gis-clusters", async (e) => {
            const f = e.features?.[0];
            if (!f) return;
            try {
              const zoom = await (
                map.getSource("gis-sites") as GeoJSONSource
              ).getClusterExpansionZoom(Number(f.properties?.cluster_id));
              if (!disposed)
                map.easeTo({
                  center: (f.geometry as GeoJSON.Point).coordinates as [
                    number,
                    number,
                  ],
                  zoom,
                });
            } catch {
              setFailure(true);
            }
          });
          for (const id of ["gis-clusters", "gis-points"]) {
            map.on("mouseenter", id, () => {
              map.getCanvas().style.cursor = "pointer";
            });
            map.on("mouseleave", id, () => {
              map.getCanvas().style.cursor = "";
            });
          }
          if (restoredBounds.current) {
            const [w, s, e, n] = restoredBounds.current;
            map.fitBounds(
              [
                [w, s],
                [e < w ? e + 360 : e, n],
              ],
              { padding: 0, duration: 0 },
            );
          }
          setReady(true);
          bounds();
        });
        observer = new ResizeObserver(() => map.resize());
        observer.observe(host.current);
      })
      .catch(() => {
        if (!disposed) setFailure(true);
      });
    return () => {
      disposed = true;
      observer?.disconnect();
      instance.current?.remove();
      instance.current = null;
    };
  }, [retry]);
  useEffect(() => {
    if (ready)
      (instance.current?.getSource("gis-sites") as GeoJSONSource)?.setData(
        geojson(sites),
      );
  }, [sites, ready]);
  useEffect(() => {
    const map = instance.current;
    if (!ready || !map) return;
    map.setLayoutProperty(
      "gis-density",
      "visibility",
      layer === "density" ? "visible" : "none",
    );
    map.setPaintProperty(
      "gis-clusters",
      "circle-color",
      layer === "photos"
        ? [
            "interpolate",
            ["linear"],
            ["/", ["get", "covered"], ["get", "point_count"]],
            0,
            "#b7c3d1",
            1,
            "#16876b",
          ]
        : "#173f60",
    );
    map.setPaintProperty(
      "gis-points",
      "circle-color",
      layer === "photos"
        ? ["case", [">", ["get", "photos"], 0], "#16876b", "#b7c3d1"]
        : ["get", "color"],
    );
  }, [layer, ready]);
  useEffect(() => {
    const map = instance.current;
    if (!map || !ready) return;
    map.setFilter("gis-selection", ["==", ["get", "id"], selectedId]);
    const site = latest.current.sites.find((s) => s.site_id === selectedId);
    if (site && validLocation(site))
      map.easeTo({
        center: [site.longitude!, site.latitude!],
        zoom: Math.max(map.getZoom(), 12),
        duration: 650,
      });
  }, [selectedId, ready]);
  useEffect(() => {
    const map = instance.current;
    if (!map || !ready) return;
    if (fitVersion === 0 && (restoredBounds.current || selectedId)) return;
    const points = latest.current.sites.filter(validLocation);
    if (!points.length) return;
    map.fitBounds(
      [
        [
          Math.min(...points.map((s) => s.longitude!)),
          Math.min(...points.map((s) => s.latitude!)),
        ],
        [
          Math.max(...points.map((s) => s.longitude!)),
          Math.max(...points.map((s) => s.latitude!)),
        ],
      ],
      { padding: 55, maxZoom: 13, duration: 600 },
    );
  }, [fitVersion, ready]);
  return (
    <div className="gis-mapstage">
      <div
        ref={host}
        className="gis-mapcanvas"
        aria-label={arabic ? "خريطة المواقع التفاعلية" : "Interactive site map"}
      />
      {!ready && !failure && (
        <div className="gis-mapnotice" role="status">
          {arabic ? "جارٍ تحميل الخريطة…" : "Loading map…"}
        </div>
      )}
      {failure && (
        <div className="gis-mapnotice" role="status">
          {arabic
            ? "تعذر تحميل بعض عناصر الخريطة. قائمة المواقع متاحة."
            : "Some map tiles could not load. The site list is still available."}
          <button onClick={() => setRetry((v) => v + 1)}>
            {arabic ? "إعادة المحاولة" : "Retry map"}
          </button>
        </div>
      )}
    </div>
  );
}
