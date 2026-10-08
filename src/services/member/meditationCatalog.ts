/**
 * Short practices for the member meditation library.
 *
 * The wording stays inside the approved mindfulness card (ev-mbsr-011, 2022).
 * Software picks the order. A model does not write a session or choose one.
 */

export const MEDITATION_SOURCE = {
  name: "Mindfulness-based stress reduction (MBSR) research",
  year: 2022,
  note: "A named clinician has not signed this card.",
} as const;

export const PLUS_MEDITATION_LINE = "Go deeper with HerCompass Plus.";

export interface MeditationSession {
  slug: string;
  title: string;
  focus: string;
  minutes: number;
  /** Free opens only the evening reset. Plus and Premium open the library. */
  tier: "free" | "plus";
  /** Words in a Snapshot focus that move this session to the front for Plus and Premium. */
  focusHints: string[];
  why: string;
  steps: string[];
}

export const MEDITATION_CATALOG: MeditationSession[] = [
  {
    slug: "five-minute-evening-reset",
    title: "5-Minute Evening Reset",
    focus: "Relaxation",
    minutes: 5,
    tier: "free",
    focusHints: [],
    why: "A brief daily practice is a reasonable place to start. This is a quiet pause, not a treatment.",
    steps: [
      "Sit or lie down somewhere you can be still.",
      "Notice your breath for a few cycles. You do not need to change it.",
      "If your attention wanders, bring it back to the feeling of breathing.",
      "When the timer ends, stay still for a moment before you get up.",
    ],
  },
  {
    slug: "three-minute-breathing-pause",
    title: "3-Minute Breathing Pause",
    focus: "A short daytime pause",
    minutes: 3,
    tier: "plus",
    focusHints: ["stress", "mood", "emotional"],
    why: "A few slow breaths can be a pause in the middle of a day. This does not measure stress or mood.",
    steps: [
      "Pause what you are doing and plant both feet.",
      "Take three slow breaths and let the exhale last a little longer.",
      "Notice your shoulders and soften them if you want to.",
      "When the timer ends, return to what you were doing.",
    ],
  },
  {
    slug: "ten-minute-wind-down",
    title: "10-Minute Wind-Down",
    focus: "A longer evening practice",
    minutes: 10,
    tier: "plus",
    focusHints: ["sleep"],
    why: "A longer evening practice is a wind-down option. It does not treat a sleep condition.",
    steps: [
      "Dim the room if you can, then sit or lie down.",
      "Follow your breath without trying to make it perfect.",
      "Halfway through, rest your attention on the chair or the bed under you.",
      "Stay with that feeling until the timer ends.",
    ],
  },
];

const EVENING_SLUG = "five-minute-evening-reset";

export function meditationBySlug(slug: string): MeditationSession | undefined {
  return MEDITATION_CATALOG.find((item) => item.slug === slug);
}

export function meditationIncluded(plan: string | null | undefined, session: MeditationSession): boolean {
  if (session.tier === "free") return true;
  return plan === "plus" || plan === "premium";
}

function frequentPractice(frequency: string | null | undefined): boolean {
  return frequency === "daily" || frequency === "weekly";
}

function matchedSession(
  focus: string | null | undefined,
  sessions: MeditationSession[],
): MeditationSession | undefined {
  const text = (focus ?? "").toLowerCase();
  if (!text) return undefined;
  return sessions.find(
    (item) => item.slug !== EVENING_SLUG && item.focusHints.some((hint) => text.includes(hint)),
  );
}

export function suggestionFor(
  input: {
    plan: string | null | undefined;
    meditationFrequency: string | null | undefined;
    focus: string | null | undefined;
  },
  sessions: MeditationSession[] = MEDITATION_CATALOG,
): { slug: string; sentence: string } {
  const fullLibrary = input.plan === "plus" || input.plan === "premium";
  if (frequentPractice(input.meditationFrequency)) {
    return {
      slug: EVENING_SLUG,
      sentence: "You already set aside time for a practice, so the evening reset stays first.",
    };
  }
  const match = fullLibrary ? matchedSession(input.focus, sessions) : undefined;
  if (match) {
    const text = (input.focus ?? "").toLowerCase();
    const topic = text.includes("sleep")
      ? "sleep"
      : text.includes("stress")
        ? "stress"
        : "mood";
    return {
      slug: match.slug,
      sentence: `This is listed first because your Snapshot focus mentions ${topic}.`,
    };
  }
  return {
    slug: EVENING_SLUG,
    sentence: "This is a short starting practice.",
  };
}

export function orderedSessions(
  input: {
    plan: string | null | undefined;
    meditationFrequency: string | null | undefined;
    focus: string | null | undefined;
  },
  sessions: MeditationSession[] = MEDITATION_CATALOG,
): MeditationSession[] {
  if (sessions.length === 0) return [];
  const suggestion = suggestionFor(input, sessions);
  const first = sessions.find((item) => item.slug === suggestion.slug) ?? sessions[0];
  if (!first) return [];
  return [first, ...sessions.filter((item) => item.slug !== first.slug)];
}
