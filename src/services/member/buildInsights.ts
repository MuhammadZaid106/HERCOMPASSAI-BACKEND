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

function tryCard(trends: TrendEngineOutput): InsightCard {
  if (trends.symptoms.sufficientData && trends.symptoms.trend === "increasing") {
    return {
      id: "try-symptoms",
      section: "try",
      title: "Keep today’s symptoms specific",
      body: "Your logs suggest symptom entries were more frequent recently. Naming what showed up today keeps that picture specific.",
      href: "/app/track?tab=symptoms",
      hrefLabel: "Log symptoms",
      why: "This step follows the symptom trend. It is a logging habit, not a treatment.",
      considered: ["Symptom frequency trend"],
    };
  }
  if (trends.sleep.sufficientData && trends.sleep.trend === "decreasing") {
    return {
      id: "try-sleep",
      section: "try",
      title: "Notice tonight’s sleep",
      body: "Your logs suggest sleep looks lower in the recent part of this window. One more sleep check-in keeps that pattern visible.",
      href: "/app/track?tab=sleep",
      hrefLabel: "Log sleep",
      why: "This step follows the sleep trend. It does not claim a cause.",
      considered: ["Sleep quality trend"],
    };
  }
  if (trends.energy.sufficientData && trends.energy.trend === "decreasing") {
    return {
      id: "try-energy",
      section: "try",
      title: "Mark today’s energy",
      body: "Your logs suggest energy looks lower recently. A single energy mark shows whether that continues.",
      href: "/app/track?tab=energy",
      hrefLabel: "Log energy",
      why: "This step follows the energy trend.",
      considered: ["Energy level trend"],
    };
  }
  if (trends.mood.sufficientData && trends.mood.trend === "decreasing") {
    return {
      id: "try-mood",
      section: "try",
      title: "Give mood a mark today",
      body: "Your logs suggest mood looks lower in the recent part of this window. A quick mark is enough to see the next day.",
      href: "/app/track?tab=mood",
      hrefLabel: "Log mood",
      why: "This step follows the mood trend.",
      considered: ["Mood level trend"],
    };
  }
  return {
    id: "try-checkin",
    section: "try",
    title: "Keep the check-in short",
    body: trends.insufficientData
      ? "A few more check-ins are what turn this page from a placeholder into a pattern."
      : "Nothing in this window is shifting past the steady band. Another check-in keeps that picture current.",
    href: "/app/track",
    hrefLabel: "Open today’s check-in",
    why: "The app is asking for more logged days, not offering a medical plan.",
    considered: ["How many days have any entry", "Whether each domain has a recent and earlier half"],
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
    cards: [...changing, ...connected, tryCard(trends), ...watch],
    learnMore: LEARN_MORE,
  };
}
