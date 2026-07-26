"use client";

import { CalendarRange, Check, MapPin, Pencil, Plane, Plus, Trash2, X } from "lucide-react";
import { FormEvent, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Vacation, VacationInsert, VacationUpdate } from "@/types/database";

type MemberNames = Record<string, string>;

function formatVacationDate(value: string) {
  return new Date(`${value}T12:00:00`).toLocaleDateString("ro-RO", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function VacationsPage({
  vacations,
  groupId,
  userId,
  memberNames,
  onChanged,
}: {
  vacations: Vacation[];
  groupId: string;
  userId: string;
  memberNames: MemberNames;
  onChanged: () => Promise<void>;
}) {
  const [editing, setEditing] = useState<Vacation | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const openCreate = () => {
    setEditing(null);
    setModalOpen(true);
  };

  const openEdit = (vacation: Vacation) => {
    setEditing(vacation);
    setModalOpen(true);
  };

  return <div className="page vacationsPage">
    <section className="pageTitle pageTitleActions">
      <div>
        <small>VACATION PLANNER</small>
        <h1>Vacanțe</h1>
        <p>Vezi când călătorește grupul și adaugă perioadele tale de vacanță.</p>
      </div>
      <div><button className="primary" onClick={openCreate}><Plus/> Adaugă vacanță</button></div>
    </section>

    {vacations.length ? <div className="vacationCards">
      {vacations.map(vacation => {
        const ownVacation = vacation.user_id === userId;
        return <article className="vacationCard" key={vacation.id}>
          <div className="vacationCardIcon"><Plane/></div>
          <div className="vacationCardBody">
            <small>{ownVacation ? "VACANȚA TA" : memberNames[vacation.user_id] || "MEMBRU AL GRUPULUI"}</small>
            <h3><MapPin/>{vacation.country}</h3>
            <p className="vacationDates"><CalendarRange/>{formatVacationDate(vacation.start_date)} – {formatVacationDate(vacation.end_date)}</p>
            {vacation.notes && <p className="vacationNotes">{vacation.notes}</p>}
          </div>
          {ownVacation && <button className="iconButton vacationEdit" onClick={() => openEdit(vacation)} title="Editează vacanța"><Pencil/></button>}
        </article>;
      })}
    </div> : <div className="largeEmpty vacationEmpty">
      <Plane/>
      <h3>Nicio vacanță planificată</h3>
      <p>Adaugă prima perioadă de vacanță pentru grupul tău.</p>
      <button className="primary" onClick={openCreate}><Plus/> Adaugă vacanță</button>
    </div>}

    {modalOpen && <VacationModal
      vacation={editing}
      groupId={groupId}
      userId={userId}
      onClose={() => setModalOpen(false)}
      onChanged={onChanged}
    />}
  </div>;
}

function VacationModal({
  vacation,
  groupId,
  userId,
  onClose,
  onChanged,
}: {
  vacation: Vacation | null;
  groupId: string;
  userId: string;
  onClose: () => void;
  onChanged: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const country = String(form.get("country") || "").trim();
    const startDate = String(form.get("start_date") || "");
    const endDate = String(form.get("end_date") || "");
    const notes = String(form.get("notes") || "").trim() || null;

    if (endDate < startDate) {
      setError("Data de final trebuie să fie după data de început.");
      setBusy(false);
      return;
    }

    const values: VacationUpdate = {
      country,
      start_date: startDate,
      end_date: endDate,
      notes,
    };
    const result = vacation
      ? await supabase.from("vacations").update(values).eq("id", vacation.id)
      : await supabase.from("vacations").insert({
          ...values,
          group_id: groupId,
          user_id: userId,
        } as VacationInsert);

    setBusy(false);
    if (result.error) {
      setError(result.error.message);
      return;
    }
    await onChanged();
    onClose();
  }

  async function remove() {
    if (!vacation || !confirm("Ștergi această vacanță?")) return;
    setBusy(true);
    setError("");
    const { error: deleteError } = await supabase.from("vacations").delete().eq("id", vacation.id);
    setBusy(false);
    if (deleteError) {
      setError(deleteError.message);
      return;
    }
    await onChanged();
    onClose();
  }

  return <div className="modalBack" onMouseDown={onClose}>
    <section className="smallModal vacationModal" onMouseDown={event => event.stopPropagation()}>
      <header className="modalHeader">
        <div><small>VACATION PLANNER</small><h2>{vacation ? "Editează vacanța" : "Adaugă vacanță"}</h2></div>
        <button className="iconButton" onClick={onClose}><X/></button>
      </header>
      <form className="dialogForm" onSubmit={save}>
        <label>Țară sau destinație<input name="country" required defaultValue={vacation?.country || ""} placeholder="Italia"/></label>
        <div className="formGrid">
          <label>Data de început<input name="start_date" type="date" required defaultValue={vacation?.start_date || ""}/></label>
          <label>Data de final<input name="end_date" type="date" required defaultValue={vacation?.end_date || ""}/></label>
        </div>
        <label>Notițe<textarea name="notes" rows={4} defaultValue={vacation?.notes || ""} placeholder="Planuri, cazare sau alte detalii..."/></label>
        {error && <p className="errorMessage">{error}</p>}
        <div className="formActions">
          {vacation && <button type="button" className="dangerButton" onClick={remove} disabled={busy}><Trash2/> Șterge</button>}
          <button className="primary" disabled={busy}><Check/> {busy ? "Se salvează..." : "Salvează"}</button>
        </div>
      </form>
    </section>
  </div>;
}
