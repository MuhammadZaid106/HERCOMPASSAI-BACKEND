export interface RecipeEvidence {
  source: string;
  note: string;
}

export interface RecipeMacros {
  /** Approximate per serving, labeled clearly in the UI. */
  proteinG: number;
  carbsG: number;
  fatG: number;
  caloriesKcal: number;
}

export interface RecipeRecord {
  slug: string;
  title: string;
  why: string;
  ingredients: string[];
  nutrition: string;
  focusHints: string[];
  /** Coarse meal window so the library can offer a filter bar. */
  category: "breakfast" | "lunch" | "dinner" | "snacks";
  /** Estimated hands-on time, not a promise about the plate. */
  prepMinutes: number;
  servings: number;
  difficulty: "Simple" | "Easy" | "Medium";
  instructions: string[];
  /** Approximate nutrition, education only, never a dietary prescription. */
  macroSummary: RecipeMacros | null;
  /** Every current card is free; Plus and Premium open any added library recipes. */
  tier: "free" | "plus";
  /** Approved educational sources behind this card. */
  evidence: RecipeEvidence[];
}

export const RECIPE_CATALOG: RecipeRecord[] = [
  {
    slug: "high-protein-breakfast-bowl",
    title: "High-Protein Breakfast Bowl",
    why: "A steady morning meal can sit beside an energy or sleep goal. This is a food idea, not a prescribed diet.",
    ingredients: ["Plain yogurt or fortified soy yogurt", "Berries", "Oats", "Pumpkin seeds"],
    nutrition: "A simple plate with protein, fiber, and fruit. Amounts depend on your own appetite.",
    focusHints: ["energy", "nutrition", "weight", "sleep"],
    category: "breakfast",
    prepMinutes: 10,
    servings: 1,
    difficulty: "Simple",
    instructions: [
      "Spoon the yogurt into a bowl.",
      "Top with the oats, berries, and pumpkin seeds.",
      "Add water or milk to loosen it if you prefer a thinner bowl.",
    ],
    // Approximate figures for a single bowl made to taste. They are a
    // starting point for planning a meal, not clinical nutrition advice.
    macroSummary: { proteinG: 18, carbsG: 32, fatG: 9, caloriesKcal: 280 },
    tier: "free",
    evidence: [
      {
        source: "NAMS",
        note: "Educational context on a steady eating routine in the menopause transition. Not a diagnosis.",
      },
      {
        source: "Harvard Health",
        note: "General nutrition education about protein and fiber. This is not a prescribed meal plan.",
      },
    ],
  },
  {
    slug: "evening-vegetable-plate",
    title: "Evening Vegetable Plate",
    why: "An earlier, lighter evening meal is one lifestyle pattern people pair with winding down. It is not a treatment.",
    ingredients: ["Cooked vegetables", "Beans or lentils", "Olive oil", "Whole-grain bread"],
    nutrition: "Fiber and protein without a late heavy meal. This is general education, not a meal plan.",
    focusHints: ["sleep", "nutrition"],
    category: "dinner",
    prepMinutes: 25,
    servings: 2,
    difficulty: "Easy",
    instructions: [
      "Steam or roast the vegetables until fork-tender.",
      "Warm the beans or lentils and toss with olive oil.",
      "Serve beside whole-grain bread, and season to taste.",
    ],
    // Approximate figures per serving for the plate as written.
    macroSummary: { proteinG: 16, carbsG: 34, fatG: 12, caloriesKcal: 320 },
    tier: "free",
    evidence: [
      {
        source: "ACOG",
        note: "Women's health education on vegetables, beans, and fiber. Not a dietary prescription.",
      },
      {
        source: "NAMS",
        note: "Educational context on evening eating patterns and rest. Not a treatment.",
      },
    ],
  },
];

export function recipeBySlug(slug: string): RecipeRecord | undefined {
  return RECIPE_CATALOG.find((item) => item.slug === slug);
}

export function recipeIncluded(
  plan: string | null | undefined,
  recipe: RecipeRecord,
): boolean {
  if (recipe.tier === "free") return true;
  return plan === "plus" || plan === "premium";
}