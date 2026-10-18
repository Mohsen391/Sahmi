---
name: Sahmi scope and data rules
description: User-defined product boundaries, historical-data requirements, and deployment intent.
---

Sahmi is an educational investing decision game for beginners aged 18–25 in Kuwait. All app-facing copy must be simple Kuwaiti Arabic with RTL layout, and it must state that it is educational only, not investment advice.

The fixed character is Fahad, 22, a fresh graduate with 1,000 fake KD and a car goal in two years. The MVP has one historical period of about twelve months and exactly three decisions: allocation across stock fund/bonds/gold/cash; hold/sell some/buy more during a drop; and funding a surprise 300 KD expense. Score diversification, calm, and cash readiness—not profit. Explanation texts must be prewritten and stored with the scenario.

Use real historical prices only. If reliable series cannot be retrieved, stop and request CSVs with the exact series and dates; never invent historical prices or silently substitute sample values. Scenario prices, events, and explanations must be stored in MongoDB and loaded through the API.

Use React/Vite, Express, and MongoDB Atlas with Mongoose. The user explicitly excludes login, saved progress, AI explanations, quizzes, friend challenges, live prices, Shariah mode, and payments from this MVP. Vercel is the intended later deployment target; do not configure deployment now.

**Why:** These are explicit requirements and exclusions in the user's supplied Sahmi brief; the attached shop instructions apply only for general security and quality rules, not their shop-specific stack or features.

**How to apply:** Keep future work within these MVP boundaries unless the user changes them. Preserve reusable MongoDB connections, server-only environment secrets, validated API inputs, mobile responsiveness, and clear loading/error states.
