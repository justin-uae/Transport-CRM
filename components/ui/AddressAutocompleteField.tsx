"use client";

import { useEffect, useRef, useState } from "react";
import { loadGoogleMaps } from "@/lib/googleMaps";

export interface PlaceSelection {
  address: string;
  lat: number | null;
  lng: number | null;
}

/**
 * Plain text input that upgrades itself to a Google Places autocomplete
 * once the Maps SDK is available (NEXT_PUBLIC_GOOGLE_MAPS_API_KEY set) —
 * degrades silently to free-text entry otherwise, so this is safe to use
 * everywhere pickup/destination is captured even before the key is added.
 */
export function AddressAutocompleteField({
  value,
  onChange,
  onPlaceSelect,
  placeholder,
  className,
  name,
  required,
}: {
  value: string;
  onChange: (value: string) => void;
  onPlaceSelect?: (place: PlaceSelection) => void;
  placeholder?: string;
  className?: string;
  name?: string;
  required?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [ready, setReady] = useState(false);

  // Kept in refs so the autocomplete instance (below) is only ever created
  // once the SDK is ready, instead of being torn down and recreated on
  // every keystroke because the parent passed a fresh inline callback.
  const onChangeRef = useRef(onChange);
  const onPlaceSelectRef = useRef(onPlaceSelect);
  useEffect(() => {
    onChangeRef.current = onChange;
    onPlaceSelectRef.current = onPlaceSelect;
  });

  useEffect(() => {
    let cancelled = false;
    loadGoogleMaps().then((google) => {
      if (!cancelled && google) setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!ready || !inputRef.current || !window.google) return;

    const autocomplete = new window.google.maps.places.Autocomplete(inputRef.current, {
      fields: ["formatted_address", "name", "geometry"],
    });
    const listener = autocomplete.addListener("place_changed", () => {
      const place = autocomplete.getPlace();
      const address = place.formatted_address || place.name || inputRef.current?.value || "";
      const location = place.geometry?.location;
      onChangeRef.current(address);
      onPlaceSelectRef.current?.({
        address,
        lat: location ? location.lat() : null,
        lng: location ? location.lng() : null,
      });
    });

    return () => {
      window.google?.maps.event.removeListener(listener);
    };
  }, [ready]);

  return (
    <input
      ref={inputRef}
      name={name}
      required={required}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={className}
      autoComplete="off"
    />
  );
}
