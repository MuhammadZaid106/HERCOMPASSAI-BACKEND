/**
 * Deterministic home recommendation.
 * Software picks a template. No model is involved.
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
    title: "Keep one evening wind-down",
    body: "Your Snapshot focus is sleep. A consistent wind-down is one small step to try this week.",
  },
  "Restorative Sleep & Evening Wind-Down": {
    title: "Keep one evening wind-down",
    body: "Your Snapshot focus is restorative sleep. A consistent wind-down is one small step to try this week.",
  },
  "Have steady, dependable daytime energy": {
    title: "Notice what the day asks of you",
    body: "Your Snapshot focus is daytime energy. Logging energy on the days it dips makes the pattern easier to see.",
  },
  "Metabolic Energy & Low-Impact Movement": {
    title: "Notice what the day asks of you",
    body: "Your Snapshot focus is energy and gentle movement. Short logs on low-energy days keep that picture honest.",
  },
  "Feel more emotionally balanced & patient": {
    title: "Give mood a daily mark",
    body: "Your Snapshot focus is emotional balance. A quick mood log is enough to see whether the week is shifting.",
  },
  "Nervous System Regulation & Breathwork": {
    title: "Give mood a daily mark",
    body: "Your Snapshot focus is steadier days. A quick mood log shows whether that picture is holding.",
  },
  "Understand my symptoms and hormonal triggers": {
    title: "Keep symptom logs specific",
    body: "Your Snapshot focus is symptom patterns. Naming what showed up today is more useful than a long note.",
  },
  "Vasomotor Comfort & Cooling Support": {
    title: "Keep symptom logs specific",
    body: "Your Snapshot focus is comfort through the day. Logging what showed up keeps that pattern visible.",
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
    title: "Stay with one daily check-in",
    body: "Your Snapshot focus is day-to-day comfort. A short check-in is how that picture stays current.",
  },
  "Build sustainable, hormone-friendly routines": {
    title: "Stay with one daily check-in",
    body: "Your Snapshot focus is a routine you can keep. The check-in is the routine this page can see.",
  },
  "Become confident managing this stage of life": {
    title: "Revisit what the Snapshot noticed",
    body: "Your Snapshot is the baseline. Progress shows what your later logs add to it.",
  },
  "Holistic Rhythm & Daily Baseline": {
    title: "Stay with one daily check-in",
    body: "Your Snapshot is a whole-day baseline. A short check-in is how that picture stays current.",
  },
};

const DEFAULT_STEP: FocusStep = {
  title: "Stay with one daily check-in",
  body: "Your Snapshot set a focus. A short check-in is how this page keeps that picture current.",
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
