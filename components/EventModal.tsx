"use client";

import { Camera, Check, Film, LoaderCircle, Trash2, Upload, X } from "lucide-react";
import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { LocationPicker } from "./LocationPicker";
import type { EventItem, EventMedia } from "@/types/database";

export function EventModal({ event, initialDate, groupId, userId, onClose, onSaved, onDeleted }: {
  event: EventItem | null;
  initialDate: string;
  groupId: string;
  userId: string;
  onClose: () => void;
  onSaved: () => Promise<void>;
  onDeleted: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState("");
  const [media, setMedia] = useState<EventMedia[]>([]);
  const [locationValue, setLocationValue] = useState({ location: event?.location || "", lat: event?.location_lat ?? null, lng: event?.location_lng ?? null, placeId: event?.place_id ?? null });
  const isEdit = Boolean(event);

  useEffect(() => { if (event) void loadMedia(event.id); }, [event?.id]);

  async function loadMedia(eventId: string) {
    const { data } = await supabase.from("event_media").select("*").eq("event_id", eventId).order("created_at", { ascending: false });
    const rows = (data || []) as EventMedia[];
    const signed = await Promise.all(rows.map(async item => {
      const { data: urlData } = await supabase.storage.from("event-media").createSignedUrl(item.storage_path, 3600);
      return { ...item, signed_url: urlData?.signedUrl };
    }));
    setMedia(signed);
  }

  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    const form = new FormData(e.currentTarget);
    const payload = {
      group_id: groupId,
      created_by: userId,
      title: String(form.get("title") || "").trim(),
      event_date: String(form.get("event_date") || ""),
      event_time: String(form.get("event_time") || "") || null,
      location: locationValue.location.trim(),
      location_lat: locationValue.lat,
      location_lng: locationValue.lng,
      place_id: locationValue.placeId,
      maps_url: locationValue.lat != null && locationValue.lng != null ? `https://www.google.com/maps/search/?api=1&query=${locationValue.lat},${locationValue.lng}` : (locationValue.location ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(locationValue.location)}` : null),
      details: String(form.get("details") || "").trim() || null,
      theme: "cyan",
    };
    const result = event
      ? await supabase.from("events").update(payload).eq("id", event.id)
      : await supabase.from("events").insert(payload);
    setBusy(false);
    if (result.error) return alert(result.error.message);
    await onSaved();
    onClose();
  }

  async function uploadFiles(e: ChangeEvent<HTMLInputElement>) {
    if (!event || !e.target.files?.length) return;
    const files = Array.from(e.target.files);
    setUploading(true);
    for (let index = 0; index < files.length; index++) {
      const file = files[index];
      setProgress(`${index + 1}/${files.length}: ${file.name}`);
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
      const path = `${groupId}/${event.id}/${userId}/${crypto.randomUUID()}-${safeName}`;
      const { error: uploadError } = await supabase.storage.from("event-media").upload(path, file, { contentType: file.type, upsert: false });
      if (uploadError) { alert(uploadError.message); continue; }
      const { error: metaError } = await supabase.from("event_media").insert({
        event_id: event.id,
        group_id: groupId,
        uploaded_by: userId,
        storage_path: path,
        file_name: file.name,
        mime_type: file.type || "application/octet-stream",
        file_size: file.size,
      });
      if (metaError) alert(metaError.message);
    }
    e.target.value = "";
    setUploading(false);
    setProgress("");
    await loadMedia(event.id);
  }

  async function removeMedia(item: EventMedia) {
    if (!confirm("Ștergi acest fișier?")) return;
    await supabase.storage.from("event-media").remove([item.storage_path]);
    await supabase.from("event_media").delete().eq("id", item.id);
    if (event) await loadMedia(event.id);
  }

  async function removeEvent() {
    if (!event || !confirm("Ștergi evenimentul și albumul lui?")) return;
    setBusy(true);
    const paths = media.map(x => x.storage_path);
    if (paths.length) await supabase.storage.from("event-media").remove(paths);
    const { error } = await supabase.from("events").delete().eq("id", event.id);
    setBusy(false);
    if (error) return alert(error.message);
    await onDeleted();
    onClose();
  }

  const counts = useMemo(() => ({ photos: media.filter(x => x.mime_type.startsWith("image/")).length, videos: media.filter(x => x.mime_type.startsWith("video/")).length }), [media]);

  return <div className="modalBack" onMouseDown={onClose}><section className="eventModal" onMouseDown={e => e.stopPropagation()}>
    <header className="modalHeader"><div><small>{isEdit ? "EVENT SPACE" : "NEW EVENT"}</small><h2>{isEdit ? event?.title : "Creează eveniment"}</h2></div><button className="iconButton" onClick={onClose}><X/></button></header>
    <form className="eventForm" onSubmit={save}>
      <label>Titlu<input name="title" defaultValue={event?.title || ""} required/></label>
      <div className="formGrid"><label>Data<input name="event_date" type="date" defaultValue={event?.event_date || initialDate || ""} required/></label><label>Ora<input name="event_time" type="time" defaultValue={event?.event_time || ""}/></label></div>
      <LocationPicker value={locationValue} onChange={setLocationValue}/>
      <label>Detalii<textarea name="details" defaultValue={event?.details || ""} rows={3}/></label>
      <div className="formActions">{event && <button type="button" className="dangerButton" onClick={removeEvent}><Trash2/> Șterge</button>}<button className="primary" disabled={busy}><Check/> {busy ? "Se salvează…" : "Salvează"}</button></div>
    </form>

    {event && <section className="albumSection">
      <div className="albumHead"><div><small>ALBUM AUTOMAT</small><h3>Poze și videoclipuri</h3><p>{counts.photos} poze · {counts.videos} videoclipuri</p></div>
        <label className={`uploadButton ${uploading ? "disabled" : ""}`}><input type="file" accept="image/*,video/*" multiple onChange={uploadFiles} disabled={uploading}/>{uploading ? <LoaderCircle className="spin"/> : <Upload/>}{uploading ? progress : "Adaugă media"}</label>
      </div>
      {!media.length ? <div className="emptyAlbum"><Camera/><strong>Albumul este gol</strong><span>Pozele și clipurile adăugate aici vor rămâne legate de eveniment.</span></div> : <div className="mediaGrid">{media.map(item => <article key={item.id} className="mediaTile">
        {item.mime_type.startsWith("video/") ? <video src={item.signed_url} controls preload="metadata"/> : <img src={item.signed_url} alt={item.file_name}/>} 
        <div className="mediaMeta"><span>{item.mime_type.startsWith("video/") ? <Film/> : <Camera/>}{item.file_name}</span>{item.uploaded_by === userId && <button onClick={() => removeMedia(item)}><Trash2/></button>}</div>
      </article>)}</div>}
    </section>}
  </section></div>;
}
