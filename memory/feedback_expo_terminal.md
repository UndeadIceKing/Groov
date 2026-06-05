---
name: feedback-expo-terminal
description: How user wants Expo dev server launched — new visible terminal for phone QR code scanning
metadata:
  type: feedback
---

When the user says "run Expo" or "open in Expo", they want a new terminal window opened (not background) showing the QR code so they can scan it with Expo Go on their phone.

**Why:** They test on a physical device via Expo Go, not an emulator or browser.

**How to apply:** Use `powershell.exe -Command "Start-Process cmd -ArgumentList '/k', 'cd /d \"<path>\" && npx expo start'"` to open a visible terminal. The batch file approach (`start-expo.bat`) also works as a fallback.
