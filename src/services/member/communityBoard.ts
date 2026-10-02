import { z } from "zod";

/**
 * The basic community board.
 *
 * Topics are fixed. A note is one piece of text. Other members see it only
 * after staff approve it. Nothing here is a reply thread or a profile.
 */

export const COMMUNITY_TOPICS = [
  {
    id: "sleep",
    title: "Sleep",
    starter:
      "This topic is for what evenings and nights are like in ordinary words. A note here is a member experience. A clinician is the right person for a medical question.",
  },
  {
    id: "mood",
    title: "Mood and stress",
    starter:
      "This topic is for how a day felt. It is not a mood score and it is not a diagnosis. A clinician is the right person for a medical question.",
  },
  {
    id: "movement",
    title: "Movement",
    starter:
      "This topic is for walks, stretches, and other movement that felt workable. It is not a training plan. A clinician is the right person for a medical question.",
  },
  {
    id: "learning",
    title: "Learning together",
    starter:
      "This topic is for something you read or tried in HerCompass and want to mention. A clinician is the right person for a medical question.",
  },
] as const;

export type CommunityTopicId = (typeof COMMUNITY_TOPICS)[number]["id"];
export type CommunityNoteStatus = "pending" | "approved" | "hidden";

const topicIds = COMMUNITY_TOPICS.map((topic) => topic.id) as [
  CommunityTopicId,
  ...CommunityTopicId[],
];

const noteSchema = z.object({
  topic: z.enum(topicIds),
  body: z.string().trim().min(1, "Write a note before sending it.").max(280, "Keep the note to 280 characters."),
});

export function communityTopic(id: string) {
  return COMMUNITY_TOPICS.find((topic) => topic.id === id);
}

export function communityPostAllowed(role: string | undefined | null): boolean {
  return role === "member";
}

export function parseCommunityNote(
  input: unknown,
): { ok: true; topic: CommunityTopicId; body: string } | { ok: false; message: string } {
  const parsed = noteSchema.safeParse(input);
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "Write a short note.";
    return { ok: false, message };
  }
  return { ok: true, topic: parsed.data.topic, body: parsed.data.body };
}

export function firstNameFrom(name: string | null | undefined): string {
  const first = name?.trim().split(/\s+/)[0];
  return first && first.length > 0 ? first : "A member";
}

export interface CommunityNoteView {
  id: string;
  topic: CommunityTopicId;
  body: string;
  status: CommunityNoteStatus;
  firstName: string;
  mine: boolean;
}

/**
 * What one member is allowed to read.
 *
 * Approved notes are shared. A pending note is visible only to its author.
 * A hidden note is visible only on the staff review screen.
 */
export function memberCanReadNote(
  note: { userId: string; status: CommunityNoteStatus },
  viewerId: string,
): boolean {
  if (note.status === "approved") return true;
  if (note.status === "pending" && note.userId === viewerId) return true;
  return false;
}

export function presentMemberNote(
  note: {
    id: string;
    userId: string;
    topic: CommunityTopicId;
    body: string;
    status: CommunityNoteStatus;
    authorName: string | null;
  },
  viewerId: string,
): CommunityNoteView | null {
  if (!memberCanReadNote(note, viewerId)) return null;
  return {
    id: note.id,
    topic: note.topic,
    body: note.body,
    status: note.status,
    firstName: firstNameFrom(note.authorName),
    mine: note.userId === viewerId,
  };
}
