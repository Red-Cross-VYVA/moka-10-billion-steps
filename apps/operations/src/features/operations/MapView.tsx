"use client";
import { useEffect, useRef } from "react";
import type { Site } from "@/domain/model";

const colors: Record<string,string> = { Unassigned:"#98a2b3", Assigned:"#2563eb", "In Progress":"#7c3aed", "Under Review":"#d97706", Verified:"#059669", "Revisit Required":"#e85d2a", "Flagged / Exception":"#dc2626", "Closed / Cancelled":"#344054" };

export function MapView({ sites, onSelect }: { sites: Site[]; onSelect: (s: Site) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    let disposed = false; let map: import("maplibre-gl").Map | undefined;
    import("maplibre-gl").then((maplibregl) => {
      if (disposed || !ref.current) return;
      const instance = new maplibregl.Map({ container: ref.current, style: process.env.NEXT_PUBLIC_MAP_STYLE_URL || "https://tiles.openfreemap.org/styles/positron", center: [44.1, 23.8], zoom: 4.35, attributionControl: false });
      map = instance;
      instance.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
      instance.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-right");
      instance.on("load", () => {
        instance.addSource("sites", { type: "geojson", cluster: true, clusterMaxZoom: 11, clusterRadius: 44, data: { type: "FeatureCollection", features: sites.map(s => ({ type:"Feature", properties:{ id:s.id, status:s.status, color:colors[s.status] }, geometry:{ type:"Point", coordinates:[s.lng,s.lat] } })) } });
        instance.addLayer({ id:"clusters", type:"circle", source:"sites", filter:["has","point_count"], paint:{ "circle-color":"#123f63", "circle-radius":["step",["get","point_count"],18,100,23,1000,30], "circle-stroke-color":"#fff", "circle-stroke-width":3 } });
        instance.addLayer({ id:"cluster-count", type:"symbol", source:"sites", filter:["has","point_count"], layout:{ "text-field":["get","point_count_abbreviated"], "text-size":12 }, paint:{ "text-color":"#fff" } });
        instance.addLayer({ id:"points", type:"circle", source:"sites", filter:["!",["has","point_count"]], paint:{ "circle-color":["get","color"], "circle-radius":7, "circle-stroke-color":"#fff", "circle-stroke-width":2 } });
        instance.on("click","clusters", async e => {
          const feature = instance.queryRenderedFeatures(e.point,{layers:["clusters"]})[0];
          const id = feature?.properties?.cluster_id;
          if (!feature || id == null) return;
          const source = instance.getSource("sites") as import("maplibre-gl").GeoJSONSource;
          source.getClusterExpansionZoom(id).then(z=>instance.easeTo({center:(feature.geometry as GeoJSON.Point).coordinates as [number,number],zoom:z}));
        });
        instance.on("click","points", e => { const id=e.features?.[0]?.properties?.id; const found=sites.find(s=>s.id===id); if(found) onSelect(found); });
        ["clusters","points"].forEach(layer => { instance.on("mouseenter",layer,()=>{ instance.getCanvas().style.cursor="pointer" }); instance.on("mouseleave",layer,()=>{ instance.getCanvas().style.cursor="" }); });
      });
    });
    return () => { disposed=true; map?.remove(); };
  }, [sites, onSelect]);
  return <div ref={ref} className="map-canvas" aria-label="Interactive site map" />;
}
