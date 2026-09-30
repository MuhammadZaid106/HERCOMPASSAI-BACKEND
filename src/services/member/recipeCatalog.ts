export interface RecipeRecord {
  slug: string;
  title: string;
  why: string;
  ingredients: string[];
  nutrition: string;
  focusHints: string[];
}

export const RECIPE_CATALOG: RecipeRecord[] = [
  {
    slug: "high-protein-breakfast-bowl",
    title: "High-Protein Breakfast Bowl",
    why: "A steady morning meal can sit beside an energy or sleep goal. This is a food idea, not a prescribed diet.",
    ingredients: ["Plain yogurt or fortified soy yogurt", "Berries", "Oats", "Pumpkin seeds"],
    nutrition: "A simple plate with protein, fiber, and fruit. Amounts depend on your own appetite.",
    focusHints: ["energy", "nutrition", "weight", "sleep"],
  },
  {
    slug: "evening-vegetable-plate",
    title: "Evening Vegetable Plate",
    why: "An earlier, lighter evening meal is one lifestyle pattern people pair with winding down. It is not a treatment.",
    ingredients: ["Cooked vegetables", "Beans or lentils", "Olive oil", "Whole-grain bread"],
    nutrition: "Fiber and protein without a late heavy meal. This is general education, not a meal plan.",
    focusHints: ["sleep", "nutrition"],
  },
];

export function recipeBySlug(slug: string): RecipeRecord | undefined {
  return RECIPE_CATALOG.find((item) => item.slug === slug);
}
