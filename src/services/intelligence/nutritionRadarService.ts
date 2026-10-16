/**
 * Nutrition Radar & Micronutrient Correlation Engine (Spec: Maria's Story Sec 1).
 *
 * Maria logs symptoms (e.g., night sweats + insomnia + stress). The system
 * processes her pattern, computes her Nutrition Radar (magnesium, phytoestrogens,
 * anti-inflammatory markers, calcium-D3), and maps them to tailored recipes.
 */

export interface NutritionRadarProfile {
  scores: {
    magnesium: number; // 0-100
    phytoestrogens: number; // 0-100
    antiInflammatory: number; // 0-100
    hydrationElectrolytes: number; // 0-100
    calciumD3: number; // 0-100
  };
  primaryDeficit: string;
  clinicalRationale: string;
  recommendedNutrients: string[];
  recommendedRecipeSlugs: string[];
}

export class NutritionRadarService {
  /**
   * Computes the member's Nutrition Radar profile based on reported symptoms and goals.
   */
  calculateProfile(input: {
    symptoms?: string[];
    sleepHours?: number;
    moodScore?: number;
    notes?: string;
  }): NutritionRadarProfile {
    const symptoms = (input.symptoms || []).map((s) => s.toLowerCase());
    const notes = (input.notes || "").toLowerCase();

    const hasNightSweats = symptoms.some((s) => s.includes("night sweat") || s.includes("sweat"));
    const hasHotFlashes = symptoms.some((s) => s.includes("hot flash") || s.includes("flush"));
    const hasInsomnia = symptoms.some((s) => s.includes("sleep") || s.includes("insomnia")) || (input.sleepHours !== undefined && input.sleepHours < 6);
    const hasJointPain = symptoms.some((s) => s.includes("joint") || s.includes("stiff") || s.includes("ache"));
    const hasStress = (input.moodScore !== undefined && input.moodScore <= 2) || notes.includes("stress");
    const hasCaffeineFlag = notes.includes("coffee") || notes.includes("caffeine") || notes.includes("afternoon");

    // Dynamic scores calculation
    let magnesium = 75;
    let phytoestrogens = 70;
    let antiInflammatory = 70;
    let hydration = 80;
    let calcium = 75;

    const recommendedNutrients: string[] = [];
    const recommendedRecipes: string[] = [];

    if (hasNightSweats || hasInsomnia) {
      magnesium -= 35; // Significant deficit signal
      hydration -= 25;
      recommendedNutrients.push("Magnesium glycinate / citrate", "Electrolyte hydration");
      recommendedRecipes.push("magnesium-spinach-lentil-bowl", "lavender-chamomile-sleep-tea");
    }

    if (hasHotFlashes) {
      phytoestrogens -= 30;
      antiInflammatory -= 20;
      recommendedNutrients.push("Phytoestrogens (dietary soy isoflavones, lignans)");
      recommendedRecipes.push("cooling-cucumber-avocado-gazpacho", "berry-soy-parfait");
    }

    if (hasJointPain || hasStress) {
      antiInflammatory -= 30;
      magnesium -= 15;
      recommendedNutrients.push("Omega-3 fatty acids", "Curcumin / Ginger");
      recommendedRecipes.push("anti-inflammatory-salmon-bowl", "golden-turmeric-lentil-soup");
    }

    if (hasCaffeineFlag) {
      recommendedNutrients.push("Caffeine cutoff (before 2:00 PM)");
    }

    // Determine primary deficit
    const lowest = Math.min(magnesium, phytoestrogens, antiInflammatory, hydration);
    let primaryDeficit = "Optimal Balanced Range";
    let clinicalRationale = "Nutritional markers are aligned with current baseline check-ins.";

    if (lowest === magnesium) {
      primaryDeficit = "Low Magnesium & Neuro-Thermoregulatory Support";
      clinicalRationale =
        "Night sweats and sleep disruption correlate with magnesium depletion. Magnesium supports parasympathetic wind-down and vascular tone.";
    } else if (lowest === phytoestrogens) {
      primaryDeficit = "Phytoestrogen & Mild Estrogen Receptor Modulation";
      clinicalRationale =
        "Vasomotor fluctuations benefit from dietary isoflavones (soy, flaxseed) to support steady hypothalamic signaling.";
    } else if (lowest === antiInflammatory) {
      primaryDeficit = "Elevated Systemic Inflammatory Markers";
      clinicalRationale =
        "Joint aches and stress-induced cortisol correlate with elevated inflammation. Omega-3s and polyphenols support recovery.";
    }

    return {
      scores: {
        magnesium: Math.max(20, magnesium),
        phytoestrogens: Math.max(25, phytoestrogens),
        antiInflammatory: Math.max(25, antiInflammatory),
        hydrationElectrolytes: Math.max(25, hydration),
        calciumD3: Math.max(30, calcium),
      },
      primaryDeficit,
      clinicalRationale,
      recommendedNutrients: recommendedNutrients.length > 0 ? recommendedNutrients : ["Balanced whole-food nutrition"],
      recommendedRecipeSlugs: recommendedRecipes.length > 0 ? recommendedRecipes : ["anti-inflammatory-salmon-bowl"],
    };
  }
}

export const nutritionRadarService = new NutritionRadarService();
