export interface AcademyLesson {
  slug: string;
  category: "basics" | "daily-life" | "relationship";
  title: string;
  version: string;
  evidenceId: string;
  summary: string;
  paragraphs: string[];
}

/**
 * Men's Academy foundation.
 * Category, version, and evidenceId are the content source. The lesson page
 * may add one gateway paragraph drawn from that evidence card only.
 */
export const ACADEMY_LESSONS: AcademyLesson[] = [
  {
    slug: "menopause-basics",
    category: "basics",
    title: "Menopause basics",
    version: "1.0",
    evidenceId: "ev-nams-001",
    summary: "A short orientation for someone supporting a partner.",
    paragraphs: [
      "Midlife change is common. Sleep, energy, and mood can shift. This lesson does not say what is happening for one person.",
      "Your role is practical support. Her care choices stay with her and her clinician.",
    ],
  },
  {
    slug: "what-may-be-changing",
    category: "basics",
    title: "What may be changing",
    version: "1.0",
    evidenceId: "ev-acog-002",
    summary: "How to talk about change without guessing a cause.",
    paragraphs: [
      "People describe this stage in different ways. A partner guide stays general on purpose.",
      "Ask what would help today instead of deciding what she is feeling.",
    ],
  },
  {
    slug: "mood",
    category: "daily-life",
    title: "Mood",
    version: "1.0",
    evidenceId: "ev-cbt-010",
    summary: "Stay beside her without treating a hard day as a diagnosis.",
    paragraphs: [
      "A hard day is not a verdict. Patience and a simple question are enough to start.",
      "Do not label her mood. Let her name what she wants.",
    ],
  },
  {
    slug: "sleep",
    category: "daily-life",
    title: "Sleep",
    version: "1.0",
    evidenceId: "ev-nams-001",
    summary: "A quieter evening routine, without a promise about sleep.",
    paragraphs: [
      "A shared wind-down can mean dimmer lights and fewer late questions.",
      "This is support. It is not a sleep treatment.",
    ],
  },
  {
    slug: "energy",
    category: "daily-life",
    title: "Energy",
    version: "1.0",
    evidenceId: "ev-nams-001",
    summary: "Offer help with one task, then stop there.",
    paragraphs: [
      "Energy can vary. Taking one chore off the list is more useful than a plan for the whole week.",
      "Ask which task would help. Do not add a new project.",
    ],
  },
  {
    slug: "communication",
    category: "relationship",
    title: "Communication",
    version: "1.0",
    evidenceId: "ev-act-012",
    summary: "One question that leaves the answer with her.",
    paragraphs: [
      "Try: “How can I support you this week?”",
      "Then wait. Advice can wait until she asks for it.",
    ],
  },
  {
    slug: "what-not-to-say",
    category: "relationship",
    title: "What not to say",
    version: "1.0",
    evidenceId: "ev-cbt-010",
    summary: "Lines that guess a cause or dismiss how she feels.",
    paragraphs: [
      "Skip “you are overreacting,” “this is just stress,” and any guess about a diagnosis.",
      "Also skip comparing her to someone else.",
    ],
  },
  {
    slug: "what-to-do-instead",
    category: "relationship",
    title: "What to do instead",
    version: "1.0",
    evidenceId: "ev-mbsr-011",
    summary: "A small, optional next step.",
    paragraphs: [
      "Offer one specific help: a walk, dinner, or a quiet hour.",
      "Make it easy to decline. Support that can be refused is still support.",
    ],
  },
];

export function lessonBySlug(slug: string): AcademyLesson | undefined {
  return ACADEMY_LESSONS.find((lesson) => lesson.slug === slug);
}
