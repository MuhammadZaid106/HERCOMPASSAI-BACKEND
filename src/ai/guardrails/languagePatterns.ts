/**
 * Guardrail language catalogue.
 *
 * Every pattern here encodes a rule from the HerCompassAI spec: no diagnosis, no
 * prescription, no unsupported medical or nutrition claims, no unsupported
 * certainty, no unsafe content.
 *
 * Patterns are deliberately precise. A guardrail that fires on "You have shared
 * your goals" is worse than no guardrail, because it trains users to ignore the
 * real ones.
 */

export const DIAGNOSTIC_BLOCK_PATTERNS: ReadonlyArray<{ id: string; pattern: RegExp }> = [
  {
    id: "condition_assertion",
    pattern:
      /\byou(?:'re|\s+are|\s+have|\s+has)\s+(?:suffering\s+from|afflicted\s+with|diagnosed\s+with|struggling\s+with)\b/i,
  },
  {
    id: "named_condition",
    pattern:
      /\byou\s+(?:have|has)\s+(?:an?|the)\s+[\w-]+(?:\s+[\w-]+){0,3}\s+(?:disease|disorder|syndrome|diagnosis|medical\s+condition)\b/i,
  },
  {
    id: "proves_condition",
    pattern: /\bthis\s+(?:proves|confirms|diagnoses|means)\s+that\s+you\b/i,
  },
  {
    id: "symptoms_indicate",
    pattern: /\byour\s+(?:symptoms|results|scores?|readings?)\s+(?:indicate|prove|show)\s+that\s+you\s+(?:have|are)\b/i,
  },
  {
    id: "certainty_of_illness",
    pattern:
      /\byou\s+(?:are|were)\s+(?:likely|probably|definitely|certainly|clearly)\s+(?:suffering|diagnosed|ill|unwell|depressed|anxious|menopausal)\b/i,
  },
  {
    id: "suffer_from",
    pattern: /\byou\s+suffer\s+from\b/i,
  },
];

/**
 * Prescription and dosing instructions. These are unconditional blocks — no
 * dosage, no imperative medication advice, ever.
 */
export const PRESCRIPTION_BLOCK_PATTERNS: ReadonlyArray<{ id: string; pattern: RegExp }> = [
  {
    id: "dosing_instruction",
    pattern:
      /\b(?:take|start|stop|increase|decrease|switch\s+to|apply|inject|swallow)\s+(?:a|an|the|your)?\s*\d+(?:\.\d+)?\s*(?:mg|mcg|ml|iu|units?|tablets?|pills?|capsules?|drops?)\b/i,
  },
  {
    id: "dosing_amount",
    pattern: /\bat\s+\d+(?:\.\d+)?\s*(?:mg|mcg|ml|iu|units?|tablets?|pills?|capsules?|drops?)\b/i,
  },
  {
    id: "daily_dose",
    pattern: /\b\d+(?:\.\d+)?\s*(?:mg|mcg|ml|iu)\s+(?:daily|per\s+day|each\s+day|twice|once|at\s+night)\b/i,
  },
  {
    id: "prescription_verdict",
    pattern: /\b(?:we|i)\s+prescribe\b|\bprescription\s+for\b|\byour\s+dose\s+should\b|\bdosage\s+of\b/i,
  },
  {
    id: "imperative_medication",
    pattern:
      /\byou\s+should\s+(?:take|start|stop|use|begin)\s+(?:the\s+|a\s+|an\s+)?[\w-]{3,}(?:\s+[\w-]{2,}){0,2}\b/i,
  },
  {
    id: "therapy_prescription",
    pattern:
      /\b(?:hrt|hormone\s+replacement\s+therapy|hormone\s+therapy)\s+(?:is|will\s+be|would\s+be)\s+(?:the\s+)?(?:best|right|needed|correct|helps?|helping|cures?|treats?)\b/i,
  },
  {
    /**
     * A recommendation that names a clinical treatment. Requires both a
     * recommendation verb and a clinical term inside the same sentence, so
     * ordinary wellness advice ("we recommend you keep a consistent wake time")
     * is never caught.
     */
    id: "recommended_regimen",
    pattern:
      /\b(?:recommend|advise|suggest|consider)\w*\b[^.!?]{0,60}\b(?:hrt|hormone\s+replacement\s+therapy|hormone\s+therapy|estrogen|estradiol|progesterone|progestin|progestogen|medication|therapy|antidepressant|supplement|antibiotic)\b/i,
  },
  {
    id: "imperative_therapy_change",
    pattern:
      /\byou\s+(?:should|must|need\s+to|have\s+to)\s+(?:start|begin|continue|stop|increase|decrease|change)\s+(?:the\s+|a\s+|an\s+|your\s+)?[\w-]{3,}(?:\s+[\w-]{2,}){0,2}\b/i,
  },
];

/** Medication and therapy mentions. Not automatically unsafe, but never uncited. */
export const MEDICATION_MENTION_PATTERN =
  /\b(?:estrogen|estradiol|progesterone|progestin|progestogen|testosterone|venlafaxine|gabapentin|clonidine|fezolinetant|ospemifene|bazedoxifene|raloxifene|sertraline|fluoxetine|citalopram|mirabegron|antidepressant|sleeping\s+pill|SSRI|SNRI|HRT|hormone\s+replacement\s+therapy)\b/i;

/** Therapeutic nutrition and supplement claims. */
export const NUTRITION_BLOCK_PATTERNS: ReadonlyArray<{ id: string; pattern: RegExp }> = [
  {
    id: "therapeutic_food_claim",
    pattern:
      /\b(?:cures?|heals?|reverses?|treats?|eliminates?)\s+(?:your\s+|the\s+)?(?:inflammation|insomnia|anxiety|depression|hot\s+flashes?|night\s+sweats?|weight\s+gain|thyroid|diabetes|migraines?)\b/i,
  },
  {
    id: "detox_claim",
    pattern: /\b(?:detox|cleanse)\b.{0,30}\b\d+\s*(?:day|week|days|weeks)\b/i,
  },
  {
    id: "supplement_dosing",
    pattern: /\b(?:supplement|vitamin|mineral|herb|probiotic)s?\s+at\s+\d+\s*(?:mg|mcg|iu|g)\b/i,
  },
  {
    id: "metabolic_claim",
    pattern: /\bboosts?\s+(?:your\s+)?(?:immunity|metabolism|thyroid|oestrogen|estrogen\s+levels)\b/i,
  },
];

/** Content the Gateway must never pass through, under any framing. */
export const UNSAFE_CONTENT_PATTERNS: ReadonlyArray<{ id: string; pattern: RegExp }> = [
  { id: "self_harm", pattern: /\b(?:kill|hurt|harm|cut)\s+(?:your\s?self|yourself|myself|themselves)\b/i },
  { id: "suicide", pattern: /\bsuicid(?:e|al)\b/i },
  { id: "self_harm_noun", pattern: /\bself[\s-]?harm(?:ing)?\b/i },
  { id: "overdose", pattern: /\boverdos(?:e|ing)\b/i },
  { id: "harm_others", pattern: /\b(?:kill|hurt|harm|attack)\s+(?:someone|others|people|him|her|them)\b/i },
];

/**
 * Crisis disclosure is separated from unsafe content so the deterministic
 * fallback can respond helpfully instead of silently blocking.
 *
 * Contraction-free forms are matched deliberately: a member is more likely to
 * write "do not want to be here" than "don't".
 */
export const CRISIS_DETECTION_PATTERN =
  /\b(?:suicid\w*|self[\s-]?harm|kill(?:ing)?\s+my\s?self|end\s+my\s+life|(?:don'?t|do\s+not|doesn'?t|does\s+not)\s+want\s+to\s+(?:live|be\s+here|go\s+on)|(?:no\s+reason\s+to\s+(?:live|keep\s+going|go\s+on)))\b/i;

/** Any diagnostic vocabulary. Allowed only when explicitly negated. */
export const DIAGNOSTIC_VOCABULARY_PATTERN = /\bdiagnos\w*/i;

export const DIAGNOSTIC_NEGATION_PATTERN =
  /\b(?:not\s+a\s+diagnos\w*|no\s+diagnos\w*|never\s+diagnos\w*|does\s+not\s+diagnos\w*|cannot\s+diagnos\w*|not\s+diagnos\w*|non[\s-]?diagnostic)\b/i;

export const PROGNOSIS_BLOCK_PATTERNS: ReadonlyArray<{ id: string; pattern: RegExp }> = [
  {
    id: "prognosis_prediction",
    pattern: /\byou\s+will\s+(?:develop|progress\s+to|end\s+up\s+with|suffer\s+from)\b/i,
  },
  {
    id: "prognosis_timeline",
    pattern: /\bwithin\s+\d+\s*(?:months?|years?)\s+you\s+will\b/i,
  },
  {
    id: "inevitable_claim",
    pattern: /\byou\s+(?:are\s+d)?(?:destined|bound)\s+to\s+(?:experience|develop|suffer)\b/i,
  },
];

/**
 * Content that discourages professional care or claims clinical authority.
 * Encouraging someone to stay away from a clinician is a safety failure even
 * when the underlying advice is otherwise reasonable.
 */
export const SAFETY_CONTRADICTION_PATTERNS: ReadonlyArray<{ id: string; pattern: RegExp }> = [
  {
    id: "discourages_clinician",
    pattern:
      /\byou\s+(?:do\s+not|don'?t|no)\s+need\s+(?:to\s+)?(?:see|visit|consult|contact)\s+(?:a\s+|your\s+|any\s+)?(?:doctor|clinician|physician|healthcare\s+professional|gynaecologist|gynecologist)\b/i,
  },
  {
    id: "discourages_treatment",
    pattern: /\byou\s+(?:can\s+)?(?:skip|avoid|stop)\s+(?:your\s+)?(?:medication|treatment|prescription|therapy)\b/i,
  },
  {
    id: "clinical_authority_claim",
    pattern: /\b(?:this\s+is|i\s+am)\s+(?:your\s+)?(?:medical|clinical|health)\s+advice\b/i,
  },
  {
    id: "replaces_professional_care",
    pattern: /\b(?:instead\s+of|rather\s+than)\s+(?:a\s+|your\s+)?(?:doctor|clinician|healthcare\s+professional|therapy)\b/i,
  },
  {
    id: "safe_to_ignore",
    pattern: /\b(?:you\s+can|it'?s\s+fine\s+to)\s+(?:safely\s+)?ignore\s+(?:this|those|your)\s+(?:symptoms?|signs?|results?)\b/i,
  },
];

/** Numeric token used for hallucination detection (percentages, scores, counts). */
export const NUMERIC_TOKEN_PATTERN = /(?<![\w/])(\d+(?:\.\d+)?)(?![\w/])/g;
