// Emojis that users are allowed to react with. Shared between the
// client (picker) and the server (validation) so they never drift apart.
export const ALLOWED_REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🙏"] as const;

export type ReactionEmoji = (typeof ALLOWED_REACTIONS)[number];

export const isAllowedReaction = (emoji: unknown): emoji is ReactionEmoji =>
  typeof emoji === "string" &&
  (ALLOWED_REACTIONS as readonly string[]).includes(emoji);
