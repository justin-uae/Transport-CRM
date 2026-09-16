"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { MapPin, X } from "lucide-react";
import { loadGoogleMaps } from "@/lib/googleMaps";
import { AddressAutocompleteField } from "@/components/ui/AddressAutocompleteField";
import { useToast } from "@/components/ui/Toast";
import { addUserRegionAction, removeUserRegionAction } from "./actions";

export interface AllocatedRegion {
  id: string;
  region: string;
  lat: number | null;
  lng: number | null;
  userId: string;
  userName: string;
}

// One tenant is rarely more than a handful of staff — a small fixed palette,
// hashed by user id, is enough for every marker/dot to read as "this person"
// at a glance without maintaining a colour assignment anywhere.
const PALETTE = ["#f97316", "#2563eb", "#16a34a", "#a855f7", "#dc2626", "#0891b2", "#ca8a04", "#db2777", "#4f46e5", "#059669"];
function colorForUser(userId: string) {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) hash = (hash * 31 + userId.charCodeAt(i)) >>> 0;
  return PALETTE[hash % PALETTE.length]!;
}

// Dubai — a reasonable default centre for this tenant's operating area when
// no allocated region has coordinates yet to fit bounds to.
const DEFAULT_CENTER = { lat: 25.2048, lng: 55.2708 };

/**
 * Region coverage map — opened from "+ Add region" on a user row. Shows
 * every colleague's allocated region as a coloured pin (so an admin can see
 * gaps/overlaps before adding one), and lets them add a new region for the
 * target user either by searching a place or clicking directly on the map.
 * Existing regions without stored coordinates (added through the old
 * plain-text flow, pre-0069) are geocoded on the fly for display only —
 * never written back, so nothing about their row changes just by opening this.
 */
export function RegionMapModal({
  open,
  onClose,
  targetUserId,
  targetUserName,
  allRegions,
  canManage,
}: {
  open: boolean;
  onClose: () => void;
  targetUserId: string;
  targetUserName: string;
  allRegions: AllocatedRegion[];
  canManage: boolean;
}) {
  const notify = useToast();
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<google.maps.Marker[]>([]);
  const geocodeCache = useRef<Map<string, { lat: number; lng: number } | null>>(new Map());

  const [mapStatus, setMapStatus] = useState<"loading" | "ready" | "unavailable">("loading");
  const [nameInput, setNameInput] = useState("");
  const [pendingCoords, setPendingCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  useEffect(() => {
    if (open) panelRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = original;
    };
  }, [open]);

  // Resets everything when the modal closes, so reopening it (for the same
  // or a different user) starts clean rather than showing stale state.
  useEffect(() => {
    if (open) return;
    mapRef.current = null;
    markersRef.current = [];
    setMapStatus("loading");
    setNameInput("");
    setPendingCoords(null);
  }, [open]);

  // Builds the map once per open.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    loadGoogleMaps().then((maps) => {
      if (cancelled || !mapContainerRef.current) return;
      if (!maps) {
        setMapStatus("unavailable");
        return;
      }
      const map = new maps.maps.Map(mapContainerRef.current, {
        center: DEFAULT_CENTER,
        zoom: 10,
        mapTypeId: maps.maps.MapTypeId.ROADMAP,
        streetViewControl: false,
        mapTypeControl: false,
        fullscreenControl: false,
      });
      mapRef.current = map;

      const pendingMarker = new maps.maps.Marker({
        map,
        visible: false,
        icon: {
          path: maps.maps.SymbolPath.CIRCLE,
          scale: 10,
          fillColor: "#0f172a",
          fillOpacity: 0.9,
          strokeColor: "#ffffff",
          strokeWeight: 2,
        },
      });

      map.addListener("click", (e: google.maps.MapMouseEvent) => {
        if (!e.latLng || !canManage) return;
        const lat = e.latLng.lat();
        const lng = e.latLng.lng();
        pendingMarker.setPosition({ lat, lng });
        pendingMarker.setVisible(true);
        const geocoder = new maps.maps.Geocoder();
        geocoder.geocode({ location: { lat, lng } }, (results, status) => {
          const name = status === "OK" && results?.[0] ? results[0].formatted_address : `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
          setNameInput(name);
          setPendingCoords({ lat, lng });
        });
      });

      setMapStatus("ready");
    });
    return () => {
      cancelled = true;
    };
  }, [open, canManage]);

  // Plots every allocated region as a pin, once the map is ready — geocoding
  // on the fly (and caching in memory for this session) any older row that
  // has no stored lat/lng.
  useEffect(() => {
    if (mapStatus !== "ready" || !mapRef.current || typeof window === "undefined" || !window.google) return;
    const google = window.google;
    const map = mapRef.current;

    markersRef.current.forEach((m) => m.setMap(null));
    markersRef.current = [];

    const infoWindow = new google.maps.InfoWindow();
    const bounds = new google.maps.LatLngBounds();
    let plotted = 0;

    async function resolveCoords(r: AllocatedRegion): Promise<{ lat: number; lng: number } | null> {
      if (r.lat != null && r.lng != null) return { lat: r.lat, lng: r.lng };
      if (geocodeCache.current.has(r.region)) return geocodeCache.current.get(r.region)!;
      const result = await new Promise<{ lat: number; lng: number } | null>((resolve) => {
        new google.maps.Geocoder().geocode({ address: r.region }, (results, status) => {
          if (status === "OK" && results?.[0]) {
            const loc = results[0].geometry.location;
            resolve({ lat: loc.lat(), lng: loc.lng() });
          } else {
            resolve(null);
          }
        });
      });
      geocodeCache.current.set(r.region, result);
      return result;
    }

    Promise.all(
      allRegions.map(async (r) => {
        const coords = await resolveCoords(r);
        if (!coords) return;
        plotted += 1;
        bounds.extend(coords);
        const marker = new google.maps.Marker({
          position: coords,
          map,
          icon: {
            path: google.maps.SymbolPath.CIRCLE,
            scale: 9,
            fillColor: colorForUser(r.userId),
            fillOpacity: 0.9,
            strokeColor: "#ffffff",
            strokeWeight: 2,
          },
        });
        marker.addListener("click", () => {
          const content = document.createElement("div");
          content.style.fontSize = "13px";
          content.style.lineHeight = "1.5";
          const strong = document.createElement("b");
          strong.textContent = r.region;
          content.append(strong, document.createElement("br"), r.userName);
          infoWindow.setContent(content);
          infoWindow.open({ map, anchor: marker });
        });
        markersRef.current.push(marker);
      }),
    ).then(() => {
      if (plotted > 0) map.fitBounds(bounds, 64);
    });
  }, [allRegions, mapStatus]);

  function confirmAdd() {
    const name = nameInput.trim();
    if (!name) {
      notify("Enter or pick a region first.");
      return;
    }
    startTransition(async () => {
      const result = await addUserRegionAction(targetUserId, name, pendingCoords);
      if (result?.error) {
        notify(result.error);
        return;
      }
      notify(`Region added for ${targetUserName}`);
      setNameInput("");
      setPendingCoords(null);
    });
  }

  function handleRemove(regionId: string) {
    startTransition(async () => {
      try {
        await removeUserRegionAction(targetUserId, regionId);
        notify(`Region removed for ${targetUserName}`);
      } catch (err) {
        notify(err instanceof Error ? err.message : "Could not remove region");
      }
    });
  }

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[200] overflow-y-auto bg-slate-900/40 p-4" onClick={() => onClose()}>
      <div className="flex min-h-full items-start justify-center sm:items-center">
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          tabIndex={-1}
          className="flex max-h-[92dvh] w-full max-w-5xl flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl outline-none"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-100 px-6 py-5">
            <div>
              <h3 id={titleId} className="text-lg font-black text-slate-900">
                Region coverage
              </h3>
              <p className="mt-1 text-sm text-slate-500">
                Adding for <b>{targetUserName}</b> — search a place, or click anywhere on the map.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="shrink-0 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            >
              <X size={18} />
            </button>
          </div>

          <div className="grid min-h-0 flex-1 grid-cols-1 overflow-y-auto md:grid-cols-[1.4fr_1fr] md:overflow-visible">
            <div className="relative min-h-[240px] max-h-[45dvh] shrink-0 bg-slate-100 md:max-h-none md:min-h-[320px]">
              <div ref={mapContainerRef} className="absolute inset-0" />
              {mapStatus !== "ready" && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-6 text-center text-sm text-slate-400">
                  {mapStatus === "loading" ? (
                    <span>Loading map…</span>
                  ) : (
                    <>
                      <MapPin size={24} />
                      <p>
                        Add <code className="rounded bg-slate-200 px-1 py-0.5 text-slate-600">NEXT_PUBLIC_GOOGLE_MAPS_API_KEY</code> to
                        enable the map — you can still add a region by name below.
                      </p>
                    </>
                  )}
                </div>
              )}
            </div>

            <div className="flex min-h-0 flex-col border-t border-slate-100 md:border-l md:border-t-0">
              {canManage && (
                <div className="shrink-0 border-b border-slate-100 p-4">
                  <div className="text-xs font-black uppercase tracking-wide text-slate-400">Add a region for {targetUserName}</div>
                  <div className="mt-2">
                    <AddressAutocompleteField
                      value={nameInput}
                      onChange={(v) => {
                        setNameInput(v);
                        setPendingCoords(null);
                      }}
                      onPlaceSelect={(place) => {
                        setNameInput(place.address);
                        setPendingCoords(place.lat != null && place.lng != null ? { lat: place.lat, lng: place.lng } : null);
                      }}
                      placeholder="Search a place, or click the map…"
                      className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-primary-400"
                    />
                  </div>
                  <button
                    type="button"
                    disabled={pending || !nameInput.trim()}
                    onClick={confirmAdd}
                    className="mt-2 w-full rounded-lg bg-primary-500 px-3 py-2 text-sm font-bold text-white disabled:opacity-60"
                  >
                    {pending ? "Adding…" : "Add region"}
                  </button>
                </div>
              )}

              <div className="min-h-0 flex-1 p-4 md:overflow-y-auto">
                <div className="text-xs font-black uppercase tracking-wide text-slate-400">Allocated regions ({allRegions.length})</div>
                <div className="mt-2 space-y-1">
                  {allRegions.map((r) => (
                    <div key={r.id} className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-slate-50">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: colorForUser(r.userId) }} />
                        <span className="truncate font-semibold">{r.region}</span>
                        <span className="shrink-0 text-xs text-slate-400">· {r.userName}</span>
                      </div>
                      {canManage && r.userId === targetUserId && (
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => handleRemove(r.id)}
                          aria-label={`Remove ${r.region}`}
                          className="shrink-0 rounded-full p-1 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-60"
                        >
                          <X size={12} />
                        </button>
                      )}
                    </div>
                  ))}
                  {allRegions.length === 0 && <p className="py-4 text-center text-sm text-slate-400">No regions allocated yet.</p>}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
