import type {
  EventItem, QuickPlanContext, QuickPlanPreference, Vacation,
} from "@/types/database";

type EventRsvp = { event_id: string; user_id: string; status: "yes" | "maybe" | "no" };

export type CandidateOption = {
  start_date: string;
  end_date: string;
  rank: number;
  score: number;
  available_count: number;
  total_members: number;
  context: QuickPlanContext;
};

function parseDate(value: string) {
  return new Date(`${value}T12:00:00Z`);
}

export function shiftIsoDate(value: string, days: number) {
  const date = parseDate(value);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function overlaps(startA: string, endA: string, startB: string, endB: string) {
  return startA <= endB && endA >= startB;
}

function preferenceMatches(start: string, duration: number, preference: QuickPlanPreference) {
  const weekdays = Array.from({ length: duration }, (_, index) => parseDate(shiftIsoDate(start, index)).getUTCDay());
  if (preference === "weekend") return weekdays.every(day => day === 0 || day === 6);
  if (preference === "weekdays") return weekdays.every(day => day >= 1 && day <= 5);
  return true;
}

function weekendAffinity(start: string, duration: number) {
  const weekendDays = Array.from({ length: duration }, (_, index) => parseDate(shiftIsoDate(start, index)).getUTCDay())
    .filter(day => day === 0 || day === 6).length;
  return weekendDays / duration;
}

export function calculateQuickPlanOptions(input: {
  searchStart: string;
  searchEnd: string;
  durationDays: number;
  preference: QuickPlanPreference;
  minimumParticipants: number;
  memberIds: string[];
  events: EventItem[];
  eventRsvps: EventRsvp[];
  vacations: Vacation[];
}): CandidateOption[] {
  const {
    searchStart, searchEnd, durationDays, preference, minimumParticipants,
    memberIds, events, eventRsvps, vacations,
  } = input;
  const candidates: Omit<CandidateOption, "rank">[] = [];

  for (let start = searchStart; shiftIsoDate(start, durationDays - 1) <= searchEnd; start = shiftIsoDate(start, 1)) {
    if (!preferenceMatches(start, durationDays, preference)) continue;
    const end = shiftIsoDate(start, durationDays - 1);
    const conflictingEvents = events.filter(event => overlaps(start, end, event.event_date, event.event_date));
    const unavailable = new Set<string>();
    conflictingEvents.forEach(event => {
      unavailable.add(event.created_by);
      eventRsvps
        .filter(rsvp => rsvp.event_id === event.id && rsvp.status !== "no")
        .forEach(rsvp => unavailable.add(rsvp.user_id));
    });
    const availableCount = memberIds.filter(id => !unavailable.has(id)).length;
    if (availableCount < minimumParticipants) continue;

    const countries: Record<string, number> = {};
    vacations.filter(vacation => overlaps(start, end, vacation.start_date, vacation.end_date))
      .forEach(vacation => { countries[vacation.country] = (countries[vacation.country] || 0) + 1; });
    const availabilityRatio = memberIds.length ? availableCount / memberIds.length : 0;
    const conflictPenalty = Math.min(conflictingEvents.length * 8, 24);
    const weekendBonus = preference === "any" ? Math.round(weekendAffinity(start, durationDays) * 8) : 8;
    const score = Math.max(1, Math.min(100, Math.round(availabilityRatio * 92 + weekendBonus - conflictPenalty)));

    candidates.push({
      start_date: start,
      end_date: end,
      score,
      available_count: availableCount,
      total_members: memberIds.length,
      context: { conflicts: conflictingEvents.length, countries },
    });
  }

  return candidates
    .sort((a, b) => b.score - a.score || b.available_count - a.available_count || a.start_date.localeCompare(b.start_date))
    .slice(0, 5)
    .map((candidate, index) => ({ ...candidate, rank: index + 1 }));
}
