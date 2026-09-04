"use client";

/**
 * A read-only map showing one point.
 *
 * ## Loaded on demand, not on page load
 *
 * Leaflet plus its stylesheet is a meaningful amount of JavaScript, and the map
 * is never the reason somebody opened a case page — the photograph and the
 * description are. So the library is imported inside an effect, after the rest
 * of the page is interactive, and the container reserves its final height from
 * the first paint so nothing shifts when the tiles arrive.
 *
 * ## Why Leaflet directly rather than react-leaflet
 *
 * One component, one marker, no interaction. A React wrapper would add a
 * dependency whose whole job is to translate props into the imperative calls
 * below, and would tie this file to that wrapper's release cycle. The imperative
 * API used here is four calls.
 *
 * ## Precision
 *
 * A missing-person case shows an approximate area, not a pin on a doorstep. The
 * marker is a circle sized to a few hundred metres and the map is capped at a
 * neighbourhood zoom, because the useful information is "near this park" and
 * the harmful version is "this exact address".
 */

import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/cn";

// Leaflet's own stylesheet, plus the overrides that make its controls follow
// Locora's theme. Imported rather than linked by hand so Next fingerprints and
// serves them from this origin — the Content-Security-Policy allows no
// third-party stylesheets, and a map without its CSS renders as a pile of
// stacked tiles.
import "leaflet/dist/leaflet.css";
import "./location-map.css";

export function LocationMap({
  latitude,
  longitude,
  label,
  className,
}: {
  latitude: number;
  longitude: number;
  label: string;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "failed">("loading");

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let cancelled = false;
    // Held so the cleanup can tear the map down; Leaflet leaks handlers and
    // leaves the container marked as initialised otherwise, and a second mount
    // in development then throws "Map container is already initialized".
    let map: import("leaflet").Map | undefined;

    void (async () => {
      try {
        const leaflet = await import("leaflet");
        if (cancelled || !containerRef.current) return;

        map = leaflet.map(container, {
          center: [latitude, longitude],
          zoom: 14,
          // Every interaction that could trap a scrolling reader is off. A map
          // that swallows the page's scroll on a phone is a map people cannot
          // get past.
          scrollWheelZoom: false,
          dragging: true,
          touchZoom: true,
          doubleClickZoom: false,
          // Neighbourhood level at most: see the note on precision above.
          maxZoom: 16,
          minZoom: 9,
          attributionControl: true,
          keyboard: true,
        });

        leaflet
          .tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
            maxZoom: 19,
          })
          .addTo(map);

        // A circle rather than a pin marker: a pin asserts a point, a circle
        // shows an area, and an area is what the data actually supports.
        leaflet
          .circle([latitude, longitude], {
            radius: 350,
            color: "#2a63bd",
            weight: 2,
            fillColor: "#2a63bd",
            fillOpacity: 0.15,
          })
          .addTo(map)
          .bindPopup(label);

        if (!cancelled) setStatus("ready");
      } catch {
        // A blocked CDN, an offline visitor, or tiles that will not load. The
        // address is printed next to this map in text, so failing quietly to a
        // clear message costs nothing that matters.
        if (!cancelled) setStatus("failed");
      }
    })();

    return () => {
      cancelled = true;
      map?.remove();
    };
  }, [latitude, longitude, label]);

  return (
    <div className={cn("space-y-2", className)}>
      <div className="relative overflow-hidden rounded-xl border border-line">
        <div
          ref={containerRef}
          // Height reserved up front so the page does not shift when tiles
          // arrive. aria-hidden because a raster map conveys nothing to a
          // screen reader; the address is rendered as text alongside it.
          aria-hidden
          className="h-64 w-full bg-surface-sunken sm:h-72"
        />

        {status !== "ready" ? (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-surface-sunken">
            <p className="text-sm text-ink-subtle">
              {status === "loading" ? "Loading map…" : "Map unavailable"}
            </p>
          </div>
        ) : null}
      </div>

      <p className="text-xs text-ink-subtle">
        Approximate area only. Locora does not publish an exact address.
      </p>
    </div>
  );
}
