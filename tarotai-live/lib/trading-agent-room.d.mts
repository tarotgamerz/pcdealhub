export type AgentRoomMessageStatus = "CLEAR" | "FLAGGED" | "BLOCKED";
export type AgentRoomMessageReview = {
  status: AgentRoomMessageStatus;
  reasons: string[];
  text: string;
  notEligibleForTradeApproval: true;
  reviewedBy: "Agent Operations Supervisor";
  reviewMode: "per-message trading-only policy check";
  reviewedAt: string;
};
export const ROOM_TRADING_TOPIC_PATTERN: RegExp;
export function reviewAgentRoomMessage(input: {
  role: string;
  round: number;
  target: string;
  text: string;
  providerFailed?: boolean;
}): AgentRoomMessageReview;
