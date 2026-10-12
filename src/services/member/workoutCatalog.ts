export interface WorkoutExercise {
  title: string;
  detail: string;
  /** Printable prescription such as "3 rounds" or "45 seconds". */
  reps: string;
  /** Seconds this step should run in the guided timer, when known. */
  seconds?: number;
}

export interface WorkoutEvidence {
  source: string;
  note: string;
}

export interface WorkoutRecord {
  slug: string;
  title: string;
  focus: string;
  difficulty: string;
  why: string;
  focusHints: string[];
  /** Filter label for the library. */
  category: "low-impact" | "flexibility" | "strength" | "cardio" | "breathing";
  durationMinutes: number;
  /** Short focus-area tags shown on the card. */
  focusAreas: string[];
  /** Free sessions stay open on every plan; Plus and Premium open the library. */
  tier: "free" | "plus";
  exercises: WorkoutExercise[];
  /** Approved educational sources behind this session. */
  evidence: WorkoutEvidence[];
}

export const WORKOUT_CATALOG: WorkoutRecord[] = [
  {
    slug: "twenty-minute-low-impact",
    title: "20-Minute Low-Impact Session",
    focus: "Energy + mobility",
    difficulty: "Beginner",
    why: "A short walk, easy strength movement, and a stretch. Stop if something hurts. This is not a training prescription.",
    focusHints: ["energy", "movement", "joint", "fatigue"],
    category: "low-impact",
    durationMinutes: 20,
    focusAreas: ["Energy", "Mobility"],
    tier: "free",
    exercises: [
      {
        title: "Easy walk or marching on the spot",
        detail: "Move gently to warm up. Keep the pace one you could talk through.",
        reps: "5 minutes",
        seconds: 300,
      },
      {
        title: "Supported squats",
        detail: "Hold a chair back for balance. Lower slowly, then press back up.",
        reps: "3 rounds of 8",
        seconds: 180,
      },
      {
        title: "Wall push-ups",
        detail: "Stand an arm's length from a wall, push away and return.",
        reps: "2 rounds of 10",
        seconds: 120,
      },
      {
        title: "Hamstring and calf stretch",
        detail: "Easy stretches at the end. Only go as far as feels comfortable.",
        reps: "2 rounds of 30 seconds",
        seconds: 60,
      },
    ],
    evidence: [
      {
        source: "WHO",
        note: "Public activity guidance for adults. Choose what feels workable for you.",
      },
      {
        source: "USPSTF",
        note: "Regular weight-bearing movement supports bone and muscle. Not a prescription.",
      },
    ],
  },
  {
    slug: "ten-minute-evening-stretch",
    title: "10-Minute Evening Stretch",
    focus: "Relaxation",
    difficulty: "Beginner",
    why: "Slow stretching before bed is a wind-down option. It does not treat a sleep condition.",
    focusHints: ["sleep", "stress", "mood"],
    category: "flexibility",
    durationMinutes: 10,
    focusAreas: ["Mobility", "Calm"],
    tier: "free",
    exercises: [
      {
        title: "Upright seated breathing",
        detail: "Sit tall, soften your shoulders, and take slow breaths.",
        reps: "2 minutes",
        seconds: 120,
      },
      {
        title: "Neck rolls",
        detail: "Slowly circle your neck in both directions.",
        reps: "1 minute",
        seconds: 60,
      },
      {
        title: "Seated forward fold",
        detail: "Hinge slowly from the hips and rest where it feels easy.",
        reps: "2 rounds of 45 seconds",
        seconds: 90,
      },
      {
        title: "Legs-up-the-wall",
        detail: "Lie with your legs resting up a wall. Breathe normally.",
        reps: "3 minutes",
        seconds: 180,
      },
    ],
    evidence: [
      {
        source: "NIH",
        note: "General education on rest and wind-down habits. Not a mental-health assessment.",
      },
      {
        source: "NAMS",
        note: "Educational context on relaxation in the menopause transition.",
      },
    ],
  },
];

export function workoutBySlug(slug: string): WorkoutRecord | undefined {
  return WORKOUT_CATALOG.find((item) => item.slug === slug);
}

export function workoutIncluded(
  plan: string | null | undefined,
  workout: WorkoutRecord,
): boolean {
  if (workout.tier === "free") return true;
  return plan === "plus" || plan === "premium";
}