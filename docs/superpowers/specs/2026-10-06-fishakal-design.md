# FiShakal: design spec

**Date:** 2026-10-06
**Status:** Approved design, pending implementation plan
**Working name:** FiShakal (open, see §14)

---

## 1. What this is

A nutrition tracker for people who eat food cooked by someone else, in a shared pot, in portions they did not weigh.

v1 is a single-user offline tracker, built to be dogfooded against the author's own 28-week fat-loss plan (`PLAN.md`, `FOOD.md`, `WEEK.md`). Community features come later and the v1 schema is shaped to make them possible without a rewrite.

---

## 2. Premise and its evidential status

The product rests on a claim:

> Existing trackers model regional home-cooked food badly, and gram-level logging is abandoned within weeks.

**This premise is UNVERIFIED.** It was tested during research and did not hold up as stated:

- The "bad Indian food data" complaint appears in competitor marketing and SEO content. It was not found in verifiable user reviews.
- The only first-person source located was a Blind thread: *"I mostly eat vegetarian Indian food and it's really difficult to track calorie intake with Indian food. I know there are some apps but they are wildly inaccurate."* One quote.
- Reddit was unreachable during research. That coverage is zero, not negative.

**Falsification test, outstanding:** install CalFix and Hint, log one home-cooked meal in each, compare against hand-calculated values. One hour. Until run, treat §2 as an assumption.

**Design consequence:** v1 must stand up even if the premise is false. The architecture below does. See §6.

---

## 3. What is verified

| Finding | Evidence |
|---|---|
| Market leader is actively disliked | HealthifyMe: Trustpilot 2.5/5, 539 reviews, 28% one-star. PissedConsumer 1.3/5 |
| The pain is billing, not nutrition | *"Auto debit from account although I am not availing"* · *"They were clueless and were only interested in selling coaching"* · *"Its a scam please don't register and pay anything"* (all Sept 2026) |
| Offline/no-account fitness tooling is trending | openGym: 0 → 4,013 stars, 630 forks, 50 contributors in under 10 weeks (created 2026-07-18). Flat JSON files, no database |
| That growth was not Hacker News | Only HN submission scored 1 point. Growth came from X amplification and fork virality |
| Nutrition is uncontested in that scene | All three researched open-source fitness projects omit nutrition entirely |

### Claimed by competitors, unverified

Vessel-unit logging (katori/ladle/bowl) is claimed by HealthifyMe, VoCal, Hint, CalFix and Nutrimate. Protein-per-rupee is claimed by GymBuddy India. All of these surfaced via their own SEO content; none were verified in an app store.

Vessel units and cost-ranking are table stakes. Neither can carry the product on its own.

---

## 4. Locked decisions

| Decision | Value | Rationale |
|---|---|---|
| v1 spine | Plate-not-grams logging | Adherence is the binding constraint |
| v1 surface | **Log only** | Plan deferred to v1.5 by decision |
| Platform | Next.js 16 PWA, installable | Existing stack, no store review, mobile-first |
| Backend | **None in v1** | See §7 |
| Source | Closed, commercial | Set at outset |
| Food data | Hand-seeded + USDA FDC (CC0) | No INDB dependency |
| Monetization | Deferred until after launch | Caveat in §6 |

---

## 5. Non-goals for v1

Accounts · auth · server · hosted database · barcode scanning · workout tracking · community contributions · household/multi-user mode · the Plan surface · the INDB permission request · any paid tier.

---

## 6. Positioning (open)

Three candidates, all producing identical architecture. Decide before launch, not before build.

1. **"No account. No subscription. Works offline."** Counter-positions the verified pain directly. Strongest evidence base. **Risk: it forecloses monetization.** A launch promise of "no subscription" cannot later become a subscription without breaking faith with early users. Given the stated intent to launch first and price later, this needs deliberate resolution. A one-time purchase or a paid hosted sync tier stays compatible; a recurring fee for the core app does not.
2. **"Built for people who eat what's cooked at home."** Emotionally strongest, rests on the unverified §2 premise.
3. **"The fastest way to log a meal. 3 taps."** Measurable, demonstrable in a five-second video, independent of both open questions.

---

## 7. Architecture

### No backend

Next.js 16 static export, deployed to Vercel. All state in IndexedDB via Dexie. Device migration by JSON export/import.

The app works fully offline. There is no auth layer, no hosting cost, and no personal data on any server, which also means there is nothing to breach and no stored payment relationship. Accounts arrive in v2 only when community features require them, and sync will be opt-in.

**Known ceiling:** no cross-device sync, and data is lost if the user clears browser storage without exporting. Mitigation is a visible export prompt on a cadence, plus install-as-PWA guidance (installed PWAs are not cleared by routine browser cache clearing). Revisit when v2 introduces accounts.

### Design language

Minimalist, high-contrast, type-led. No decorative chrome. Every screen answers one question. Default to dark. The logging screen is the product; everything else is secondary navigation.

---

## 8. Data model

```
Ingredient
  id, name, per-100g nutrients (canonical units), density_g_per_ml?
  price? { amount_inr, per_unit, city, observed_at }    # v1.5

Dish
  id, name, owner_scope (seed | user)
  macros_per_100g              # authored directly, OR derived from Recipe
  derivation: 'authored' | 'recipe'
  default_portion_id?          # anchors relative sizing

Recipe                          # optional, per Dish
  dish_id, items: [{ ingredient_id, grams }]
  yield_grams, retention_factor

PortionDef
  id, dish_id, kind, label, grams, photo_ref?

LogEntry
  id, dish_id, portion_def_id, count, slot, logged_at
  # resolves to grams -> nutrients at read time, never denormalized

BodyLog
  id, logged_at, weight_kg?, waist_cm?, photo_ref?
```

`Dish.macros_per_100g` is populated either by direct authoring (estimate) or computed from `Recipe` (exact). Expansion is opt-in per dish and reversible. The Log surface never requires a Recipe.

`LogEntry` stores the portion reference, not the computed grams. Recalibrating a vessel retroactively corrects every past entry that used it. This is the intended behaviour.

---

## 9. Portion resolution

Every portion kind resolves through one function to grams. The nutrient engine never learns which kind was used.

| kind | Input | Resolution |
|---|---|---|
| `metric` | grams or ml | Identity; ml via `density_g_per_ml` |
| `vessel` | katori, ladle, tumbler, cup, plate | Seeded default volume × density. User-editable once, per vessel, globally |
| `hand` | fist, palm, cupped hand, thumb | Seeded constant per unit |
| `photo` | User's own photo of their usual portion | Grams set once at capture; the photo is the recall cue |
| `relative` | less / usual / more | Multiplier × `default_portion_id` grams |

**Relative multipliers:** `less = 0.7`, `usual = 1.0`, `more = 1.4`. Hardcoded constants in one module, tunable later. These are estimates, not measurements.

**Photo mode is user-generated.** The user photographs their own portion once; that image becomes the reference thereafter. No content pipeline, calibration is personal by construction, and the captured photos become contributable assets in v2.

**Vessel calibration is a single editable number, not a flow.** Ship sensible defaults (katori ≈ 150 ml, ladle ≈ 60 ml), expose them in settings, build nothing more.

---

## 10. Nutrient model

Canonical unit per nutrient, fixed at the storage layer. All ingest normalizes into it.

**Mandatory test, day one:** a unit-conversion test that fails if milligram or microgram quantities are ever read as grams. OpenNutriTracker shipped this exact bug; users' micronutrient totals silently read near zero while appearing to function. The test exists specifically to make that failure loud.

Nutrient set: start with the macros plus the micronutrients already tracked in `PLAN.md`. Extend only on demand.

---

## 11. Signature interaction

Open → today's six slots → tap slot → recents first → tap dish → tap portion chip → done.

**Budget: 3 taps, under 5 seconds, from cold start.** Treat this as a hard requirement. Any logging path that exceeds it is a defect.

Recents and time-of-day ordering do most of the work: the same dozen dishes recur, and the slot predicts the dish.

---

## 12. Seed data

~50 dishes and ~200 ingredients, hand-authored from `PLAN.md`, `FOOD.md` and `WEEK.md`, which already contain this information in prose. Ingredient primitives (dal, rice, soya, egg, chicken, fish, curd, oils) from USDA FoodData Central, CC0.

No external dataset is a dependency for v1.

---

## 13. Licensing constraints

The product is closed-source and commercial. These constraints are binding.

| Source | License | Usable |
|---|---|---|
| USDA FoodData Central | CC0 | **Yes** |
| `hasaneyldrm/exercises-dataset` metadata + instructions | MIT (split license; images are proprietary GymVisual) | **Yes, metadata only**, preserve notice |
| INDB / Anuvaad | **No license file.** CC BY 4.0 covers the paper, not the data | **No**. Written permission required first |
| IFCT 2017 (ICMR-NIN) | Restricted-use, PDF only | **No** |
| `ifct2017/ifct2017` | AGPL-3.0 | **No**. Network use triggers disclosure |
| Open Food Facts | ODbL (share-alike on the database) | **Live query only, never ingest** |
| `DuarteSantos8/openGym` | AGPL-3.0 | **No code.** Concepts only |
| `simonoppowa/OpenNutriTracker` | GPL-3.0 | **No code.** Concepts only |

No code from any researched project enters this codebase. Algorithms that were useful (1RM estimation, progression rule engines, RIR normalization) are documented in prose for independent reimplementation if workouts ever enter scope.

`alexpcosta/opengym` is a stale fork of `DuarteSantos8/openGym`, roughly 1,000 commits behind. Disregard.

---

## 14. Open questions

1. **Positioning** (§6), and specifically whether "no subscription" is a promise we are willing to keep permanently.
2. **Name.** FiShakal reads as "in shape" and is distinctive. Not yet validated for domain availability, pronunciation outside Tamil/Urdu speakers, or trademark conflict.
3. **§2 premise.** Falsification test not yet run.
4. **Export cadence.** How aggressively to prompt backup given the no-backend ceiling in §7.

---

## 15. Roadmap

| Version | Scope |
|---|---|
| **v1** | Log surface. Offline, no account. Seeded dishes. Export/import |
| **v1.5** | Plan surface: ingredient + ₹ price table, protein-per-rupee optimizer, shopping list. Barcode via live OFF query |
| **v2** | Accounts, opt-in sync, community dish contributions with photos (bet D) |
| **v3** | Household mode: one person logs the pot, shares split by portion (bet C) |
| **Later** | Workouts, using the MIT exercise metadata |

Bets C and D are deferred, not dropped. The §8 schema accommodates both: `Dish.owner_scope` is the contribution hook, and `PortionDef` already models a share of a known quantity.

---

## 16. Success criteria for v1

1. The author logs every meal for 14 consecutive days without abandoning it.
2. Median logging time per meal under 5 seconds.
3. Daily totals agree with hand-calculated values from `PLAN.md` within 10%.
4. Works with the device in airplane mode, start to finish.
5. Export produces a file that reimports to an identical state.

Criterion 1 is the one that decides whether the product works. The others exist to measure it.
