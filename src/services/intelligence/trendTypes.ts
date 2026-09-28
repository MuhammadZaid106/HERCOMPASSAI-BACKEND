import { z } from "zod";

export const trendDirectionSchema = z.enum([
  "increasing",
  "decreasing",
  "stable",
]);
export type TrendDirection = z.infer<typeof trendDirectionSchema>;

export const domainTrendSchema = z.object({
  trend: trendDirectionSchema,
  changePercent: z.number().nullable(),
  recentAverage: z.number().nullable(),
  priorAverage: z.number().nullable(),
  sufficientData: z.boolean(),
});

export type DomainTrend = z.infer<typeof domainTrendSchema>;

export const trendEngineOutputSchema = z.object({
  rangeDays: z.number().int().positive(),
  insufficientData: z.boolean(),
  checkInStreak: z.number().int().nonnegative(),
  consistencyScore: z.number().min(0).max(100),
  daysWithAnyEntry: z.number().int().nonnegative(),
  symptomFrequency: z.number().nullable(),
  symptoms: domainTrendSchema,
  mood: domainTrendSchema,
  sleep: domainTrendSchema,
  energy: domainTrendSchema,
  patternIndicators: z.array(z.string()).max(3),
});

export type TrendEngineOutput = z.infer<typeof trendEngineOutputSchema>;

export interface DailyPoint {
  date: string;
  value: number;
}

export interface CalculateTrendsInput {
  rangeDays: 7 | 30 | 90;
  today?: Date;
  symptomPoints: DailyPoint[];
  moodPoints: DailyPoint[];
  sleepPoints: DailyPoint[];
  energyPoints: DailyPoint[];
  /** Calendar dates (YYYY-MM-DD) with any tracking entry, including lifestyle */
  loggedDates: string[];
}
