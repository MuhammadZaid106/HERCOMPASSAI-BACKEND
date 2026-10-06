export interface ActivitySuggestion {
  key: string;
  label: string;
  suggestion: string;
  evidenceId: string;
}

/** The seven shared-activity names from the partner screens. Suggestions only. */
export const ACTIVITY_SUGGESTIONS: ActivitySuggestion[] = [
  {
    key: "walk_together",
    label: "Walk together",
    suggestion: "A short walk side by side is one way to spend time together without turning it into a task.",
    evidenceId: "ev-nams-001",
  },
  {
    key: "relaxation",
    label: "Relaxation",
    suggestion: "A few quiet minutes together can be enough. Keep it optional.",
    evidenceId: "ev-mbsr-011",
  },
  {
    key: "meal_preparation",
    label: "Meal preparation",
    suggestion: "Preparing a simple meal together is a practical way to share the evening.",
    evidenceId: "ev-usda-007",
  },
  {
    key: "conversation",
    label: "Conversation",
    suggestion: "Ask what would be welcome today, then follow that answer.",
    evidenceId: "ev-act-012",
  },
  {
    key: "sleep_routine",
    label: "Sleep routine",
    suggestion: "A calmer wind-down, such as dimmer lights, is a shared routine. It does not promise better sleep.",
    evidenceId: "ev-nams-001",
  },
  {
    key: "fun_activity",
    label: "Fun activity",
    suggestion: "Choose something light you both already enjoy. Keep the plan easy to change.",
    evidenceId: "ev-cbt-010",
  },
  {
    key: "connection",
    label: "Connection",
    suggestion: "A small check-in, without advice, is a way to stay close.",
    evidenceId: "ev-act-012",
  },
];
