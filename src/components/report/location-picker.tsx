"use client";

/**
 * Choosing where something happened.
 *
 * ## The map is optional, the text is not
 *
 * Address and city are typed and required; the coordinate pair is optional and
 * comes from clicking the map or from the browser's geolocation. That ordering
 * is deliberate: somebody filing in the first hours of a disappearance may not
 * be able to pin a map — they may be on a phone, in a hurry, describing
 * somewhere they only half know — and refusing the report over a coordinate
 * would be the wrong trade. The database enforces the same rule: coordinates
 * are nullable, but never half-set.
 *
 * ## Why the map only appears when asked for
 *
 * Collapsed behind a button. Leaflet is a real download and most reports will
 * be filed without touching it, so it is not loaded on the chance that somebody
 * wants it. Expanding is also what makes the pin an explicit choice rather than
 * a default a reporter did not realise they were making.
 */

import { Crosshair, MapPin, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { cn } from "@/lib/cn";

import "leaflet/dist/leaflet.css";
import "../cases/location-map.css";

export interface LocationValue {
  address: string;
  city: string;
  latitude: number | null;
  longitude: number | null;
}

export function LocationPicker({
  value,
  onChange,
  addressLabel,
  addressHint,
  errors,
}: {
  value: LocationValue;
  onChange: (value: LocationValue) => void;
  addressLabel: string;
  addressHint?: string;
  errors?: { address?: string; city?: string; latitude?: string };
}) {
  const [showMap, setShowMap] = useState(value.latitude !== null);
  const [locating, setLocating] = useState(false);
  const [locateError, setLocateError] = useState<string | null>(null);

  function requestMyLocation() {
    if (!("geolocation" in navigator)) {
      setLocateError("This browser cannot share your location.");
      return;
    }

    setLocating(true);
    setLocateError(null);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        onChange({
          ...value,
          latitude: Number(position.coords.latitude.toFixed(5)),
          longitude: Number(position.coords.longitude.toFixed(5)),
        });
        setShowMap(true);
        setLocating(false);
      },
      (error) => {
        // The three cases get different messages because the fixes are
        // different: allow the prompt, wait and retry, or type the address.
        setLocateError(
          error.code === error.PERMISSION_DENIED
            ? "Location permission was declined. You can still type the address, or pick a point on the map."
            : error.code === error.TIMEOUT
              ? "Finding your location took too long. Try again, or pick a point on the map."
              : "Your location could not be determined. Pick a point on the map instead.",
        );
        setLocating(false);
      },
      // Five decimal places is roughly a metre, which is far more precision
      // than a published case ever shows — the display rounds to a 350m circle.
      { timeout: 10_000, maximumAge: 60_000, enableHighAccuracy: false },
    );
  }

  return (
    <div className="space-y-4">
      <Field label={addressLabel} hint={addressHint} error={errors?.address} required>
        {(props) => (
          <Input
            {...props}
            name="address"
            value={value.address}
            onChange={(event) => onChange({ ...value, address: event.target.value })}
            placeholder="Street, landmark or area"
            maxLength={300}
            autoComplete="off"
          />
        )}
      </Field>

      <Field
        label="City or town"
        hint="Used to group and filter cases, so please keep it to the city name alone."
        error={errors?.city}
        required
      >
        {(props) => (
          <Input
            {...props}
            name="city"
            value={value.city}
            onChange={(event) => onChange({ ...value, city: event.target.value })}
            placeholder="Lahore"
            maxLength={120}
            autoComplete="address-level2"
          />
        )}
      </Field>

      <div className="rounded-lg border border-line bg-surface-sunken p-3">
        <div className="flex flex-wrap items-center gap-2">
          <p className="mr-auto text-sm text-ink-muted">
            {value.latitude !== null && value.longitude !== null ? (
              <span className="inline-flex items-center gap-1.5 font-medium text-ink">
                <MapPin aria-hidden className="size-3.5 text-accent" />
                Point set
              </span>
            ) : (
              "Add a point on the map — optional"
            )}
          </p>

          {value.latitude !== null ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                // Cleared as a pair. A half-set coordinate is meaningless and
                // the database rejects it.
                onChange({ ...value, latitude: null, longitude: null });
                setShowMap(false);
              }}
            >
              <X aria-hidden className="size-3.5" />
              Clear point
            </Button>
          ) : null}

          <Button
            variant="secondary"
            size="sm"
            onClick={() => requestMyLocation()}
            loading={locating}
            loadingLabel="Finding your location"
          >
            <Crosshair aria-hidden className="size-3.5" />
            Use my location
          </Button>

          <Button variant="secondary" size="sm" onClick={() => setShowMap((open) => !open)}>
            {showMap ? "Hide map" : "Pick on map"}
          </Button>
        </div>

        <div aria-live="polite">
          {locateError ? <p className="mt-2 text-xs text-critical">{locateError}</p> : null}
          {errors?.latitude ? <p className="mt-2 text-xs text-critical">{errors.latitude}</p> : null}
        </div>

        {showMap ? (
          <div className="mt-3">
            <PickerMap
              latitude={value.latitude}
              longitude={value.longitude}
              onPick={(latitude, longitude) => onChange({ ...value, latitude, longitude })}
            />
            <p className="mt-2 text-xs text-ink-subtle">
              Tap or click the map to set the point. A published case only ever shows an
              approximate area, never an exact address.
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** Karachi. A neutral starting view when there is nothing to centre on yet. */
const DEFAULT_CENTER: [number, number] = [24.8607, 67.0011];

function PickerMap({
  latitude,
  longitude,
  onPick,
}: {
  latitude: number | null;
  longitude: number | null;
  onPick: (latitude: number, longitude: number) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "failed">("loading");

  /**
   * The callback is held in a ref so the map-building effect does not depend on
   * it. Without this the map is torn down and rebuilt on every parent render —
   * and on a form that re-renders per keystroke, that is a map which never
   * finishes loading.
   *
   * Written in an effect rather than during render, which is not safe under
   * concurrent rendering.
   */
  const onPickRef = useRef(onPick);
  useEffect(() => {
    onPickRef.current = onPick;
  }, [onPick]);

  // Likewise: the effect builds the map once, and a marker is moved
  // imperatively when the coordinates change, rather than remounting.
  const markerRef = useRef<import("leaflet").CircleMarker | undefined>(undefined);
  const mapRef = useRef<import("leaflet").Map | undefined>(undefined);
  const leafletRef = useRef<typeof import("leaflet") | undefined>(undefined);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let cancelled = false;

    void (async () => {
      try {
        const leaflet = await import("leaflet");
        if (cancelled || !containerRef.current) return;

        leafletRef.current = leaflet;
        const map = leaflet.map(container, {
          center: latitude !== null && longitude !== null ? [latitude, longitude] : DEFAULT_CENTER,
          zoom: latitude !== null ? 14 : 11,
          // On in the picker, unlike the read-only map: zooming is how somebody
          // finds the right spot, and this map is behind a deliberate button
          // press so it cannot hijack a scroll they did not expect.
          scrollWheelZoom: true,
          maxZoom: 18,
        });
        mapRef.current = map;

        leaflet
          .tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
            attribution:
              '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
            maxZoom: 19,
          })
          .addTo(map);

        map.on("click", (event: import("leaflet").LeafletMouseEvent) => {
          onPickRef.current(
            Number(event.latlng.lat.toFixed(5)),
            Number(event.latlng.lng.toFixed(5)),
          );
        });

        if (!cancelled) setStatus("ready");
      } catch {
        if (!cancelled) setStatus("failed");
      }
    })();

    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = undefined;
      markerRef.current = undefined;
    };
    // Built once. The initial centre is read at mount and deliberately not a
    // dependency: re-centring on every pick would fight the user's panning.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const leaflet = leafletRef.current;
    const map = mapRef.current;
    if (!leaflet || !map) return;

    if (latitude === null || longitude === null) {
      markerRef.current?.remove();
      markerRef.current = undefined;
      return;
    }

    if (markerRef.current) {
      markerRef.current.setLatLng([latitude, longitude]);
    } else {
      markerRef.current = leaflet
        .circleMarker([latitude, longitude], {
          radius: 9,
          color: "#2a63bd",
          weight: 3,
          fillColor: "#2a63bd",
          fillOpacity: 0.35,
        })
        .addTo(map);
    }
  }, [latitude, longitude]);

  return (
    <div className="relative overflow-hidden rounded-lg border border-line">
      <div
        ref={containerRef}
        aria-hidden
        className={cn("h-56 w-full bg-surface-sunken sm:h-64")}
      />
      {status !== "ready" ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-surface-sunken">
          <p className="text-sm text-ink-subtle">
            {status === "loading" ? "Loading map…" : "Map unavailable — the address you typed is enough"}
          </p>
        </div>
      ) : null}
    </div>
  );
}
