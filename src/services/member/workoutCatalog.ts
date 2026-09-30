export interface WorkoutRecord {
  slug: string;
  title: string;
  focus: string;
  difficulty: string;
  why: string;
  focusHints: string[];
}

export const WORKOUT_CATALOG: WorkoutRecord[] = [
  {
    slug: "twenty-minute-low-impact",
    title: "20-Minute Low-Impact Session",
    focus: "Energy + mobility",
    difficulty: "Beginner",
    why: "A short walk, easy strength movement, and a stretch. Stop if something hurts. This is not a training prescription.",
    focusHints: ["energy", "movement", "joint", "fatigue"],
  },
  {
    slug: "ten-minute-evening-stretch",
    title: "10-Minute Evening Stretch",
    focus: "Relaxation",
    difficulty: "Beginner",
    why: "Slow stretching before bed is a wind-down option. It does not treat a sleep condition.",
    focusHints: ["sleep", "stress", "mood"],
  },
];

export function workoutBySlug(slug: string): WorkoutRecord | undefined {
  return WORKOUT_CATALOG.find((item) => item.slug === slug);
}
