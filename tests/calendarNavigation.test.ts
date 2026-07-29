import assert from "node:assert/strict";
import test from "node:test";
import {
  calendarToday, eventNavigationTarget, navigableEvents, nextCalendarEvent,
  previousCalendarEvent, withCalendarMonth, withCalendarYear,
} from "../lib/calendarNavigation.ts";

const events = [
  { id: "other", group_id: "g2", event_date: "2026-08-01", title: "Other" },
  { id: "cancelled", group_id: "g1", event_date: "2026-08-02", title: "Cancelled", status: "cancelled" },
  { id: "first", group_id: "g1", event_date: "2026-09-15", title: "First" },
  { id: "second", group_id: "g1", event_date: "2026-10-01", title: "Second" },
];

test("selecting a month preserves the year", () => {
  assert.equal(withCalendarMonth(new Date(2026, 8, 1), 1).getFullYear(), 2026);
});

test("selecting a year preserves the month", () => {
  assert.equal(withCalendarYear(new Date(2026, 8, 1), 2040).getMonth(), 8);
});

test("today navigates to the current month", () => {
  const result = calendarToday(new Date(2026, 6, 29));
  assert.deepEqual([result.getFullYear(), result.getMonth()], [2026, 6]);
});

test("events are chronological and exclude cancelled or other groups", () => {
  assert.deepEqual(navigableEvents(events, "g1").map(event => event.id), ["first", "second"]);
});

test("previous and next event use the reference date", () => {
  const filtered = navigableEvents(events, "g1");
  assert.equal(nextCalendarEvent(filtered, "2026-09-15")?.id, "second");
  assert.equal(previousCalendarEvent(filtered, "2026-10-01")?.id, "first");
});

test("selecting an event updates month, date and event id", () => {
  const target = eventNavigationTarget(events[2]);
  assert.deepEqual([target.visibleMonth.getFullYear(), target.visibleMonth.getMonth()], [2026, 8]);
  assert.equal(target.selectedDate, "2026-09-15");
  assert.equal(target.selectedEventId, "first");
});

test("empty event collections return an empty state", () => {
  assert.equal(nextCalendarEvent([], "2026-01-01"), null);
  assert.equal(previousCalendarEvent([], "2026-01-01"), null);
});
