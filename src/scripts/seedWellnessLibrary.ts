/**
 * Seed Wellness Library Script
 * Run: npx tsx src/scripts/seedWellnessLibrary.ts
 * Seeds comprehensive recipes, workouts, meditations, partner activities,
 * and couple challenges into Neon PostgreSQL content_pieces with status: "published".
 */

import "dotenv/config";
import { sequelize } from "../config/db.js";
import { ContentPiece } from "../models/ContentPiece.js";
import { logger } from "../utils/logger.js";

const log = logger.module("SEED_WELLNESS");

const SEED_PIECES = [
  // ─── RECIPES (10+) ──────────────────────────────────────────────────────────
  {
    kind: "recipe" as const,
    slug: "mediterranean-cooling-bowl",
    title: "Mediterranean Cooling Quinoa & Cucumber Bowl",
    status: "published" as const,
    body: {
      why: "A crisp, hydrating lunch rich in magnesium, plant protein, and healthy fats designed to support steady daytime energy and body temperature regulation.",
      ingredients: [
        "1 cup cooked tricolor quinoa",
        "1 cup Persian cucumber, diced",
        "1/2 cup Kalamata olives and cherry tomatoes",
        "3 tbsp extra virgin olive oil with lemon juice",
        "1/4 cup crumbled sheep feta or marinated chickpeas",
      ],
      nutrition: "410 kcal · 14g Protein · 22g Healthy Fats · 8g Fiber",
      focusHints: ["cooling", "energy", "nutrition", "vasomotor"],
    },
  },
  {
    kind: "recipe" as const,
    slug: "magnesium-evening-harvest-plate",
    title: "Magnesium-Rich Evening Lentil & Greens Plate",
    status: "published" as const,
    body: {
      why: "Warm lentils and dark leafy greens provide natural dietary magnesium and tryptophan to support evening parasympathetic wind-down without heavy digestive load.",
      ingredients: [
        "1 cup French green lentils, simmered with thyme",
        "2 cups steamed Swiss chard or baby spinach",
        "1/4 cup toasted pumpkin seeds (pepitas)",
        "1 tbsp cold-pressed olive oil & apple cider vinegar",
      ],
      nutrition: "380 kcal · 21g Protein · 12g Fats · 16g Fiber · 190mg Magnesium",
      focusHints: ["sleep", "stress", "magnesium", "energy"],
    },
  },
  {
    kind: "recipe" as const,
    slug: "anti-inflammatory-golden-chia-pudding",
    title: "Anti-Inflammatory Golden Chia & Berry Bowl",
    status: "published" as const,
    body: {
      why: "Chia seeds deliver essential alpha-linolenic omega-3s, while turmeric and wild blueberries supply polyphenols that support joint ease and cellular recovery.",
      ingredients: [
        "3 tbsp black chia seeds",
        "1 cup unsweetened almond or oat milk",
        "1/4 tsp ground turmeric and Ceylon cinnamon",
        "1/2 cup wild blueberries",
        "1 tbsp hemp hearts",
      ],
      nutrition: "290 kcal · 10g Protein · 15g Omega-3 Fats · 12g Fiber",
      focusHints: ["joint", "mood", "nutrition", "anti-inflammatory"],
    },
  },
  {
    kind: "recipe" as const,
    slug: "bone-support-salmon-sesame-skillet",
    title: "Wild Salmon & Sesame Bok Choy Skillet",
    status: "published" as const,
    body: {
      why: "Wild-caught salmon provides bioavailable vitamin D3 and omega-3 fatty acids, paired with calcium-rich bok choy and sesame to support bone remodeling.",
      ingredients: [
        "5 oz wild Alaskan salmon fillet",
        "2 cups baby bok choy, halved and sautéed",
        "1 tbsp toasted sesame seeds",
        "1 tsp ginger-tamari glaze",
      ],
      nutrition: "390 kcal · 36g Protein · 20g Fats · 4g Fiber · High Calcium & D3",
      focusHints: ["bone", "energy", "joint", "nutrition"],
    },
  },
  {
    kind: "recipe" as const,
    slug: "citrus-avocado-endive-salad",
    title: "Cooling Citrus & Avocado Endive Salad",
    status: "published" as const,
    body: {
      why: "Bitter endive and crisp citrus aid digestive enzyme secretion, while monounsaturated avocado fats help stabilize post-meal glucose response.",
      ingredients: [
        "2 heads Belgian endive, sliced",
        "1/2 ripe Haas avocado",
        "1 ruby red grapefruit or blood orange segments",
        "1 tbsp walnut oil and tarragon vinaigrette",
      ],
      nutrition: "240 kcal · 4g Protein · 18g Fats · 7g Fiber",
      focusHints: ["cooling", "digestion", "metabolism", "energy"],
    },
  },
  {
    kind: "recipe" as const,
    slug: "gut-nourish-tempeh-miso-broth",
    title: "Probiotic Tempeh & Shiitake Miso Broth",
    status: "published" as const,
    body: {
      why: "Fermented tempeh and traditional unpasteurized miso offer gut microbiome support and gentle isoflavones associated with metabolic ease.",
      ingredients: [
        "4 oz organic cubed tempeh, lightly crisped",
        "2 cups shiitake and kombu dashi broth",
        "1 tbsp fermented white miso paste (stirred off-heat)",
        "1 cup shredded savoy cabbage and scallions",
      ],
      nutrition: "320 kcal · 24g Protein · 11g Fats · 8g Fiber",
      focusHints: ["gut", "microbiome", "estrogen", "nutrition"],
    },
  },
  {
    kind: "recipe" as const,
    slug: "blood-sugar-steady-egg-frittata",
    title: "Herbed Spinach & Pasture-Raised Egg Frittata",
    status: "published" as const,
    body: {
      why: "High-choline pasture eggs with wilted herbs provide reliable brain energy and steady morning blood sugar, preventing 11:00 AM energy crashes.",
      ingredients: [
        "3 pasture-raised whole eggs",
        "1 cup chopped fresh herbs (parsley, dill, mint)",
        "1 cup baby spinach",
        "1 oz soft goat cheese",
      ],
      nutrition: "310 kcal · 22g Protein · 21g Fats · 2g Carbs",
      focusHints: ["energy", "brain", "focus", "glucose"],
    },
  },
  {
    kind: "recipe" as const,
    slug: "calming-chamomile-spiced-poached-pears",
    title: "Chamomile-Poached Bosc Pears with Walnuts",
    status: "published" as const,
    body: {
      why: "A gentle, refined-sugar-free evening treat steeped in apigenin-rich chamomile flowers and topped with brain-supporting walnuts.",
      ingredients: [
        "1 firm Bosc pear, peeled and cored",
        "1.5 cups brewed strong chamomile tea",
        "1 cinnamon stick and 2 cardamom pods",
        "2 tbsp crushed raw walnuts",
      ],
      nutrition: "190 kcal · 4g Protein · 9g Fats · 6g Fiber",
      focusHints: ["sleep", "relaxation", "evening", "comfort"],
    },
  },
  {
    kind: "recipe" as const,
    slug: "phyto-green-smoothie-elixir",
    title: "Alkaline Green & Ground Flaxseed Elixir",
    status: "published" as const,
    body: {
      why: "Fresh ground golden flaxseed delivers dietary lignans, blended with Persian cucumber and celery for cellular hydration.",
      ingredients: [
        "2 tbsp freshly ground golden flaxseed",
        "1/2 English cucumber",
        "1 celery stalk and 1 cup baby kale",
        "1 cup cold coconut water",
        "Squeeze of fresh lime juice",
      ],
      nutrition: "160 kcal · 6g Protein · 8g Fats · 7g Fiber · 2.4g Lignans",
      focusHints: ["cooling", "hydration", "hormone", "energy"],
    },
  },
  {
    kind: "recipe" as const,
    slug: "roasted-root-hemp-warm-salad",
    title: "Golden Beet & Hemp Seed Warm Salad",
    status: "published" as const,
    body: {
      why: "Roasting sweet golden beets highlights their natural betaine and nitric oxide precursors, topped with complete plant protein from shelled hemp hearts.",
      ingredients: [
        "2 medium golden beets, cubed and roasted",
        "3 tbsp raw shelled hemp hearts",
        "2 cups baby arugula",
        "1 tbsp balsamic reduction and olive oil",
      ],
      nutrition: "280 kcal · 12g Protein · 16g Fats · 6g Fiber",
      focusHints: ["circulation", "energy", "vitality", "nutrition"],
    },
  },

  // ─── WORKOUTS (8+) ─────────────────────────────────────────────────────────
  {
    kind: "workout" as const,
    slug: "cooling-parasympathetic-breath-movement",
    title: "Cooling Breathwork & Nervous System Reset",
    status: "published" as const,
    body: {
      focus: "Temperature regulation & Vagal Tone",
      difficulty: "Gentle",
      why: "Down-regulates sympathetic over-activation during warm flushes or tension spikes through diaphragmatic flow and prolonged exhalation.",
      focusHints: ["cooling", "vasomotor", "stress", "nervous-system"],
    },
  },
  {
    kind: "workout" as const,
    slug: "pelvic-floor-hip-mobility-flow",
    title: "Pelvic Floor & Hip Mobility Flow",
    status: "published" as const,
    body: {
      focus: "Pelvic Health & Joint Ease",
      difficulty: "Beginner",
      why: "Gentle 90-90 hip switches, cat-cow oscillations, and supported child's pose to maintain tissue suppleness and relieve low back tightness.",
      focusHints: ["joint", "pelvic", "mobility", "flexibility"],
    },
  },
  {
    kind: "workout" as const,
    slug: "twenty-minute-low-impact-interval",
    title: "20-Minute Low-Impact Zone 2 Stride",
    status: "published" as const,
    body: {
      focus: "Cardiovascular Health & Mitochondrial Stamina",
      difficulty: "Beginner",
      why: "Zone 2 aerobic movement preserves cardiovascular compliance without spiking cortisol or triggering sudden thermal flush sensations.",
      focusHints: ["cardio", "energy", "stamina", "metabolism"],
    },
  },
  {
    kind: "workout" as const,
    slug: "restorative-evening-unwind-yoga",
    title: "Restorative Evening Unwind & Legs-Up-The-Wall",
    status: "published" as const,
    body: {
      focus: "Circulation & Evening Decompression",
      difficulty: "Gentle",
      why: "Inversion and gentle supported spinal twists to facilitate lymphatic return, soothe tired legs, and prepare the nervous system for sleep.",
      focusHints: ["sleep", "wind-down", "restorative", "circulation"],
    },
  },
  {
    kind: "workout" as const,
    slug: "bone-density-functional-strength",
    title: "Bone Density & Postural Resistance Circuit",
    status: "published" as const,
    body: {
      focus: "Skeletal Loading & Core Stability",
      difficulty: "Intermediate",
      why: "Ground-reaction loading through goblet squats, hinge movements, and resistance bands to signal osteoblast bone remodeling.",
      focusHints: ["bone", "strength", "posture", "muscle"],
    },
  },
  {
    kind: "workout" as const,
    slug: "morning-sunlight-vitality-walk",
    title: "Morning Sunlight & Gentle Joint Activation",
    status: "published" as const,
    body: {
      focus: "Circadian Synchronization & Mobility",
      difficulty: "Gentle",
      why: "A 15-minute brisk outdoor morning walk to synchronize suprachiasmatic circadian rhythm and stimulate synovial joint fluid.",
      focusHints: ["circadian", "mood", "energy", "vitality"],
    },
  },
  {
    kind: "workout" as const,
    slug: "anti-fatigue-standing-desk-mobility",
    title: "5-Minute Midday Anti-Fatigue Desk Flow",
    status: "published" as const,
    body: {
      focus: "Postural Relief & Brain Clarity",
      difficulty: "Beginner",
      why: "Standing chest openers, neck mobility, and gentle calf pumps designed to reverse prolonged sitting fatigue in the middle of a workday.",
      focusHints: ["workday", "focus", "posture", "energy"],
    },
  },
  {
    kind: "workout" as const,
    slug: "core-stability-lumbar-protection",
    title: "Gentle Core Stability & Lumbar Protection",
    status: "published" as const,
    body: {
      focus: "Spinal Support & Abdominal Tone",
      difficulty: "Beginner",
      why: "Bird-dog variations, dead bugs, and side-lying bridges that stabilize the lumbar spine without putting strain on the neck or joints.",
      focusHints: ["core", "back", "stability", "strength"],
    },
  },

  // ─── MEDITATIONS (5) ────────────────────────────────────────────────────────
  {
    kind: "meditation" as const,
    slug: "deep-autonomic-evening-reset",
    title: "Deep Autonomic Evening Reset",
    status: "published" as const,
    body: {
      focus: "Evening Calm & Sleep Transition",
      minutes: 10,
      tier: "plus" as const,
      focusHints: ["sleep", "relaxation", "parasympathetic"],
      why: "Grounded mindfulness to transition away from executive cognitive tasks into physical ease.",
      steps: [
        "Lie comfortably on your back with arms relaxed at your sides.",
        "Scan your body from forehead to toes, releasing held tension.",
        "Lengthen your exhale to be twice the length of your inhale.",
        "Allow physical heaviness and warm safety to settle in.",
      ],
    },
  },
  {
    kind: "meditation" as const,
    slug: "midday-focus-clarity-pause",
    title: "3-Minute Midday Brain Fog Reset",
    status: "published" as const,
    body: {
      focus: "Mental Clarity & Cognitive Grounding",
      minutes: 3,
      tier: "free" as const,
      focusHints: ["focus", "brain-fog", "workplace"],
      why: "A rapid sensory reset to clear cognitive overload and anchor into the present moment.",
      steps: [
        "Sit upright with both feet firmly grounded on the floor.",
        "Name 3 sounds you can hear in this exact moment.",
        "Take three slow, full nasal breaths.",
        "Re-open your eyes with single-task focus.",
      ],
    },
  },
  {
    kind: "meditation" as const,
    slug: "thermal-flush-cooling-meditation",
    title: "Cooling Visualization for Thermal Surges",
    status: "published" as const,
    body: {
      focus: "Thermal Comfort & Equanimity",
      minutes: 7,
      tier: "plus" as const,
      focusHints: ["cooling", "hot-flash", "calm"],
      why: "Observational mindfulness that softens autonomic panic when internal thermal sensations arise.",
      steps: [
        "Acknowledge the wave of warmth without resistance or judgment.",
        "Visualize a cool, mountain-stream breeze moving across your skin.",
        "Breathe in cool, crisp air; breathe out excess thermal energy.",
        "Remind yourself: this wave is temporary and will pass.",
      ],
    },
  },
  {
    kind: "meditation" as const,
    slug: "heart-space-self-compassion",
    title: "Self-Compassion in Times of Transition",
    status: "published" as const,
    body: {
      focus: "Emotional Holding & Self-Kindness",
      minutes: 8,
      tier: "plus" as const,
      focusHints: ["self-compassion", "mood", "emotional"],
      why: "Offers gentle acceptance for physical and emotional changes during perimenopause.",
      steps: [
        "Place one hand over your heart and one hand on your belly.",
        "Feel the rhythmic warmth and movement of your breath.",
        "Mentally repeat: 'May I treat myself with kindness right now.'",
        "Hold yourself in this caring embrace for a few quiet minutes.",
      ],
    },
  },
  {
    kind: "meditation" as const,
    slug: "morning-grounded-intention-flow",
    title: "5-Minute Morning Grounded Intention",
    status: "published" as const,
    body: {
      focus: "Centering & Day Orientation",
      minutes: 5,
      tier: "free" as const,
      focusHints: ["morning", "intention", "energy"],
      why: "Begin the morning grounded in your own body rather than rushing into alerts.",
      steps: [
        "Sit on the edge of your bed before looking at any screens.",
        "Feel the gravity holding you securely in place.",
        "Set one simple intention for how you wish to feel today.",
        "Take one expansive breath and begin your day.",
      ],
    },
  },

  // ─── PARTNER ACTIVITIES (7) ────────────────────────────────────────────────
  {
    kind: "partner_activity" as const,
    slug: "evening-side-by-side-walk",
    title: "Evening Side-by-Side Stroll",
    status: "published" as const,
    body: {
      label: "Evening Stroll",
      suggestion: "A short 15-minute walk side by side without problem-solving. Walking side by side removes the intensity of face-to-face eye contact.",
      evidenceId: "ev-nams-001",
    },
  },
  {
    kind: "partner_activity" as const,
    slug: "herbal-tea-wind-down",
    title: "Dimmed Light Herbal Tea Routine",
    status: "published" as const,
    body: {
      label: "Herbal Tea Routine",
      suggestion: "Partner prepares a caffeine-free chamomile or peppermint tea 45 minutes before sleep with warm lighting.",
      evidenceId: "ev-mbsr-011",
    },
  },
  {
    kind: "partner_activity" as const,
    slug: "silent-dinner-prep",
    title: "Silent Meal Preparation Assistance",
    status: "published" as const,
    body: {
      label: "Silent Meal Prep",
      suggestion: "Step into the kitchen and chop vegetables or clean dishes without being asked, taking executive load away.",
      evidenceId: "ev-usda-007",
    },
  },
  {
    kind: "partner_activity" as const,
    slug: "five-minute-check-in",
    title: "Low-Pressure Weekly Check-in",
    status: "published" as const,
    body: {
      label: "Low-Pressure Check-in",
      suggestion: "Ask: 'What would feel most supportive this week?' Listen fully without offering solutions.",
      evidenceId: "ev-act-012",
    },
  },
  {
    kind: "partner_activity" as const,
    slug: "cooling-bedroom-prep",
    title: "Pre-Sleep Cooling & Ventilation Prep",
    status: "published" as const,
    body: {
      label: "Cooling Sleep Prep",
      suggestion: "Partner sets the thermostat to 67°F and opens a window 30 minutes before sleep to ensure thermal comfort.",
      evidenceId: "ev-nams-001",
    },
  },
  {
    kind: "partner_activity" as const,
    slug: "low-key-shared-hobby",
    title: "Shared Low-Key Downtime",
    status: "published" as const,
    body: {
      label: "Shared Downtime",
      suggestion: "Listen to an audio track or read side by side in quiet companionship.",
      evidenceId: "ev-cbt-010",
    },
  },
  {
    kind: "partner_activity" as const,
    slug: "nature-pause",
    title: "Weekend Quiet Nature Pause",
    status: "published" as const,
    body: {
      label: "Nature Pause",
      suggestion: "Spend 20 minutes sitting in a park or garden together with phones put away.",
      evidenceId: "ev-act-012",
    },
  },

  // ─── COUPLE CHALLENGES (4) ─────────────────────────────────────────────────
  {
    kind: "couple_challenge" as const,
    slug: "the-67f-pre-sleep-cooling-protocol",
    title: "The 67°F Pre-Sleep Cooling Protocol",
    status: "published" as const,
    body: {
      category: "Sleep Harmony",
      description: "Partner pre-sets bedroom cooling to 66°F–68°F 45 minutes before bedtime and prepares an extra light cotton layer.",
      benefit: "Reduces 3:00 AM awakenings and prevents middle-of-the-night thermostat battles.",
    },
  },
  {
    kind: "couple_challenge" as const,
    slug: "the-830-pm-friction-firewall",
    title: "The 8:30 PM Friction Firewall",
    status: "published" as const,
    body: {
      category: "Communication",
      description: "A shared pact: zero high-stakes conversations regarding family budgets, in-laws, or scheduling after 8:30 PM.",
      benefit: "Protects evening autonomic calm and prevents sleep-destroying cortisol spikes.",
    },
  },
  {
    kind: "couple_challenge" as const,
    slug: "silent-dinner-chore-offloading",
    title: "Silent Dinner & Chore Offloading",
    status: "published" as const,
    body: {
      category: "Household Support",
      description: "Partner takes total ownership of dinner preparation and cleanup on two designated high-fatigue evenings without asking.",
      benefit: "Removes executive decision fatigue for the woman after a long workday.",
    },
  },
  {
    kind: "couple_challenge" as const,
    slug: "co-regulated-box-breathing",
    title: "Co-Regulated Box Breathing (4-4-4-4)",
    status: "published" as const,
    body: {
      category: "Nervous System",
      description: "When emotional tension is sensed, sit quietly together for 2 minutes and synchronize four slow breath cycles.",
      benefit: "Down-regulates the sympathetic nervous system and signals physical safety.",
    },
  },
];

async function seedWellness() {
  try {
    await sequelize.authenticate();
    log.info("Connected to database");

    let created = 0;
    let updated = 0;

    for (const piece of SEED_PIECES) {
      const [row, wasCreated] = await ContentPiece.findOrCreate({
        where: { slug: piece.slug },
        defaults: piece,
      });

      if (!wasCreated) {
        await row.update({
          kind: piece.kind,
          title: piece.title,
          status: piece.status,
          body: piece.body,
        });
        updated += 1;
      } else {
        created += 1;
      }
    }

    log.info(`Wellness seeding completed: ${created} created, ${updated} updated.`);
    process.exit(0);
  } catch (error) {
    log.error("Failed to seed wellness library", error);
    process.exit(1);
  }
}

void seedWellness();
