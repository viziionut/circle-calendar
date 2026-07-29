export type NavigableEvent = {
  id: string;
  group_id: string;
  event_date: string;
  title: string;
  status?: string | null;
};

export function withCalendarMonth(current: Date, month: number) {
  return new Date(current.getFullYear(), month, 1);
}

export function withCalendarYear(current: Date, year: number) {
  return new Date(year, current.getMonth(), 1);
}

export function calendarToday(now = new Date()) {
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

export function navigableEvents<T extends NavigableEvent>(events: T[], groupId: string) {
  return events
    .filter(event => event.group_id === groupId && event.status !== "cancelled")
    .sort((left, right) => left.event_date.localeCompare(right.event_date));
}

export function nextCalendarEvent<T extends NavigableEvent>(events: T[], referenceDate: string) {
  return events.find(event => event.event_date > referenceDate) || null;
}

export function previousCalendarEvent<T extends NavigableEvent>(events: T[], referenceDate: string) {
  return [...events].reverse().find(event => event.event_date < referenceDate) || null;
}

export function eventNavigationTarget(event: NavigableEvent) {
  const date = new Date(`${event.event_date}T12:00:00`);
  return {
    visibleMonth: new Date(date.getFullYear(), date.getMonth(), 1),
    selectedDate: event.event_date,
    selectedEventId: event.id,
  };
}
