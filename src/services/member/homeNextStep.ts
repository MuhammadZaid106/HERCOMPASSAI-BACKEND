/**
 * Deterministic home recommendation.
 * Software picks a template. No model is involved.
 *
 * These cards cannot personalise advice — that is what the Gateway's
 * `personalizedRecommendations` are for. So this template never claims to be a
 * suggestion for the member's health. Each one either points at a task the
 * member can finish now, or points at the surface where their real
 * evidence-informed steps already live. Home is a navigation card, not a
 * treatment plan, and must not read like one.
 */

export type CheckInTab = "symptoms" | "mood" | "sleep" | "energy";

export interface HomeNextStep {
  title: string;
  body: string;
  href: string;
}

interface FocusStep {
  title: string;
  body: string;
}

const FOCUS_STEPS: Record<string, FocusStep> = {
  "Sleep deeply through the night": {
    title: "Your sleep steps are on your Snapshot",
    body: "Your Snapshot focus is sleep. The steps picked for this focus, and how to start each one, are in section 6 of your Snapshot.",
  },
  "Restorative Sleep & Evening Wind-Down": {
    title: "Your sleep steps are on your Snapshot",
    body: "Your Snapshot focus is restorative sleep. The steps picked for this focus, and how to start each one, are in section 6 of your Snapshot.",
  },
  "Have steady, dependable daytime energy": {
    title: "Your energy steps are on your Snapshot",
    body: "Your Snapshot focus is daytime energy. The steps picked for this focus, and how to start each one, are in section 6 of your Snapshot.",
  },
  "Metabolic Energy & Low-Impact Movement": {
    title: "Your energy steps are on your Snapshot",
    body: "Your Snapshot focus is energy and gentle movement. The steps picked for this focus, and how to start each one, are in section 6 of your Snapshot.",
  },
  "Feel more emotionally balanced & patient": {
    title: "Your mood steps are on your Snapshot",
    body: "Your Snapshot focus is emotional balance. The steps picked for this focus, and how to start each one, are in section 6 of your Snapshot.",
  },
  "Nervous System Regulation & Breathwork": {
    title: "Your mood steps are on your Snapshot",
    body: "Your Snapshot focus is steadier days. The steps picked for this focus, and how to start each one, are in section 6 of your Snapshot.",
  },
  "Understand my symptoms and hormonal triggers": {
    title: "Your symptom steps are on your Snapshot",
    body: "Your Snapshot focus is symptom patterns. The steps picked for this focus, and how to start each one, are in section 6 of your Snapshot.",
  },
  "Vasomotor Comfort & Cooling Support": {
    title: "Your comfort steps are on your Snapshot",
    body: "Your Snapshot focus is comfort through the day. The steps picked for this focus, and how to start each one, are in section 6 of your Snapshot.",
  },
  "Help my partner understand and support me": {
    title: "Decide what a partner may see",
    body: "Your Snapshot focus includes support from someone close. Sharing stays optional, and raw logs stay private.",
  },
  "Improve my relationship": {
    title: "Decide what a partner may see",
    body: "Your Snapshot focus includes your relationship. You choose whether any summary is shared.",
  },
  "Feel better and more comfortable day to day": {
    title: "Your day-to-day steps are on your Snapshot",
    body: "Your Snapshot focus is day-to-day comfort. The steps picked for this focus, and how to start each one, are in section 6 of your Snapshot.",
  },
  "Build sustainable, hormone-friendly routines": {
    title: "Your routine steps are on your Snapshot",
    body: "Your Snapshot focus is a routine you can keep. The steps picked for this focus, and how to start each one, are in section 6 of your Snapshot.",
  },
  "Become confident managing this stage of life": {
    title: "Revisit what the Snapshot noticed",
    body: "Your Snapshot is the baseline. Progress shows what your later logs add to it.",
  },
  "Holistic Rhythm & Daily Baseline": {
    title: "Your baseline steps are on your Snapshot",
    body: "Your Snapshot focus is a whole-day baseline. The steps picked for this focus, and how to start each one, are in section 6 of your Snapshot.",
  },
};

const DEFAULT_STEP: FocusStep = {
  title: "Your steps are on your Snapshot",
  body: "Your Snapshot set a focus. The steps picked for that focus, and how to start each one, are in section 6 of your Snapshot.",
};

function stepForFocus(focus: string | null): FocusStep {
  if (focus && FOCUS_STEPS[focus]) return FOCUS_STEPS[focus];
  const lowered = (focus ?? "").toLowerCase();
  if (lowered.includes("sleep")) return FOCUS_STEPS["Restorative Sleep & Evening Wind-Down"];
  if (lowered.includes("energy") || lowered.includes("movement")) {
    return FOCUS_STEPS["Metabolic Energy & Low-Impact Movement"];
  }
  if (lowered.includes("mood") || lowered.includes("emotion") || lowered.includes("breath")) {
    return FOCUS_STEPS["Nervous System Regulation & Breathwork"];
  }
  if (lowered.includes("symptom") || lowered.includes("vasomotor") || lowered.includes("cooling")) {
    return FOCUS_STEPS["Vasomotor Comfort & Cooling Support"];
  }
  if (lowered.includes("partner") || lowered.includes("relationship")) {
    return FOCUS_STEPS["Help my partner understand and support me"];
  }
  return DEFAULT_STEP;
}

export function buildHomeNextStep(input: {
  checkInComplete: boolean;
  firstMissingTab: CheckInTab | null;
  snapshotAvailable: boolean;
  dominantFocusArea: string | null;
}): HomeNextStep {
  if (!input.checkInComplete && input.firstMissingTab) {
    return {
      title: "Finish today's check-in",
      body: "Four short logs — symptoms, mood, sleep, and energy — give today a complete picture.",
      href: `/app/track?tab=${input.firstMissingTab}`,
    };
  }

  if (!input.snapshotAvailable) {
    return {
      title: "Create your Snapshot",
      body: "A 5-minute Snapshot gives this page a focus drawn from your answers, not a diagnosis.",
      href: "/onboarding",
    };
  }

  const step = stepForFocus(input.dominantFocusArea);
  const partnerStep = step.title === "Decide what a partner may see";
  return {
    title: step.title,
    body: step.body,
    href: partnerStep ? "/app/partner" : "/app/snapshot",
  };
}
