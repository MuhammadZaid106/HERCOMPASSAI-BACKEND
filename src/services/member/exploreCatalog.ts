export interface ExploreEvidence {
  source: string;
  note: string;
}

export type ExploreTopicId =
  | "sleep"
  | "mood"
  | "energy"
  | "nutrition"
  | "movement"
  | "stress"
  | "relationships"
  | "menopause"
  | "partner-support"
  | "mens-academy"
  | "evidence";

export interface ExploreRecord {
  slug: string;
  title: string;
  category: ExploreTopicId;
  minutes: number;
  why: string;
  tryThis: string;
  tryHref: string;
  tryLabel: string;
  evidence: ExploreEvidence[];
  starter: boolean;
}

/** Code-defined fallback catalog. Used when ContentPiece table has no explore rows. */
export const EXPLORE_CATALOG: ExploreRecord[] = [
  {
    slug: "understanding-sleep-changes",
    title: "Understanding sleep changes",
    category: "sleep",
    minutes: 5,
    why: "Sleep can shift in midlife. A short log makes those nights easier to see beside energy and mood.",
    tryThis: "Mark last night's sleep in today's check-in.",
    tryHref: "/app/track?tab=sleep",
    tryLabel: "Log sleep",
    evidence: [
      { source: "NAMS", note: "Educational context on sleep changes in the menopause transition. Not a diagnosis." },
      { source: "NIH", note: "Public guidance that sleep and daytime energy are worth noticing together." },
    ],
    starter: true,
  },
  {
    slug: "mood-beside-sleep",
    title: "Mood beside sleep",
    category: "mood",
    minutes: 4,
    why: "A lower mood and a harder night can show up in the same week. That is a pattern to notice, not a cause.",
    tryThis: "Give mood a single mark today.",
    tryHref: "/app/track?tab=mood",
    tryLabel: "Log mood",
    evidence: [
      { source: "ACOG", note: "Mood changes are a recognized part of this life stage for many people. This page does not assess them." },
    ],
    starter: true,
  },
  {
    slug: "energy-across-the-day",
    title: "Energy across the day",
    category: "energy",
    minutes: 4,
    why: "Energy often moves through the day. One mark is enough to see whether that repeats.",
    tryThis: "Mark today's energy.",
    tryHref: "/app/track?tab=energy",
    tryLabel: "Log energy",
    evidence: [
      { source: "Harvard Health", note: "General education on daytime energy and rest. Not a treatment plan." },
    ],
    starter: false,
  },
  {
    slug: "a-steady-plate",
    title: "A steady plate",
    category: "nutrition",
    minutes: 5,
    why: "Regular meals are one lifestyle signal you can log beside how the day felt.",
    tryThis: "Record today's nutrition note in the lifestyle step.",
    tryHref: "/app/track?tab=lifestyle",
    tryLabel: "Open lifestyle",
    evidence: [
      { source: "Harvard Health", note: "General nutrition education. This is not a prescribed meal plan." },
    ],
    starter: false,
  },
  {
    slug: "low-impact-movement",
    title: "Low-impact movement",
    category: "movement",
    minutes: 4,
    why: "A short walk or stretch is a lifestyle signal, not a workout prescription.",
    tryThis: "Note whether you moved today.",
    tryHref: "/app/track?tab=lifestyle",
    tryLabel: "Log movement",
    evidence: [
      { source: "WHO", note: "Public activity guidance for adults. Choose what feels workable for you." },
    ],
    starter: false,
  },
  {
    slug: "a-short-reset",
    title: "A short reset",
    category: "stress",
    minutes: 3,
    why: "A brief pause is something you can mark. It does not measure stress clinically.",
    tryThis: "Mark whether you took a short reset today.",
    tryHref: "/app/track?tab=lifestyle",
    tryLabel: "Log a reset",
    evidence: [
      { source: "NIH", note: "General education on stress and rest. Not a mental-health assessment." },
    ],
    starter: false,
  },
  {
    slug: "talking-about-what-you-notice",
    title: "Talking about what you notice",
    category: "relationships",
    minutes: 5,
    why: "You choose what, if anything, someone close to you hears. Raw logs stay private.",
    tryThis: "Review partner support before you share anything.",
    tryHref: "/app/partner",
    tryLabel: "Review partner support",
    evidence: [
      { source: "HerCompass consent", note: "Sharing is limited to what you allow, and you can revoke it." },
    ],
    starter: false,
  },
  {
    slug: "what-a-phase-label-means",
    title: "What a phase label means",
    category: "menopause",
    minutes: 5,
    why: "A phase such as perimenopause is context for your Snapshot. It is not a diagnosis from this app.",
    tryThis: "Read the baseline you already built.",
    tryHref: "/app/snapshot",
    tryLabel: "Open Snapshot",
    evidence: [
      { source: "NAMS", note: "Stage language used for education. Confirm medical questions with a clinician." },
    ],
    starter: true,
  },
  {
    slug: "what-a-partner-can-see",
    title: "What a partner can see",
    category: "partner-support",
    minutes: 4,
    why: "Partner support is optional. A partner never receives your raw health logs.",
    tryThis: "Open the partner page and decide later if you want.",
    tryHref: "/app/partner",
    tryLabel: "Open partner support",
    evidence: [
      { source: "HerCompass consent", note: "Only a consented summary can be shared, and you can turn it off." },
    ],
    starter: false,
  },
  {
    slug: "support-without-the-raw-log",
    title: "Support without the raw log",
    category: "mens-academy",
    minutes: 4,
    why: "Men's Academy is for learning how to support someone. It is not a view of private entries.",
    tryThis: "See how partner access is controlled.",
    tryHref: "/app/partner",
    tryLabel: "Review access",
    evidence: [
      { source: "HerCompass consent", note: "Education for a partner stays separate from your private check-ins." },
    ],
    starter: false,
  },
  {
    slug: "where-guidance-comes-from",
    title: "Where guidance comes from",
    category: "evidence",
    minutes: 4,
    why: "Educational notes on this page name a source body. They do not diagnose or prescribe.",
    tryThis: "Look at the pattern cards built from your own logs.",
    tryHref: "/app/insights",
    tryLabel: "Open insights",
    evidence: [
      { source: "NAMS", note: "Menopause education." },
      { source: "ACOG", note: "Women's health education." },
      { source: "WHO", note: "Public health guidance." },
      { source: "NIH", note: "Public research summaries." },
      { source: "Harvard Health", note: "General wellness education." },
    ],
    starter: true,
  },
];

export function exploreBySlug(slug: string): ExploreRecord | undefined {
  return EXPLORE_CATALOG.find((item) => item.slug === slug);
}
