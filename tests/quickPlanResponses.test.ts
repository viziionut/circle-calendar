import assert from "node:assert/strict";
import test from "node:test";
import {
  displayPlanStatus, hasUserResponse, needsUserResponse, recommendationStatus,
  responseProgress, validRecommendationOptions,
} from "../lib/quickPlanResponses.ts";
import type { QuickPlanWithDetails, QuickPlanVoteValue } from "../types/database.ts";

function plan(status: QuickPlanWithDetails["status"] = "voting", votes: Array<[string, string, QuickPlanVoteValue]> = []): QuickPlanWithDetails {
  return {
    id: "plan-1", group_id: "group-1", created_by: "owner", title: "Test",
    activity_key: "custom", activity_emoji: "✨", search_start: "2026-08-01",
    search_end: "2026-08-31", duration_days: 1, preference: "any",
    minimum_participants: 2, status, created_at: "", updated_at: "",
    options: ["option-1", "option-2"].map((id, rank) => ({
      id, plan_id: "plan-1", start_date: "2026-08-01", end_date: "2026-08-01",
      rank: rank + 1, score: 90, available_count: 2, total_members: 3,
      context: { conflicts: 0, countries: {} }, created_at: "",
      votes: votes.filter(([optionId]) => optionId === id).map(([, userId, vote]) => ({
        option_id: id, user_id: userId, vote, comment: null, updated_at: "2026-07-27T12:00:00Z",
      })),
    })),
  };
}

test("needsUserResponse returns true for an active unanswered plan", () => {
  assert.equal(needsUserResponse(plan(), "user-1"), true);
});

test("a persisted response is recognized after data reload", () => {
  const reloaded = plan("recommended", [["option-1", "user-1", "yes"]]);
  assert.equal(hasUserResponse(reloaded, "user-1"), true);
  assert.equal(needsUserResponse(reloaded, "user-1"), false);
});

test("editing the same option does not change respondent counting", () => {
  const edited = plan("recommended", [["option-1", "user-1", "maybe"], ["option-2", "user-1", "no"]]);
  assert.deepEqual(responseProgress(edited, 3), {
    respondedIds: ["user-1"], respondedCount: 1, missingCount: 2,
  });
});

test("respondents are counted as users, not selected options", () => {
  const withResponses = plan("recommended", [
    ["option-1", "user-1", "yes"], ["option-2", "user-1", "maybe"],
    ["option-1", "user-2", "no"],
  ]);
  assert.equal(responseProgress(withResponses, 3).respondedCount, 2);
});

test("the first response keeps the plan voting", () => {
  const oneResponse = plan("voting", [["option-1", "user-1", "yes"]]);
  assert.equal(recommendationStatus(oneResponse, ["user-1", "user-2", "user-3"]), "voting");
  assert.equal(displayPlanStatus(oneResponse), "voting");
});

test("partial responses keep the plan voting", () => {
  const partial = plan("voting", [["option-1", "user-1", "yes"], ["option-1", "user-2", "maybe"]]);
  assert.equal(recommendationStatus(partial, ["user-1", "user-2", "user-3"]), "voting");
});

test("the last eligible member can produce recommended", () => {
  const complete = plan("voting", [
    ["option-1", "user-1", "yes"], ["option-1", "user-2", "maybe"],
    ["option-2", "user-3", "no"],
  ]);
  assert.equal(recommendationStatus(complete, ["user-1", "user-2", "user-3"]), "recommended");
});

test("no valid option does not create a false recommendation", () => {
  const unavailable = plan("voting", [
    ["option-1", "user-1", "yes"], ["option-2", "user-2", "no"],
    ["option-2", "user-3", "no"],
  ]);
  assert.equal(validRecommendationOptions(unavailable, ["user-1", "user-2", "user-3"]).length, 0);
  assert.equal(recommendationStatus(unavailable, ["user-1", "user-2", "user-3"]), "voting");
});

test("finalized appears only as an explicit persisted state", () => {
  assert.equal(displayPlanStatus(plan("finalized")), "finalized");
  assert.equal(displayPlanStatus(plan("voting", [["option-1", "user-1", "yes"]])), "voting");
  assert.equal(needsUserResponse(plan("finalized"), "user-1"), false);
});

test("pending visibility changes after a persistent response", () => {
  assert.equal(needsUserResponse(plan("voting"), "user-1"), true);
  assert.equal(needsUserResponse(plan("voting", [["option-1", "user-1", "no"]]), "user-1"), false);
});

test("recommended remains pending only for users without a response", () => {
  const recommended = plan("recommended", [["option-1", "user-1", "yes"]]);
  assert.equal(needsUserResponse(recommended, "user-2"), true);
  assert.equal(needsUserResponse(recommended, "user-1"), false);
  assert.equal(needsUserResponse(plan("cancelled"), "user-1"), false);
  assert.equal(needsUserResponse(plan("completed"), "user-1"), false);
});
