export const MODELS = {
  orchestrator: process.env.OPERATOR_MODEL ?? "openai/gpt-5.6-terra-fast",
  researcher: "openai/gpt-5.6-terra-fast",
  reviewer: "openai/gpt-5.6-terra-fast",
} as const;
