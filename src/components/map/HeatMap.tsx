import { useEffect, useRef } from "react";
import type { Issue } from "../../types";

interface Props {
  issues: Issue[];
}

function createHeatmapOverlay(
  google: any,
  map: any,
  points: { lat: number; lng: number; weight: number }[]
) {
  // Pre-compute centre lat for metres-per-pixel calculation
  const centerLat = points.length
    ? points.reduce((s, p) => s + p.lat, 0) / points.length
    : 22.7196;

  class HeatOverlay extends google.maps.OverlayView {
    private canvas: HTMLCanvasElement | null = null;

    onAdd() {
      const c = document.createElement("canvas");
      c.style.cssText = "position:absolute;top:0;left:0;pointer-events:none";
      this.canvas = c;
      this.getPanes().overlayLayer.appendChild(c);
    }

    draw() {
      if (!this.canvas) return;
      const proj   = this.getProjection();
      const bounds = (this.getMap() as any).getBounds();
      if (!bounds || !proj) return;

      const ne = proj.fromLatLngToDivPixel(bounds.getNorthEast());
      const sw = proj.fromLatLngToDivPixel(bounds.getSouthWest());
      if (!ne || !sw) return;

      const left = Math.min(sw.x, ne.x);
      const top  = Math.min(sw.y, ne.y);
      const W    = Math.ceil(Math.abs(ne.x - sw.x));
      const H    = Math.ceil(Math.abs(sw.y - ne.y));

      this.canvas.style.left = left + "px";
      this.canvas.style.top  = top  + "px";
      this.canvas.width  = W;
      this.canvas.height = H;

      const ctx = this.canvas.getContext("2d")!;
      ctx.clearRect(0, 0, W, H);

      // ── Step 1: accumulate intensity on scratch canvas (additive blend) ──
      const ac = document.createElement("canvas");
      ac.width  = W;
      ac.height = H;
      const actx = ac.getContext("2d")!;
      actx.globalCompositeOperation = "lighter";

      // Radius = fixed 40 real-world metres → pixels at current zoom
      // Capped 15–70px so it never explodes or disappears
      const zoom        = (this.getMap() as any).getZoom() ?? 13;
      const metersPerPx = 156543.03392 * Math.cos(centerLat * Math.PI / 180) / Math.pow(2, zoom);
      const radius      = Math.min(Math.max(15, 40 / metersPerPx), 70);

      points.forEach(({ lat, lng, weight }) => {
        const pt = proj.fromLatLngToDivPixel(new google.maps.LatLng(lat, lng));
        if (!pt) return;
        const x = pt.x - left;
        const y = pt.y - top;
        if (x < -radius || x > W + radius || y < -radius || y > H + radius) return;

        const intensity = Math.min(weight / 10, 1);

        // Smooth gaussian-like falloff — soft at edges, never fully opaque
        const grad = actx.createRadialGradient(x, y, 0, x, y, radius);
        grad.addColorStop(0,    `rgba(255,255,255,${0.12 + intensity * 0.20})`);
        grad.addColorStop(0.4,  `rgba(255,255,255,${0.06 + intensity * 0.10})`);
        grad.addColorStop(0.75, `rgba(255,255,255,${0.01 + intensity * 0.03})`);
        grad.addColorStop(1,    "rgba(255,255,255,0)");

        actx.beginPath();
        actx.fillStyle = grad;
        actx.arc(x, y, radius, 0, Math.PI * 2);
        actx.fill();
      });

      // ── Step 2: colourise brightness → classic heatmap palette ──
      const alphaData = actx.getImageData(0, 0, W, H).data;

      // Max alpha = 175 (~69%) — map always visible through the overlay
      type RGBA = [number, number, number, number];
      const palette: RGBA[] = [
        [0,   0,   0,   0  ],  // transparent
        [0,   128, 0,   50 ],  // faint green
        [50,  205, 50,  100],  // lime
        [255, 255, 0,   140],  // yellow
        [255, 140, 0,   158],  // orange
        [220, 50,  50,  168],  // red-orange
        [180, 0,   0,   173],  // deep red
        [120, 0,   0,   175],  // dark red
      ];

      const lerpColor = (t: number): RGBA => {
        const scaled = Math.min(t, 0.9999) * (palette.length - 1);
        const lo = Math.floor(scaled);
        const f  = scaled - lo;
        const a  = palette[lo], b = palette[lo + 1];
        return [
          a[0] + (b[0] - a[0]) * f,
          a[1] + (b[1] - a[1]) * f,
          a[2] + (b[2] - a[2]) * f,
          a[3] + (b[3] - a[3]) * f,
        ];
      };

      const imgData = ctx.createImageData(W, H);
      const out = imgData.data;
      for (let i = 0; i < alphaData.length; i += 4) {
        const brightness = alphaData[i] / 255;
        if (brightness < 0.015) continue;
        const [r, g, b, a] = lerpColor(brightness);
        out[i]   = r;
        out[i+1] = g;
        out[i+2] = b;
        out[i+3] = a;
      }
      ctx.putImageData(imgData, 0, 0);
    }

    onRemove() {
      this.canvas?.parentNode?.removeChild(this.canvas);
      this.canvas = null;
    }
  }

  const overlay = new HeatOverlay();
  overlay.setMap(map);
  map.addListener("bounds_changed", () => overlay.draw());
  return overlay;
}

function loadGoogleMaps(key: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const g = (window as any).google;
    if (g?.maps?.OverlayView) { resolve(g); return; }

    const existing = document.querySelector(
      'script[src*="maps.googleapis.com/maps/api/js"]'
    ) as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener("load",  () => resolve((window as any).google));
      existing.addEventListener("error", reject);
      return;
    }

    const script = document.createElement("script");
    script.src     = `https://maps.googleapis.com/maps/api/js?key=${key}&libraries=marker`;
    script.async   = true;
    script.onload  = () => resolve((window as any).google);
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

export default function HeatMap({ issues }: Props) {
  const mapRef         = useRef<HTMLDivElement>(null);
  const initializedRef = useRef(false);

  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    const key    = import.meta.env.VITE_GOOGLE_MAPS_KEY;
    const points = issues.filter(i => i.location?.lat && i.location?.lng);

    (async () => {
      if (!mapRef.current) return;
      const google = await loadGoogleMaps(key);

      const centerLat = points.length
        ? points.reduce((s, i) => s + i.location.lat, 0) / points.length
        : 22.7196;
      const centerLng = points.length
        ? points.reduce((s, i) => s + i.location.lng, 0) / points.length
        : 75.8577;

      const map = new google.maps.Map(mapRef.current, {
        center:            { lat: centerLat, lng: centerLng },
        zoom:              13,
        mapId:             "DEMO_MAP_ID",
        mapTypeId:         "roadmap",
        styles: [
          { featureType: "all",           elementType: "geometry",   stylers: [{ color: "#f5f5f5" }] },
          { featureType: "water",         elementType: "geometry",   stylers: [{ color: "#c9d6e3" }] },
          { featureType: "road",          elementType: "geometry",   stylers: [{ color: "#ffffff" }] },
          { featureType: "road.arterial", elementType: "geometry",   stylers: [{ color: "#dadada" }] },
          { featureType: "poi",           elementType: "labels",     stylers: [{ visibility: "off"  }] },
        ],
        zoomControl:       true,
        streetViewControl: false,
        mapTypeControl:    false,
        fullscreenControl: true,
      });

      // Heatmap overlay
      const heatPoints = points.map(i => ({
        lat: i.location.lat, lng: i.location.lng, weight: i.priorityScore || 5,
      }));
      createHeatmapOverlay(google, map, heatPoints);

      // AdvancedMarkerElement — no deprecation warning
      const { AdvancedMarkerElement } = await google.maps.importLibrary("marker") as any;

      const severityColor: Record<string, string> = {
        CRITICAL: "#DC2626", HIGH: "#D97706", MEDIUM: "#CA8A04", LOW: "#16A34A",
      };

      points.forEach(issue => {
        const dot = document.createElement("div");
        dot.style.cssText = `
          width:12px;height:12px;border-radius:50%;
          background:${severityColor[issue.severity] || "#6B7280"};
          border:2px solid #fff;
          box-shadow:0 1px 4px rgba(0,0,0,0.4);
          cursor:pointer;
        `;

        const marker = new AdvancedMarkerElement({
          map,
          position: { lat: issue.location.lat, lng: issue.location.lng },
          title:    issue.title,
          content:  dot,
        });

        const infoWindow = new google.maps.InfoWindow({
          content: `
            <div style="font-family:Inter,system-ui,sans-serif;padding:6px 2px;max-width:220px">
              <div style="font-size:10px;font-weight:700;color:#64748B;text-transform:uppercase;margin-bottom:4px">${issue.category}</div>
              <div style="font-size:14px;font-weight:700;color:#0F172A;margin-bottom:4px;line-height:1.3">${issue.title}</div>
              <div style="font-size:11px;color:#475569;margin-bottom:6px">${issue.department}</div>
              <div style="display:flex;gap:6px;align-items:center">
                <span style="padding:2px 8px;border-radius:10px;font-size:10px;font-weight:700;background:${severityColor[issue.severity]}22;color:${severityColor[issue.severity]}">${issue.severity}</span>
                <span style="font-size:10px;color:#64748B">P${issue.priorityScore}/10</span>
              </div>
              <div style="font-size:10px;color:#94A3B8;margin-top:6px">${issue.status}</div>
            </div>
          `,
        });
        marker.addListener("click", () => infoWindow.open(map, marker));
      });
    })().catch(console.error);
  }, []);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: "#0F172A" }}>Intensity:</span>
          <div style={{
            width: 140, height: 12, borderRadius: 6,
            background: "linear-gradient(90deg,#008000,#32cd32,#ffff00,#ff8c00,#dc3232,#780000)"
          }} />
          <span style={{ fontSize: 10, color: "#64748B" }}>Low → High</span>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {[
            { color: "#DC2626", label: "Critical" },
            { color: "#D97706", label: "High"     },
            { color: "#CA8A04", label: "Medium"   },
            { color: "#16A34A", label: "Low"      },
          ].map(s => (
            <div key={s.label} style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: s.color }} />
              <span style={{ fontSize: 10, color: "#64748B" }}>{s.label}</span>
            </div>
          ))}
        </div>
      </div>

      <div ref={mapRef} style={{
        width: "100%", height: 420, borderRadius: 16,
        border: "1px solid #E2E8F0", overflow: "hidden",
        boxShadow: "0 4px 20px rgba(0,0,0,0.08)",
        background: "#f5f5f5",
      }} />

      <p style={{ fontSize: 11, color: "#94A3B8", textAlign: "center", margin: 0 }}>
        {issues.filter((i: Issue) => i.location?.lat).length} issues plotted · Click any marker for details
      </p>
    </div>
  );
}