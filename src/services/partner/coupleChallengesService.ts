/**
 * Couple Challenges & Mutual Progress Tracking Service (Spec: Maria's Story Sec 3).
 *
 * Provides shared challenges for couples (e.g., calming evening walks, cooling protocols)
 * allowing both member and partner to track completion without privacy leaks.
 *
 * Progress lives in Redis so it survives a restart and is shared across replicas —
 * a plain in-process `Map` loses every couple's progress on deploy and gives each
 * replica its own divergent copy. When Redis is not configured the service keeps
 * the original in-memory behaviour, so tests and cache-less deployments still work.
 */

import { cacheGet, cacheSet } from "../../config/redis.js";

export interface CoupleChallengeDefinition {
  id: string;
  title: string;
  category: string;
  goalDays: number;
  description: string;
  memberBenefit: string;
  partnerBenefit: string;
  actionItems: string[];
}

export interface CoupleChallengeProgress {
  challengeId: string;
  title: string;
  targetCount: number;
  completedCount: number;
  isComplete: boolean;
  memberCompletedToday: boolean;
  partnerCompletedToday: boolean;
  streakDays: number;
}

const ACTIVE_CHALLENGES: CoupleChallengeDefinition[] = [
  {
    id: "evening-cooling-walks",
    title: "Complete 3 Calming Evening Walks This Week",
    category: "Movement & Thermoregulation",
    goalDays: 3,
    description: "A 10?15 minute casual stroll after dinner to drop core body temperature and wind down together.",
    memberBenefit: "Lowers night sweat severity and primes circadian melatonin release.",
    partnerBenefit: "Low-pressure conversation window without screens or high-stakes topics.",
    actionItems: ["Walk for 10-15 minutes after dinner", "Keep pace gentle and calming", "No phone checking during the walk"],
  },
  {
    id: "pre-sleep-cooling",
    title: "The 67?F Pre-Sleep Cooling Protocol",
    category: "Sleep Harmony",
    goalDays: 7,
    description: "Pre-set bedroom temperature to 66?F?68?F 45 minutes before sleep with breathable light layers.",
    memberBenefit: "Prevents 3:00 AM awakenings and nocturnal hot flushes.",
    partnerBenefit: "Avoids middle-of-the-night thermostat confusion and supports joint rest.",
    actionItems: ["Set bedroom thermostat to 67?F 45 min prior", "Prepare breathable cotton sheets", "Turn off warm overhead lamps"],
  },
  {
    id: "evening-friction-firewall",
    title: "The 8:30 PM Friction Firewall",
    category: "Communication",
    goalDays: 5,
    description: "Shared agreement to pause high-stakes financial, logistics, or stressful topics after 8:30 PM.",
    memberBenefit: "Prevents sympathetic nervous system activation before bed.",
    partnerBenefit: "Clear boundary reducing friction and bedtime irritability.",
    actionItems: ["Defer difficult topics to morning check-in", "Engage in relaxing joint routine"],
  },
];

interface ChallengeState {
  completedCount: number;
  streak: number;
  lastUpdated: string;
}

type ProgressRecords = Record<string, ChallengeState>;

/** In-process fallback (and local mirror) used when Redis is unavailable. */
const progressStore: Map<string, ProgressRecords> = new Map();

const PROGRESS_TTL_SECONDS = 60 * 60 * 24 * 30;

function storageKey(pairKey: string): string {
  return `challenges:${pairKey}`;
}

async function readRecords(pairKey: string): Promise<ProgressRecords> {
  const cached = await cacheGet<ProgressRecords>(storageKey(pairKey));
  if (cached) return cached;
  return progressStore.get(pairKey) ?? {};
}

async function writeRecords(pairKey: string, records: ProgressRecords): Promise<void> {
  // Mirror locally so a single process stays correct even without Redis, then
  // publish to Redis (a no-op when it is not configured).
  progressStore.set(pairKey, records);
  await cacheSet(storageKey(pairKey), records, PROGRESS_TTL_SECONDS);
}

export class CoupleChallengesService {
  getAvailableChallenges(): CoupleChallengeDefinition[] {
    return ACTIVE_CHALLENGES;
  }

  async getChallengeProgress(pairKey: string): Promise<CoupleChallengeProgress[]> {
    const records = await readRecords(pairKey);

    return ACTIVE_CHALLENGES.map((ch) => {
      const state = records[ch.id] || { completedCount: 1, streak: 2, lastUpdated: new Date().toISOString() };
      return {
        challengeId: ch.id,
        title: ch.title,
        targetCount: ch.goalDays,
        completedCount: state.completedCount,
        isComplete: state.completedCount >= ch.goalDays,
        memberCompletedToday: true,
        partnerCompletedToday: false,
        streakDays: state.streak,
      };
    });
  }

  async recordActivity(
    pairKey: string,
    challengeId: string,
    role: "member" | "partner"
  ): Promise<CoupleChallengeProgress> {
    const records = await readRecords(pairKey);

    const current = records[challengeId] || { completedCount: 0, streak: 1, lastUpdated: new Date().toISOString() };
    current.completedCount += 1;
    current.streak += 1;
    current.lastUpdated = new Date().toISOString();
    records[challengeId] = current;

    await writeRecords(pairKey, records);

    const challenge = ACTIVE_CHALLENGES.find((c) => c.id === challengeId) || ACTIVE_CHALLENGES[0];

    return {
      challengeId: challenge.id,
      title: challenge.title,
      targetCount: challenge.goalDays,
      completedCount: current.completedCount,
      isComplete: current.completedCount >= challenge.goalDays,
      memberCompletedToday: role === "member",
      partnerCompletedToday: role === "partner",
      streakDays: current.streak,
    };
  }
}

export const coupleChallengesService = new CoupleChallengesService();
