import { ContentPiece } from "../../models/index.js";
import { logger } from "../../utils/logger.js";

export interface AcademyLesson {
  slug: string;
  category: "basics" | "daily-life" | "relationship" | "workplace" | "sleep-intimacy";
  title: string;
  version: string;
  evidenceId: string;
  summary: string;
  paragraphs: string[];
  trackNumber?: string;
  duration?: string;
  takeaway?: string;
  listenContext?: string;
  audioUrl?: string;
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
    trackNumber: "01",
    duration: "3:00",
    takeaway: "Your role is practical support. Her care choices stay with her and her clinician.",
    listenContext: "Great for morning coffee or commute.",
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
    trackNumber: "02",
    duration: "3:00",
    takeaway: "Ask what would help today instead of deciding what she is feeling.",
    listenContext: "Listen before a conversation.",
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
    trackNumber: "03",
    duration: "3:00",
    takeaway: "Patience and a simple question are enough to start.",
    listenContext: "Recommended before evening household wind-down.",
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
    trackNumber: "04",
    duration: "3:00",
    takeaway: "A calmer wind-down, like dimmer lights, is a shared routine.",
    listenContext: "Evening bedtime preparation.",
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
    trackNumber: "05",
    duration: "3:00",
    takeaway: "Taking one chore off the list is more useful than a whole-week plan.",
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
    trackNumber: "06",
    duration: "3:00",
    takeaway: "Try: \"How can I support you this week?\" Then wait.",
    listenContext: "Recommended for couples with demanding careers.",
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
    trackNumber: "07",
    duration: "3:00",
    takeaway: "Skip guessing a cause or comparing her to someone else.",
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
    trackNumber: "08",
    duration: "3:00",
    takeaway: "Offer one specific help and make it easy to decline.",
    paragraphs: [
      "Offer one specific help: a walk, dinner, or a quiet hour.",
      "Make it easy to decline. Support that can be refused is still support.",
    ],
  },
];

const academyLog = logger.module("ACADEMY");

const VALID_CATEGORIES = new Set(["basics", "daily-life", "relationship", "workplace", "sleep-intimacy"]);

function parseLesson(row: ContentPiece): AcademyLesson | null {
  const body = row.body as Record<string, unknown>;
  const category = body.category as "basics" | "daily-life" | "relationship" | "workplace" | "sleep-intimacy";
  const paragraphs = body.paragraphs;
  if (
    typeof category !== "string" ||
    !VALID_CATEGORIES.has(category) ||
    !Array.isArray(paragraphs) ||
    typeof body.version !== "string" ||
    typeof body.evidenceId !== "string" ||
    typeof body.summary !== "string"
  ) {
    return null;
  }
  return {
    slug: row.slug,
    title: row.title,
    category,
    version: body.version,
    evidenceId: body.evidenceId,
    summary: body.summary,
    paragraphs: paragraphs.filter((line): line is string => typeof line === "string"),
    trackNumber: typeof body.trackNumber === "string" ? body.trackNumber : undefined,
    duration: typeof body.duration === "string" ? body.duration : undefined,
    takeaway: typeof body.takeaway === "string" ? body.takeaway : undefined,
    listenContext: typeof body.listenContext === "string" ? body.listenContext : undefined,
    audioUrl: typeof body.audioUrl === "string" ? body.audioUrl : undefined,
  };
}

export async function seedAcademyLessonsIfEmpty(): Promise<void> {
  try {
    const count = await ContentPiece.count({ where: { kind: "mens_academy" } });
    if (count === 0) {
      await ContentPiece.bulkCreate(
        ACADEMY_LESSONS.map((item) => ({
          kind: "mens_academy" as const,
          slug: item.slug,
          title: item.title,
          status: "published" as const,
          body: {
            category: item.category,
            version: item.version,
            evidenceId: item.evidenceId,
            summary: item.summary,
            paragraphs: item.paragraphs,
            trackNumber: item.trackNumber,
            duration: item.duration,
            takeaway: item.takeaway,
            listenContext: item.listenContext,
            audioUrl: item.audioUrl,
          },
        })),
      );
      academyLog.info("Seeded Men's Academy lessons into ContentPiece table");
    }
  } catch (error) {
    academyLog.warn("Failed to auto-seed Men's Academy lessons", error);
  }
}

export async function listAcademyLessons(): Promise<AcademyLesson[]> {
  try {
    let rows = await ContentPiece.findAll({
      where: { kind: "mens_academy", status: "published" },
      order: [["slug", "ASC"]],
    });
    if (rows.length === 0) {
      await seedAcademyLessonsIfEmpty();
      rows = await ContentPiece.findAll({
        where: { kind: "mens_academy", status: "published" },
        order: [["slug", "ASC"]],
      });
    }
    if (rows.length === 0) return ACADEMY_LESSONS;
    const parsed = rows.flatMap((row) => {
      const lesson = parseLesson(row);
      return lesson ? [lesson] : [];
    });
    return parsed.length > 0 ? parsed : ACADEMY_LESSONS;
  } catch (error) {
    academyLog.warn("Academy library fell back to the code list", error);
    return ACADEMY_LESSONS;
  }
}

export async function lessonBySlug(slug: string): Promise<AcademyLesson | undefined> {
  try {
    const row = await ContentPiece.findOne({
      where: { kind: "mens_academy", status: "published", slug },
    });
    if (row) {
      const lesson = parseLesson(row);
      if (lesson) return lesson;
    }
  } catch (error) {
    academyLog.warn(`Academy lesson ${slug} fell back to the code list`, error);
  }
  return ACADEMY_LESSONS.find((lesson) => lesson.slug === slug);
}
