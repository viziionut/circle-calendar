"use client";

import {
  ArrowLeft, ArrowRight, CalendarCheck, CalendarRange, Check, ChevronRight,
  CircleHelp, Clock3, Flame, Loader2, MessageCircle, Plus, Sparkles, ThumbsDown,
  ThumbsUp, Users, X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { calculateQuickPlanOptions, shiftIsoDate } from "@/lib/quickPlan";
import { displayPlanStatus, needsUserResponse, responseProgress, validRecommendationOptions } from "@/lib/quickPlanResponses";
import { useI18n } from "@/lib/i18n";
import type {
  EventItem, Group, QuickPlanPreference, QuickPlanVoteValue, QuickPlanWithDetails, Vacation,
} from "@/types/database";

const ACTIVITIES = [
  ["barbecue", "🍖", "Grătar"], ["camping", "🏕", "Camping"], ["mountain", "⛰", "Munte"],
  ["beach", "🏖", "Plajă"], ["fishing", "🎣", "Pescuit"], ["beer", "🍻", "Bere"],
  ["games", "🎮", "Board Games"], ["party", "🎂", "Petrecere"], ["city-break", "✈", "City Break"],
] as const;

const DURATIONS = [
  ["day", "O zi", 1], ["weekend", "Weekend", 2], ["3-days", "3 zile", 3],
  ["5-days", "5 zile", 5], ["week", "O săptămână", 7],
] as const;

function today() {
  return new Date().toISOString().slice(0, 10);
}

function formatPeriod(start: string, end: string, locale = "ro-RO") {
  const startDate = new Date(`${start}T12:00:00`);
  const endDate = new Date(`${end}T12:00:00`);
  if (start === end) return startDate.toLocaleDateString(locale, { day: "numeric", month: "long" });
  const sameMonth = startDate.getMonth() === endDate.getMonth();
  return `${startDate.getDate()}${sameMonth ? "" : ` ${startDate.toLocaleDateString(locale, { month: "short" })}`}–${endDate.toLocaleDateString(locale, { day: "numeric", month: "long" })}`;
}

function normalizePlans(rows: any[]): QuickPlanWithDetails[] {
  return rows.map(row => ({
    ...row,
    options: (row.quick_plan_options || []).map((option: any) => ({
      ...option,
      votes: option.quick_plan_votes || [],
    })).sort((a: any, b: any) => a.rank - b.rank),
  }));
}

export function QuickPlanSection({
  groupId, currentUserId, memberIds, memberNames = {}, events, vacations,
}: {
  groupId: string;
  currentUserId: string;
  memberIds: string[];
  memberNames?: Record<string, string>;
  events: EventItem[];
  vacations: Vacation[];
}) {
  const { t } = useI18n();
  const [plans, setPlans] = useState<QuickPlanWithDetails[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState("");
  const [wizardOpen, setWizardOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadPlans = useCallback(async () => {
    const { data, error: queryError } = await supabase
      .from("quick_plans")
      .select("*,quick_plan_options(*,quick_plan_votes(*))")
      .eq("group_id", groupId)
      .neq("status", "cancelled")
      .order("created_at", { ascending: false });
    if (queryError) {
      setError(queryError.message.includes("quick_plans") ? t("quickPlan.migrationRequired") : queryError.message);
    } else {
      const normalized = normalizePlans(data || []);
      setPlans(normalized);
      const requestedPlan = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("plan") : "";
      setSelectedPlanId(current => normalized.some(plan => plan.id === current) ? current : normalized.find(plan => plan.id === requestedPlan)?.id || normalized[0]?.id || "");
      setError("");
    }
    setLoading(false);
  }, [groupId, t]);

  useEffect(() => {
    void loadPlans();
    const channel = supabase.channel(`quick-plans-${groupId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "quick_plans", filter: `group_id=eq.${groupId}` }, () => void loadPlans())
      .on("postgres_changes", { event: "*", schema: "public", table: "quick_plan_options" }, () => void loadPlans())
      .on("postgres_changes", { event: "*", schema: "public", table: "quick_plan_votes" }, () => void loadPlans())
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [groupId, loadPlans]);

  const selectedPlan = plans.find(plan => plan.id === selectedPlanId) || plans[0];

  return <>
    <section className="quickPlanLaunch">
      <div>
        <span className="quickPlanOrb"><Sparkles/></span>
        <div><small>QUICK PLAN · v5.5</small><h2>Găsește momentul potrivit, instant.</h2><p>Circle analizează calendarul grupului și pornește votarea pe cele mai bune variante.</p></div>
      </div>
      <button className="primary quickPlanLaunchButton" onClick={() => setWizardOpen(true)}><CalendarCheck/> Găsește următoarea dată <ChevronRight/></button>
    </section>

    <section className="hubSection quickPlansSection" id="quick-plan">
      <header><div><small>DECIZII ÎMPREUNĂ</small><h2>Planuri în desfășurare</h2><p>Propuneri, progresul răspunsurilor și recomandarea curentă.</p></div><span className="quickPlanCount">{plans.filter(plan => ["voting","recommended"].includes(plan.status)).length} active</span></header>
      {loading ? <QuickPlanSkeleton/> : error ? <div className="quickPlanError"><CircleHelp/><p>{error}</p></div> : plans.length ? <>
        <div className="quickPlanTabs">{plans.map(plan => {
          const progress = responseProgress(plan, memberIds.length);
          const status = displayPlanStatus(plan);
          return <button key={plan.id} className={plan.id === selectedPlan?.id ? "active" : ""} onClick={() => setSelectedPlanId(plan.id)}>
            <span>{plan.activity_emoji}</span><div><strong>{plan.title}</strong><small>{t("quickPlan.availability.answered", { count: progress.respondedCount, total: memberIds.length })}</small></div><i>{t(`quickPlan.availability.${status === "finalized" ? "finalized" : status === "recommended" ? "recommended" : "voting"}`)}</i>
          </button>;
        })}</div>
        {selectedPlan && <QuickPlanResults plan={selectedPlan} currentUserId={currentUserId} memberIds={memberIds} memberNames={memberNames} onChanged={loadPlans}/>}
      </> : <div className="quickPlanEmpty"><span>✨</span><h3>Niciun plan activ</h3><p>Creează primul Quick Plan și înlocuiește zeci de mesaje cu un vot simplu.</p><button className="secondary" onClick={() => setWizardOpen(true)}><Plus/> Plan nou</button></div>}
    </section>

    {wizardOpen && <QuickPlanWizard
      groupId={groupId}
      currentUserId={currentUserId}
      memberIds={memberIds}
      events={events}
      vacations={vacations}
      onClose={() => setWizardOpen(false)}
      onCreated={async planId => { setWizardOpen(false); await loadPlans(); setSelectedPlanId(planId); }}
    />}
  </>;
}

function QuickPlanWizard({
  groupId, currentUserId, memberIds, events, vacations, onClose, onCreated,
}: {
  groupId: string; currentUserId: string; memberIds: string[]; events: EventItem[]; vacations: Vacation[];
  onClose: () => void; onCreated: (planId: string) => Promise<void>;
}) {
  const { localeTag, t } = useI18n();
  const defaultEnd = shiftIsoDate(today(), 60);
  const [step, setStep] = useState(1);
  const [activity, setActivity] = useState<(typeof ACTIVITIES)[number] | null>(null);
  const [customActivity, setCustomActivity] = useState("");
  const [searchStart, setSearchStart] = useState(today());
  const [searchEnd, setSearchEnd] = useState(defaultEnd);
  const [durationDays, setDurationDays] = useState(2);
  const [customDuration, setCustomDuration] = useState(4);
  const [preference, setPreference] = useState<QuickPlanPreference>("any");
  const [minimumParticipants, setMinimumParticipants] = useState(Math.max(2, memberIds.length - 1));
  const [finding, setFinding] = useState(false);
  const [searchPhase, setSearchPhase] = useState(0);
  const [error, setError] = useState("");
  const title = customActivity.trim() || activity?.[2] || "";
  const emoji = activity?.[1] || "✨";
  const valid = step === 1 ? Boolean(title) : step === 2 ? searchStart <= searchEnd : true;
  const unavailableMembers = Math.max(0, memberIds.length - minimumParticipants);
  const participantContext = unavailableMembers === 0
    ? t("quickPlan.allRequired")
    : unavailableMembers === 1
      ? t("quickPlan.oneMayMiss")
      : unavailableMembers > 1
        ? t("quickPlan.severalMayMiss", { count: unavailableMembers })
        : t("quickPlan.threshold", { count: minimumParticipants });

  useEffect(() => {
    if (!finding) { setSearchPhase(0); return; }
    const timer = window.setInterval(() => setSearchPhase(current => Math.min(3, current + 1)), 180);
    return () => window.clearInterval(timer);
  }, [finding]);

  async function findDates() {
    if (finding) return;
    const startedAt = Date.now();
    setFinding(true);
    setError("");
    try {
      const eventIds = events.map(event => event.id);
      const { data: rsvps, error: rsvpError } = eventIds.length
        ? await supabase.from("event_rsvps").select("event_id,user_id,status").in("event_id", eventIds)
        : { data: [], error: null };
      if (rsvpError) throw new Error(t("quickPlan.errors.rsvps"));
      const options = calculateQuickPlanOptions({
        searchStart, searchEnd, durationDays, preference, minimumParticipants,
        memberIds, events, eventRsvps: (rsvps || []) as any, vacations,
      });
      if (!options.length) throw new Error(t("quickPlan.noOptions"));
      const { data: plan, error: planError } = await supabase.from("quick_plans").insert({
        group_id: groupId, created_by: currentUserId, title,
        activity_key: activity?.[0] || "custom", activity_emoji: emoji,
        search_start: searchStart, search_end: searchEnd, duration_days: durationDays,
        preference, minimum_participants: minimumParticipants,
      }).select().single();
      if (planError || !plan) throw new Error(planError?.message.includes("quick_plans") ? t("quickPlan.migrationRequired") : t("quickPlan.errors.create"));
      const { error: optionsError } = await supabase.from("quick_plan_options").insert(options.map(option => ({ ...option, plan_id: plan.id })));
      if (optionsError) {
        await supabase.from("quick_plans").delete().eq("id", plan.id);
        throw new Error(t("quickPlan.errors.options"));
      }
      const remaining = 620 - (Date.now() - startedAt);
      if (remaining > 0) await new Promise(resolve => window.setTimeout(resolve, remaining));
      await onCreated(plan.id);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("quickPlan.errors.generic"));
    } finally {
      setFinding(false);
    }
  }

  return <div className="quickPlanModalBack">
    <section className="quickPlanWizard">
      <header><div><small>QUICK PLAN</small><strong>{step} / 5</strong></div><button className="iconButton" onClick={onClose}><X/></button></header>
      <div className="quickPlanProgress">{[1,2,3,4,5].map(value => <span key={value} className={value <= step ? "active" : ""}/>)}</div>
      <div className="quickPlanWizardBody">
        {step === 1 && <div className="quickPlanStep"><small>PASUL 1</small><h2>Ce vrem să facem?</h2><p>Alege o idee sau scrie planul vostru.</p><div className="activityGrid">{ACTIVITIES.map(option => <button key={option[0]} className={activity?.[0] === option[0] && !customActivity ? "active" : ""} onClick={() => { setActivity(option); setCustomActivity(""); }}><span>{option[1]}</span><strong>{option[2]}</strong></button>)}</div><label className="quickCustomInput"><Sparkles/><input value={customActivity} onChange={event => { setCustomActivity(event.target.value); if (event.target.value) setActivity(null); }} placeholder="Altceva..."/></label></div>}
        {step === 2 && <div className="quickPlanStep"><small>PASUL 2</small><h2>În ce perioadă căutăm?</h2><p>Vom analiza fiecare interval posibil dintre aceste date.</p><div className="quickDateRange"><label><span>DE LA</span><input type="date" min={today()} value={searchStart} onChange={event => setSearchStart(event.target.value)}/></label><i>—</i><label><span>PÂNĂ LA</span><input type="date" min={searchStart} value={searchEnd} onChange={event => setSearchEnd(event.target.value)}/></label></div></div>}
        {step === 3 && <div className="quickPlanStep"><small>PASUL 3</small><h2>Cât durează?</h2><p>Perioadele propuse vor avea exact durata aleasă.</p><div className="durationGrid">{DURATIONS.map(option => <button key={option[0]} className={durationDays === option[2] ? "active" : ""} onClick={() => setDurationDays(option[2])}><Clock3/><strong>{option[1]}</strong><small>{option[2]} {option[2] === 1 ? "zi" : "zile"}</small></button>)}<button className={!DURATIONS.some(option => option[2] === durationDays) ? "active" : ""} onClick={() => setDurationDays(customDuration)}><Plus/><strong>Personalizat</strong><small>{customDuration} zile</small></button></div><label className="customDuration">Durată personalizată<input type="number" min={1} max={31} value={customDuration} onChange={event => { const value = Number(event.target.value); setCustomDuration(value); setDurationDays(value); }}/></label></div>}
        {step === 4 && <div className="quickPlanStep"><small>PASUL 4</small><h2>Ce zile preferați?</h2><p>Filtrul se aplică întregii durate a planului.</p><div className="preferenceList">{([["weekend","Doar weekend","Sâmbătă și duminică"],["weekdays","Doar zile lucrătoare","Luni până vineri"],["any","Orice","Cea mai bună disponibilitate"]] as const).map(option => <button key={option[0]} className={preference === option[0] ? "active" : ""} onClick={() => setPreference(option[0])}><span>{preference === option[0] && <Check/>}</span><div><strong>{option[1]}</strong><small>{option[2]}</small></div></button>)}</div></div>}
        {step === 5 && <div className="quickPlanStep quickPlanFinalStep"><small>{t("quickPlan.step", { step: 5 })}</small><h2>{t("quickPlan.minimumTitle")}</h2><div className="participantGauge"><div className="participantValue"><strong>{t("quickPlan.people", { count: minimumParticipants })}</strong><span>{participantContext}</span></div><input aria-label={t("quickPlan.minimumTitle")} type="range" min={Math.min(2, memberIds.length)} max={Math.max(2, memberIds.length)} value={minimumParticipants} onChange={event => setMinimumParticipants(Number(event.target.value))}/><div className="rangeLabels"><span>2</span><span>{memberIds.length}</span></div></div><div className="quickPlanSummary"><div className="summaryActivity"><span>{emoji}</span><div><small>{t("quickPlan.summary")}</small><strong>{title}</strong></div></div><dl><div><dt>📅 {t("quickPlan.period")}</dt><dd>{formatPeriod(searchStart, searchEnd, localeTag)}</dd></div><div><dt>⏱ {t("quickPlan.duration")}</dt><dd>{t("common.days", { count: durationDays })}</dd></div><div><dt>👥 {t("quickPlan.minimumTitle")}</dt><dd>{t("quickPlan.minimum", { count: minimumParticipants })}</dd></div></dl></div></div>}
        {error && <div className="quickPlanInlineError">{error}</div>}
      </div>
      <footer><button className="secondary" disabled={step === 1 || finding} onClick={() => setStep(value => value - 1)}><ArrowLeft/> {t("common.back")}</button>{step < 5 ? <button className="primary" disabled={!valid} onClick={() => setStep(value => value + 1)}>{t("common.continue")} <ArrowRight/></button> : <button className="primary findButton" disabled={finding} aria-busy={finding} onClick={() => void findDates()}>{finding ? <><Loader2 className="spin"/> <span key={searchPhase} className="searchPhaseText">{t(`quickPlan.searchPhases.${searchPhase}`)}</span></> : <><Sparkles/> {t("quickPlan.find")}</>}</button>}</footer>
    </section>
  </div>;
}

function QuickPlanResults({ plan, currentUserId, memberIds, memberNames, onChanged }: { plan: QuickPlanWithDetails; currentUserId: string; memberIds: string[]; memberNames: Record<string, string>; onChanged: () => Promise<void> }) {
  const { formatDate, localeTag, t } = useI18n();
  const ownVotes = useMemo(() => plan.options.flatMap(option => option.votes.filter(vote => vote.user_id === currentUserId)), [currentUserId, plan.options]);
  const [selections, setSelections] = useState<Record<string, QuickPlanVoteValue>>({});
  const [comments, setComments] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState(ownVotes.length === 0);
  const [busy, setBusy] = useState("");
  const [feedback, setFeedback] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [eventCreated, setEventCreated] = useState(false);

  useEffect(() => {
    const votes = Object.fromEntries(plan.options.map(option => {
      const own = option.votes.find(vote => vote.user_id === currentUserId);
      return [option.id, own?.vote || "no"];
    })) as Record<string, QuickPlanVoteValue>;
    setSelections(votes);
    setComments(Object.fromEntries(plan.options.map(option => {
      const own = option.votes.find(vote => vote.user_id === currentUserId);
      return [option.id, own?.comment || ""];
    })));
    setEditing(ownVotes.length === 0);
  }, [currentUserId, ownVotes.length, plan.id, plan.options]);

  const ranked = useMemo(() => [...plan.options].sort((left, right) => {
    const voteScore = (option: typeof left) => option.votes.reduce((sum, vote) => sum + (vote.vote === "yes" ? 2 : vote.vote === "maybe" ? 1 : 0), 0);
    return voteScore(right) - voteScore(left) || right.score - left.score;
  }), [plan.options]);
  const progress = responseProgress(plan, memberIds.length);
  const validOptions = validRecommendationOptions(plan, memberIds);
  const validOptionIds = new Set(validOptions.map(option => option.id));
  const everyoneResponded = memberIds.length > 0 && progress.respondedCount === new Set(memberIds).size;
  const noSuitableDate = everyoneResponded && validOptions.length === 0;
  const best = displayPlanStatus(plan) === "recommended"
    ? ranked.find(option => validOptionIds.has(option.id)) || ranked[0]
    : ranked[0];
  const missingNames = memberIds.filter(id => !progress.respondedIds.includes(id)).map(id => memberNames[id] || "Membru");
  const lastUpdated = ownVotes.reduce((latest, vote) => vote.updated_at > latest ? vote.updated_at : latest, "");
  const finalized = displayPlanStatus(plan) === "finalized";
  if (!best) return null;

  async function saveAvailability() {
    if (busy || finalized) return;
    setBusy("availability");
    setFeedback(null);
    const now = new Date().toISOString();
    const rows = plan.options.map(option => ({
      option_id: option.id,
      user_id: currentUserId,
      vote: selections[option.id] || "no",
      comment: comments[option.id]?.trim() || null,
      updated_at: now,
    }));
    const { error } = await supabase.from("quick_plan_votes").upsert(rows, { onConflict: "option_id,user_id" });
    if (error) {
      setFeedback({ kind: "error", text: t("quickPlan.availability.saveError", { message: error.message }) });
    } else {
      await onChanged();
      setEditing(false);
      setFeedback({ kind: "success", text: t("quickPlan.availability.saveSuccess") });
    }
    setBusy("");
  }

  async function createEvent() {
    setBusy("event");
    setFeedback(null);
    const { error } = await supabase.from("events").insert({
      group_id: plan.group_id, created_by: currentUserId, title: `${plan.activity_emoji} ${plan.title}`,
      event_date: best.start_date, location: "", details: `Creat din Quick Plan. Perioadă recomandată: ${formatPeriod(best.start_date, best.end_date, localeTag)}.`,
      theme: "cyan", is_pinned: true,
    });
    if (!error) {
      const { error: statusError } = await supabase.from("quick_plans").update({ status: "finalized", updated_at: new Date().toISOString() }).eq("id", plan.id);
      if (!statusError) {
        setEventCreated(true);
        await onChanged();
      } else setFeedback({ kind: "error", text: statusError.message });
    } else setFeedback({ kind: "error", text: error.message });
    setBusy("");
  }

  return <div className="quickPlanResults">
    {noSuitableDate ? <article className="quickRecommendation noSuitableRecommendation">
      <div className="recommendationGlow"/>
      <header><span><CircleHelp/> {t("quickPlan.availability.result")}</span><i>{t("quickPlan.availability.voteComplete")}</i></header>
      <div className="noSuitableBody"><CircleHelp/><div><h2>{t("quickPlan.availability.noSuitableTitle")}</h2><p>{t("quickPlan.availability.noSuitableText")}</p></div></div>
    </article> : <article className="quickRecommendation">
      <div className="recommendationGlow"/>
      <header><span><Flame/> RECOMANDAREA CIRCLE CALENDAR</span><i>Cea mai bună variantă</i></header>
      <div className="recommendationMain"><div><small>{plan.activity_emoji} {plan.title.toUpperCase()}</small><h2>{formatPeriod(best.start_date, best.end_date, localeTag)}</h2><div className="stars">{"★".repeat(Math.max(1, Math.round(best.score / 20)))}<span>{"★".repeat(5 - Math.max(1, Math.round(best.score / 20)))}</span></div></div><div className="scoreRing" style={{ "--score": `${best.score * 3.6}deg` } as React.CSSProperties}><strong>{best.score}%</strong><span>scor</span></div></div>
      <div className="recommendationMeta"><span><Users/><strong>{t("quickPlan.availability.answered", { count: progress.respondedCount, total: memberIds.length })}</strong></span><span><MessageCircle/><strong>{t("quickPlan.availability.missing", { count: progress.missingCount })}</strong></span>{Object.entries(best.context?.countries || {}).slice(0,2).map(([country,count]) => <span key={country}>📍 <strong>{count}</strong> în {country}</span>)}</div>
      {missingNames.length > 0 && <p className="missingRespondents">{t("quickPlan.availability.missingNames", { names: missingNames.join(", ") })}</p>}
      {currentUserId === plan.created_by && displayPlanStatus(plan) === "recommended" && <button className="primary" disabled={busy === "event" || eventCreated || finalized} onClick={() => void createEvent()}><CalendarCheck/> {eventCreated || finalized ? "Eveniment creat" : t("quickPlan.availability.confirm")}</button>}
    </article>}

    <section className="availabilityEditor">
      <header><div><small>{t("quickPlan.availability.yourAnswer")}</small><h3>{t("quickPlan.availability.title")}</h3>{ownVotes.length > 0 && <span className="availabilitySaved"><Check/> {t("quickPlan.availability.saved")}{lastUpdated ? ` · ${t("quickPlan.availability.lastChanged", { date: formatDate(lastUpdated, { dateStyle: "medium", timeStyle: "short" }) })}` : ""}</span>}</div>{ownVotes.length > 0 && !editing && !finalized && <button className="secondary" onClick={() => { setEditing(true); setFeedback(null); }}>{t("quickPlan.availability.edit")}</button>}</header>
      <div className="quickOptionList">{ranked.map((option, index) => {
        const selected = selections[option.id] || "no";
        const voters = new Set(option.votes.map(vote => vote.user_id)).size;
        return <article className={`quickOptionCard ${index === 0 ? "best" : ""}`} key={option.id}>
          <header><div><span className="optionRank">#{index + 1}</span><div><h3>{formatPeriod(option.start_date, option.end_date, localeTag)}</h3><span className="optionStars">{"★".repeat(Math.max(1, Math.round(option.score / 20)))}</span></div></div><strong>{option.score}%</strong></header>
          <div className="optionAvailability"><span>{option.available_count} din {option.total_members} disponibili</span><div><i style={{ width: `${(voters / Math.max(1, option.total_members)) * 100}%` }}/></div><small>{voters} răspunsuri</small></div>
          <div className="voteButtons"><button className={selected === "yes" ? "active yes" : ""} disabled={!editing || Boolean(busy)} onClick={() => setSelections(current => ({ ...current, [option.id]: "yes" }))}><ThumbsUp/> {t("quickPlan.availability.available")}</button><button className={selected === "maybe" ? "active maybe" : ""} disabled={!editing || Boolean(busy)} onClick={() => setSelections(current => ({ ...current, [option.id]: "maybe" }))}><CircleHelp/> {t("quickPlan.availability.maybe")}</button><button className={selected === "no" ? "active no" : ""} disabled={!editing || Boolean(busy)} onClick={() => setSelections(current => ({ ...current, [option.id]: "no" }))}><ThumbsDown/> {t("quickPlan.availability.unavailable")}</button></div>
          <label className="voteComment"><MessageCircle/><input disabled={!editing || Boolean(busy)} value={comments[option.id] || ""} onChange={event => setComments(current => ({ ...current, [option.id]: event.target.value }))} placeholder={t("quickPlan.availability.comment")}/></label>
        </article>;
      })}</div>
      {feedback && <p className={`availabilityFeedback ${feedback.kind}`} role="status">{feedback.kind === "success" && <Check/>}{feedback.text}</p>}
      {editing && !finalized && <button className="primary saveAvailabilityButton" disabled={Boolean(busy)} onClick={() => void saveAvailability()}>{busy === "availability" ? <Loader2 className="spin"/> : <Check/>} {busy === "availability" ? t("quickPlan.availability.saving") : t("quickPlan.availability.save")}</button>}
    </section>
  </div>;
}

export function PendingQuickPlans({ groups, currentUserId }: { groups: Group[]; currentUserId: string }) {
  const { t } = useI18n();
  const [plans, setPlans] = useState<QuickPlanWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const groupIds = useMemo(() => groups.map(group => group.id), [groups]);
  const load = useCallback(async () => {
    if (!groupIds.length) { setPlans([]); setLoading(false); return; }
    const { data, error: queryError } = await supabase.from("quick_plans").select("*,quick_plan_options(*,quick_plan_votes(*))").in("group_id", groupIds).in("status", ["voting","recommended"]).order("created_at", { ascending: false });
    if (queryError) {
      setError(queryError.message);
      setPlans([]);
    } else {
      setPlans(normalizePlans(data || []).filter(plan => needsUserResponse(plan, currentUserId)));
      setError("");
    }
    setLoading(false);
  }, [currentUserId, groupIds]);
  useEffect(() => { void load(); }, [load]);
  const groupById = new Map(groups.map(group => [group.id, group]));
  return <section className="panel pendingPlans">
    <header><div><small>ACȚIUNE NECESARĂ</small><h3>Necesită răspuns</h3></div>{plans.length > 0 && <span className="pendingBadge">{plans.length}</span>}</header>
    {loading ? <div className="pendingSkeleton"><i/><i/></div> : error ? <div className="pendingLoadError"><CircleHelp/><span>{t("quickPlan.availability.checkFailed")}</span></div> : plans.length ? <div className="pendingPlanList">{plans.map(plan => <a href={`/groups/${plan.group_id}?plan=${plan.id}#quick-plan`} key={plan.id}><span>{plan.activity_emoji}</span><div><strong>{plan.title}</strong><small>{groupById.get(plan.group_id)?.name} · {t("quickPlan.availability.setAvailability")}</small></div><b>{t("quickPlan.availability.respond")}</b><ChevronRight/></a>)}</div> : <div className="pendingEmpty"><Check/><div><strong>Ești la zi</strong><small>Nu există planuri care așteaptă votul tău.</small></div></div>}
  </section>;
}

function QuickPlanSkeleton() {
  return <div className="quickPlanSkeleton"><i/><i/><i/></div>;
}
