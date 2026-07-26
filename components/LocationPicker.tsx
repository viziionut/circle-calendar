"use client";

import { ExternalLink, MapPin } from "lucide-react";
import { useEffect, useRef, useState } from "react";

declare global {
  interface Window { google?: any; __circleMapsPromise?: Promise<void>; }
}

type LocationValue = {
  location: string;
  lat: number | null;
  lng: number | null;
  placeId: string | null;
};

function loadGoogleMaps(apiKey: string) {
  if (window.google?.maps) return Promise.resolve();
  if (window.__circleMapsPromise) return window.__circleMapsPromise;
  window.__circleMapsPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&libraries=places&v=weekly`;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Google Maps nu s-a putut încărca."));
    document.head.appendChild(script);
  });
  return window.__circleMapsPromise;
}

export function LocationPicker({ value, onChange }: { value: LocationValue; onChange: (value: LocationValue) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<any>(null);
  const markerInstance = useRef<any>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "missing" | "error">("loading");
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "";

  useEffect(() => {
    if (!apiKey) { setStatus("missing"); return; }
    let cancelled = false;
    loadGoogleMaps(apiKey).then(() => {
      if (cancelled || !mapRef.current || !inputRef.current) return;
      const fallback = { lat: value.lat ?? 44.1598, lng: value.lng ?? 28.6348 };
      const map = new window.google.maps.Map(mapRef.current, { center: fallback, zoom: value.lat ? 15 : 10, mapTypeControl: false, streetViewControl: false, fullscreenControl: false });
      const marker = new window.google.maps.Marker({ map, position: fallback, draggable: true });
      mapInstance.current = map;
      markerInstance.current = marker;

      const updateFromLatLng = (latLng: any) => {
        const lat = latLng.lat();
        const lng = latLng.lng();
        marker.setPosition({ lat, lng });
        onChange({ ...value, lat, lng, placeId: null });
      };
      map.addListener("click", (event: any) => event.latLng && updateFromLatLng(event.latLng));
      marker.addListener("dragend", (event: any) => event.latLng && updateFromLatLng(event.latLng));

      const autocomplete = new window.google.maps.places.Autocomplete(inputRef.current, { fields: ["formatted_address", "name", "geometry", "place_id"] });
      autocomplete.addListener("place_changed", () => {
        const place = autocomplete.getPlace();
        const loc = place.geometry?.location;
        if (!loc) return;
        const lat = loc.lat();
        const lng = loc.lng();
        const label = place.formatted_address || place.name || inputRef.current?.value || "";
        marker.setPosition({ lat, lng });
        map.panTo({ lat, lng });
        map.setZoom(16);
        onChange({ location: label, lat, lng, placeId: place.place_id || null });
      });
      setStatus("ready");
    }).catch(() => !cancelled && setStatus("error"));
    return () => { cancelled = true; };
  }, [apiKey]);

  useEffect(() => {
    if (!mapInstance.current || !markerInstance.current || value.lat == null || value.lng == null) return;
    const position = { lat: value.lat, lng: value.lng };
    markerInstance.current.setPosition(position);
    mapInstance.current.panTo(position);
  }, [value.lat, value.lng]);

  const mapsUrl = value.lat != null && value.lng != null
    ? `https://www.google.com/maps/search/?api=1&query=${value.lat},${value.lng}`
    : value.location ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(value.location)}` : "";

  return <section className="locationPicker">
    <label>Locație
      <div className="locationInput"><MapPin/><input ref={inputRef} value={value.location} onChange={event => onChange({ ...value, location: event.target.value })} placeholder="Caută adresă sau loc…"/></div>
    </label>
    {status === "missing" && <p className="mapsNotice">Adaugă cheia <code>NEXT_PUBLIC_GOOGLE_MAPS_API_KEY</code> în Vercel pentru hartă și căutare automată. Adresa text poate fi salvată și fără cheie.</p>}
    {status === "error" && <p className="mapsNotice errorMessage">Google Maps nu s-a încărcat. Verifică cheia API și API-urile activate.</p>}
    {status === "loading" && apiKey && <p className="mapsNotice">Se încarcă harta…</p>}
    <div ref={mapRef} className={status === "ready" ? "eventMap visible" : "eventMap"}/>
    {status === "ready" && <small className="mapHelp">Apasă pe hartă sau mută pinul pentru o poziție exactă.</small>}
    {mapsUrl && <a className="mapsLink" href={mapsUrl} target="_blank" rel="noreferrer"><ExternalLink/> Deschide în Google Maps</a>}
  </section>;
}
