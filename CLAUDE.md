# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

**Start dev server (Expo Go / QR code):**
```powershell
npm start
```

**Run on specific platform:**
```powershell
npm run android   # Android emulator or device
npm run ios       # iOS simulator (macOS only)
npm run web       # Browser
```

> On Windows, if `npm` is not found in a new terminal, refresh PATH first:
> `$env:PATH = [System.Environment]::GetEnvironmentVariable("PATH","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("PATH","User")`

> Always refer to versioned Expo docs at https://docs.expo.dev/versions/v54.0.0/ before writing Expo-specific code.

## Stack

- **Expo SDK 54** / React Native 0.81.5 / React 19.1.0
- No file-based routing; no React Navigation library
- AsyncStorage for all persistence
- expo-av + Web Audio API for audio (platform-branched in `src/utils/sounds.js`)
- expo-notifications for per-habit reminders
- react-native-svg + react-native-chart-kit for charts and rings

## Architecture

**Entry point:** `index.js` → `registerRootComponent(App)` → `App.js`

**Navigation:** Custom slide navigator in `App.js`. All 5 screens are rendered simultaneously in a horizontal `Animated.View`; inactive screens have `pointerEvents="none"`. Navigation is driven by swipe gestures (`PanResponder`) and tab-bar taps. Tab order: Today → Progress → Challenge → Habits → Settings.

**Global state:** `src/context/AppContext.js` — single React Context + `useState` hooks wrapping the entire app. All business logic (habits, completions, challenges, settings, streaks) lives here. Screens consume it via `useContext(AppContext)`.

**Screens** (`src/screens/`):
- `TodayScreen` — daily habit list, increment/decrement, streak display
- `ProgressScreen` — 7/30/90-day bar charts and heatmaps
- `ChallengeScreen` — active & archived challenges (max 3 concurrent)
- `HabitsScreen` — create/edit/delete habits, per-habit reminders, custom icons
- `SettingsScreen` — theme, notifications, sound, haptics, dev tools (date offset)
- `OnboardingScreen` — 3-slide first-run walkthrough (rendered outside the navigator)

**Components** (`src/components/`): `HabitCard`, `ProgressRing` (SVG), `TimePicker` (wheel-only modal), `TrophyCelebration`, `CelebrationOverlay`, `CompletionCelebration`

**Utilities** (`src/utils/`): `storage.js` (AsyncStorage wrappers), `sounds.js`, `haptics.js`, `notifications.js`

**Theme:** `src/theme/colors.js` exports light and dark token objects (16 values each); active theme is selected in AppContext based on settings.

## Data Models

All data is persisted via AsyncStorage as JSON.

- **Habit:** `{ id, name, icon (uri|null), type ('boolean'|'volume'), goal, unit, reminderTime (HH:MM|null), createdAt }`
- **Completions:** keyed by `YYYY-MM-DD`, each date maps `habitId → count`
- **Challenge:** `{ id, name, habitId, targetDays, startDate, endDate, tier ('platinum'|'gold'|'silver'|'copper'), completedDate|null, archived }`
- **Settings:** `{ theme, soundEnabled, hapticsEnabled, notificationsEnabled, dateOffset (dev tool) }`

## Key Behaviors

- "Today" uses `dateOffset` (from Settings dev tools) to simulate different dates during development.
- Volume habits track a numeric count; boolean habits toggle 0/1.
- Streaks are computed on-the-fly from the completions map.
- Challenge tiers are determined at challenge creation based on `targetDays`.
- Audio is implemented differently on web (Web Audio API oscillator) vs. native (expo-av WAV via expo-file-system).
