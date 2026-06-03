# MyApp

A habit-tracking mobile app built with Expo and React Native.

## Features

- **Daily habit tracking** — boolean (done/not done) and volume-based (count toward a goal) habit types
- **Streaks** — computed live from your completion history
- **Challenges** — set a streak target for a habit; earn platinum, gold, silver, or copper tiers on completion (up to 3 active at once)
- **Progress view** — 7/30/90-day bar charts and heatmaps per habit
- **Per-habit reminders** — push notifications scheduled at a time you choose
- **Light / dark theme**
- **Haptic feedback and chimes** on completions
- **Custom habit icons** via the device image picker
- **Onboarding** — 3-slide walkthrough on first launch

## Tech Stack

| Layer | Library / Version |
|---|---|
| Framework | Expo SDK 54 / React Native 0.81.5 / React 19.1.0 |
| State | React Context + useState |
| Persistence | AsyncStorage 2.2.0 |
| Charts | react-native-chart-kit + react-native-svg |
| Audio | expo-av (native) / Web Audio API (web) |
| Notifications | expo-notifications |
| Image picker | expo-image-picker |

## Getting Started

**Prerequisites:** Node.js, the [Expo Go](https://expo.dev/go) app on your phone.

```bash
npm install
npm start
```

Scan the QR code with Expo Go (Android) or the Camera app (iOS) to run on your device.

```bash
npm run android   # Android emulator
npm run ios       # iOS simulator (macOS only)
npm run web       # Browser
```

## Project Structure

```
src/
  context/    # AppContext — global state and all business logic
  screens/    # TodayScreen, ProgressScreen, ChallengeScreen, HabitsScreen, SettingsScreen
  components/ # HabitCard, ProgressRing, TimePicker, celebration overlays
  utils/      # storage, sounds, haptics, notifications
  theme/      # colors (light + dark tokens)
App.js        # Custom slide navigator (swipe + tab bar, no navigation library)
```

## License

MIT
