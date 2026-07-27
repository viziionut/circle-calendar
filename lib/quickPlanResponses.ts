import type { QuickPlanStatus, QuickPlanWithDetails } from "@/types/database";

export const RESPONSE_OPEN_STATUSES: QuickPlanStatus[] = ["voting", "recommended"];

export function respondedUserIds(plan: QuickPlanWithDetails) {
  return new Set(plan.options.flatMap(option => option.votes.map(vote => vote.user_id)));
}

export function hasUserResponse(plan: QuickPlanWithDetails, userId: string) {
  return respondedUserIds(plan).has(userId);
}

export function needsUserResponse(plan: QuickPlanWithDetails, currentUserId: string) {
  return RESPONSE_OPEN_STATUSES.includes(plan.status) && !hasUserResponse(plan, currentUserId);
}

export function responseProgress(plan: QuickPlanWithDetails, totalMembers: number) {
  const responded = respondedUserIds(plan);
  return {
    respondedIds: [...responded],
    respondedCount: responded.size,
    missingCount: Math.max(0, totalMembers - responded.size),
  };
}

export function displayPlanStatus(plan: QuickPlanWithDetails): QuickPlanStatus {
  if (plan.status === "completed") return "finalized";
  return plan.status;
}

export function validRecommendationOptions(plan: QuickPlanWithDetails, eligibleUserIds: string[]) {
  const eligible = new Set(eligibleUserIds);
  return plan.options.filter(option => {
    const availableUsers = new Set(option.votes
      .filter(vote => eligible.has(vote.user_id) && (vote.vote === "yes" || vote.vote === "maybe"))
      .map(vote => vote.user_id));
    return availableUsers.size >= plan.minimum_participants;
  });
}

export function recommendationStatus(plan: QuickPlanWithDetails, eligibleUserIds: string[]): "voting" | "recommended" {
  const eligible = [...new Set(eligibleUserIds)];
  const responded = respondedUserIds(plan);
  const everyoneResponded = eligible.length > 0 && eligible.every(userId => responded.has(userId));
  return everyoneResponded && validRecommendationOptions(plan, eligible).length > 0 ? "recommended" : "voting";
}
