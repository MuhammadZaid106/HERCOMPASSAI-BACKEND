import type { DomainTrend, TrendDirection, TrendEngineOutput } from "../intelligence/trendTypes.js";

export type InsightSection = "changing" | "connected" | "try" | "watch";

export interface InsightCard {
  id: string;
  section: InsightSection;
  title: string;
  body: string;
  href: string;
  hrefLabel: string;
  why: string;
  considered: string[];
}

export interface InsightLearnMore {
  title: string;
  body: string;
  href: string;
}

export interface MemberInsights {
  rangeDays: 30;
  insufficientData: boolean;
  daysWithAnyEntry: number;
  patterns: Array<{
    label: string;
    direction: TrendDirection | "unknown";
  }>;
  cards: InsightCard[];
  learnMore: InsightLearnMore[];
}

const LEARN_MORE: InsightLearnMore[] = [
  {
    title: "Daily timeline",
    body: "See each logged day behind these cards.",
    href: "/app/progress",
  },
  {
    title: "Your Snapshot",
    body: "The baseline these later logs are building on.",
    href: "/app/snapshot",
  },
  {
    title: "Today’s check-in",
    body: "Another short log makes the next picture clearer.",
    href: "/app/track",
  },
];

function percentPhrase(domain: DomainTrend): string {
  if (domain.changePercent === null) return "a shift";
  const sign = domain.changePercent > 0 ? "+" : "";
  return `${sign}${domain.changePercent}% versus the earlier part of this window`;
}

function changingBody(label: string, domain: DomainTrend): string {
  const direction =
    domain.trend === "increasing"
      ? "higher"
      : domain.trend === "decreasing"
        ? "lower"
        : "mostly steady";
  return `Your logs suggest ${label.toLowerCase()} looks ${direction} in the recent part of the last 30 days (${percentPhrase(domain)}).`;
}

function changingCard(
  id: string,
  title: string,
  domain: DomainTrend,
): InsightCard | null {
  if (!domain.sufficientData) return null;
  return {
    id,
    section: "changing",
    title,
    body: changingBody(title, domain),
    href: "/app/progress",
    hrefLabel: "Explore this pattern",
    why: "This compares the recent half of your last 30 days with the earlier half. The percentage is calculated by the app, not guessed.",
    considered: [`${title} logs in the 30-day window`, "Recent half versus earlier half"],
  };
}

function connectedCard(
  id: string,
  title: string,
  leftLabel: string,
  left: DomainTrend,
  rightLabel: string,
  right: DomainTrend,
  body: string,
): InsightCard {
  return {
    id,
    section: "connected",
    title,
    body,
    href: "/app/progress",
    hrefLabel: "Explore this pattern",
    why: `${leftLabel} ${percentPhrase(left)}. ${rightLabel} ${percentPhrase(right)}. Appearing in the same window does not mean one caused the other.`,
    considered: [`${leftLabel} trend`, `${rightLabel} trend`, "Same 30-day window"],
  };
}

/**
 * The "What to try" section.
 *
 * Every card here is a *reflection* step — something to notice or write down
 * about your own logs — not a lifestyle or clinical instruction. Nothing in this
 * file may prescribe, and nothing may claim that a habit will change an outcome;
 * the cards only help the member look harder at data the app already holds.
 *
 * Personalised, evidence-informed steps come from the Gateway instead (see
 * `personalizedRecommendations` in the shared Snapshot contract). The card at the
 * end of this section is what routes a member there, because this page runs
 * without a model and cannot personalise advice on its own.
 */
function tryCard(trends: TrendEngineOutput): InsightCard {
  if (trends.symptoms.sufficientData && trends.symptoms.trend === "increasing") {
    return {
      id: "try-symptoms",
      section: "try",
      title: "Note when your symptoms show up",
      body: "Your logs suggest symptoms have been more frequent recently. On your next check-in, add the time of day and what you were doing. Timing is often the thing that makes a pattern visible.",
      href: "/app/track?tab=symptoms",
      hrefLabel: "Log symptoms with timing",
      why: "This step follows the symptom frequency trend. It asks you to observe your own logs more closely — it is not a treatment and it does not claim a cause.",
      considered: ["Symptom frequency trend", "Recent half versus earlier half of the 30-day window"],
    };
  }
  if (trends.sleep.sufficientData && trends.sleep.trend === "decreasing") {
    return {
      id: "try-sleep",
      section: "try",
      title: "Write down what happened before bed",
      body: "Your logs suggest sleep looks lower in the recent part of this window. On your lowest-sleep nights, jot down what the hour before bed looked like. That gives you something to compare next time.",
      href: "/app/track?tab=sleep",
      hrefLabel: "Log sleep and the hour before",
      why: "This step follows the sleep trend. It collects your own observations and does not claim a cause or suggest a fix.",
      considered: ["Sleep quality trend", "Recent half versus earlier half of the 30-day window"],
    };
  }
  if (trends.energy.sufficientData && trends.energy.trend === "decreasing") {
    return {
      id: "try-energy",
      section: "try",
      title: "Mark the time your energy drops",
      body: "Your logs suggest energy looks lower recently. Note the hour it dips and what you were doing at that point, so you can see whether the dip lands at the same time each day.",
      href: "/app/track?tab=energy",
      hrefLabel: "Log energy with timing",
      why: "This step follows the energy trend. It describes your own logged pattern and does not suggest a treatment.",
      considered: ["Energy level trend", "Recent half versus earlier half of the 30-day window"],
    };
  }
  if (trends.mood.sufficientData && trends.mood.trend === "decreasing") {
    return {
      id: "try-mood",
      section: "try",
      title: "Note what the harder days had in common",
      body: "Your logs suggest mood looks lower in the recent part of this window. On a harder day, one line about what you were doing or who you were with is enough to start a pattern you can see.",
      href: "/app/track?tab=mood",
      hrefLabel: "Log mood with a note",
      why: "This step follows the mood trend. It invites reflection on your own entries and makes no clinical claim.",
      considered: ["Mood level trend", "Recent half versus earlier half of the 30-day window"],
    };
  }
  return {
    id: "try-checkin",
    section: "try",
    title: "Keep the check-in short",
    body: trends.insufficientData
      ? "A few more check-ins are what turn this page from a placeholder into a pattern. Each one takes under a minute."
      : "Nothing in this window is shifting past the steady band. Another short check-in keeps that picture current.",
    href: "/app/track",
    hrefLabel: "Open today’s check-in",
    why: "The app is asking for more logged days, not offering a medical plan.",
    considered: ["How many days have any entry", "Whether each domain has a recent and earlier half"],
  };
}

/**
 * Routes the member to the suggestions that *are* personalised.
 *
 * The cards above are fixed templates because this page is computed without a
 * model. The Gateway's `personalizedRecommendations` are specific to this
 * member's logs and are citation-checked, so this card points at them rather
 * than pretending a template is personalised advice.
 */
function personalisedStepsCard(): InsightCard {
  return {
    id: "try-personalised",
    section: "try",
    title: "See steps chosen for your own logs",
    body: "Your model reading draws suggestions from what you actually logged, checks each one against our approved sources, and removes anything it cannot back up. The steps above are fixed templates; these are yours.",
    href: "/app/insights",
    hrefLabel: "Open your personalised suggestions",
    why: "The app calculates the trends; the model only interprets them and proposes steps. Every suggestion shown there is checked against approved evidence before you see it.",
    considered: ["Your 30-day trend engine output", "Your Snapshot focus area", "Approved evidence sources"],
  };
}

export function buildMemberInsights(trends: TrendEngineOutput): MemberInsights {
  const changing = [
    changingCard("changing-symptoms", "Symptoms", trends.symptoms),
    changingCard("changing-mood", "Mood", trends.mood),
    changingCard("changing-sleep", "Sleep", trends.sleep),
    changingCard("changing-energy", "Energy", trends.energy),
  ].filter((card): card is InsightCard => card !== null);

  const connected: InsightCard[] = [];
  if (
    trends.sleep.sufficientData &&
    trends.energy.sufficientData &&
    trends.sleep.trend === "decreasing" &&
    trends.energy.trend === "decreasing"
  ) {
    connected.push(
      connectedCard(
        "connected-sleep-energy",
        "Sleep and energy",
        "Sleep",
        trends.sleep,
        "Energy",
        trends.energy,
        "Your recent entries show lower sleep and lower energy in the same window. One pattern worth noting is that they moved together. That does not show a cause.",
      ),
    );
  }
  if (
    trends.mood.sufficientData &&
    trends.sleep.sufficientData &&
    trends.mood.trend === "decreasing" &&
    trends.sleep.trend === "decreasing"
  ) {
    connected.push(
      connectedCard(
        "connected-mood-sleep",
        "Mood and sleep",
        "Mood",
        trends.mood,
        "Sleep",
        trends.sleep,
        "Your logs suggest mood and sleep both look lower in the recent part of this window. They appeared alongside each other. That is not proof one caused the other.",
      ),
    );
  }

  const watch: InsightCard[] =
    trends.patternIndicators.length > 0
      ? trends.patternIndicators.map((line, index) => ({
          id: `watch-${index}`,
          section: "watch" as const,
          title: "Worth watching",
          body: line,
          href: "/app/progress",
          hrefLabel: "See the timeline",
          why: "This note is a fixed rule on your logged values. It is not a diagnosis.",
          considered: ["Pattern rules in the trend engine", "The same 30-day window"],
        }))
      : [
          {
            id: "watch-more-logs",
            section: "watch",
            title: "Still early",
            body: trends.insufficientData
              ? "Your picture builds after a few check-ins. Each log makes what to watch easier to see."
              : "No extra watch rule fired for this window. The timeline still shows the days you logged.",
            href: "/app/track",
            hrefLabel: "Add a check-in",
            why: "Watch notes stay empty until a rule has enough logged days.",
            considered: [`${trends.daysWithAnyEntry} days with any entry in 30 days`],
          },
        ];

  return {
    rangeDays: 30,
    insufficientData: trends.insufficientData,
    daysWithAnyEntry: trends.daysWithAnyEntry,
    patterns: [
      { label: "Sleep", direction: trends.sleep.sufficientData ? trends.sleep.trend : "unknown" },
      { label: "Energy", direction: trends.energy.sufficientData ? trends.energy.trend : "unknown" },
      { label: "Mood", direction: trends.mood.sufficientData ? trends.mood.trend : "unknown" },
      { label: "Symptoms", direction: trends.symptoms.sufficientData ? trends.symptoms.trend : "unknown" },
    ],
    cards: [...changing, ...connected, tryCard(trends), personalisedStepsCard(), ...watch],
    learnMore: LEARN_MORE,
  };
}
