# Demo & Feature Walkthrough — HerCompassAI

This walkthrough guides engineers and stakeholders through key user journeys across the HerCompassAI platform.

---

## Journey 1: New Member Registration & Onboarding

1. **Sign Up**:
   - Navigate to `/` → Click **Get Started** or **Sign Up**.
   - Enter Name, Email, and Password (requires uppercase, lowercase, number, symbol).
   - Backend creates account and dispatches an activation email. In local mode, the verification link is logged in the backend terminal.
2. **Interactive Menopause Snapshot (Onboarding)**:
   - **Step 1: Life Stage & Symptoms**: Select phase (*Perimenopause, Menopause, Postmenopause, Unsure*) and primary concerns (*Hot flashes, Brain fog, Fatigue, Sleep*).
   - **Step 2: Nutrition & Lifestyle**: Dietary preferences, food sensitivities, post-meal energy.
   - **Step 3: Emotional Baseline**: Mood sliders (anxious, calm, motivated) and stress resilience goals.
   - **Step 4: Movement & Routine**: Activity level and preferred exercises.
   - **Step 5: Consent & Preferences**: AI check-in preferences and optional partner invite.
3. **Deterministic Scoring**:
   - On submission (`POST /api/onboarding`), backend deterministic services calculate symptom burden index, nutrition balance score, and baseline resilience score.

---

## Journey 2: Daily Member Check-In & Trend Tracking

1. **Daily Log Submission**:
   - Member logs sleep hours, energy levels, mood ratings, and symptom occurrences (e.g., hot flashes count, severity).
2. **Trend Analytics**:
   - Deterministic engine calculates rolling 7-day and 14-day changes (e.g. `+18% hot flash frequency`, `improved sleep efficiency`).
   - Visualized with SVG charts using `recharts` on the Member Dashboard.

---

## Journey 3: AI Insight Generation & SCI Safety Layer

1. **Requesting Insight**:
   - Member clicks **Generate Today's Insight** (`POST /api/ai/insight` or `POST /api/ai/generate`).
2. **Safety, Compliance & Intelligence (SCI)**:
   - AI Gateway injects retrieved evidence (NAMS / ACOG guidelines) and deterministic trend calculations into the prompt.
   - The response is tone-checked by SCI: observational language only (e.g. *"Your logs show an increase in evening fatigue. Studies suggest gentle restorative yoga may support deeper sleep."*). No medical diagnosis or prescription wording is permitted.

---

## Journey 4: Couple & Partner Support (CPS) & Men's Academy

1. **Inviting a Partner**:
   - Member visits Partner Settings and generates an invite code (`POST /api/member/partner/invite-link`).
   - Partner registers with the invite token and establishes a linked relationship.
2. **Consent Firewall**:
   - Member configures consent toggles (e.g., share weekly empathy digest: YES; share raw symptom logs: strictly NOT ALLOWED by architectural design).
3. **Weekly Partner Digest**:
   - Partner dashboard displays actionable empathy prompts, communication advice, and phase awareness guidance.
4. **Men's Academy**:
   - Partner views educational modules explaining biological shifts, supportive communication, and lifestyle synergy.
   - Gated by Couple subscription tier.

---

## Journey 5: Admin CMS & Clinician Evidence Review

1. **Admin Login**:
   - Authenticate with admin or clinician role (`POST /api/auth/login`).
2. **Publishing Academy Lessons**:
   - Create or publish educational lessons in Admin CMS → instantaneously accessible to eligible partners.
3. **Clinical Review Sign-off**:
   - Review RAG evidence base and assign clinician signature.
   - Updates `fullyClinicianReviewed: true` on `GET /api/ai/health`.
