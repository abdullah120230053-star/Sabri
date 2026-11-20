# Design decisions

- The app starts with empty personal data. An example timetable and sample tasks can be added from Settings.
- The desktop stores a versioned JSON snapshot with separate domain collections in a single atomic transaction. Importing many rows and completing a linked focus session are each committed as one write.
- Calendar exports are the supported integration boundary for Classroom and Moodle. Files and copied timetable tables cover university SIS installations with different export formats.
- The default academic week begins on Saturday and the default location is Cairo. Clean Light is the initial appearance. The dashboard groups the student's schedule, daily focus, prayer and next actions into a compact overview.
- Scheduled calendar checks stage a review. The user confirms changes before they are applied. ICS links are encrypted separately using the OS credential store.
- Phone edits use small operations with server-receipt ordering. An already-open tab works offline on LAN HTTP using IndexedDB. Optional Secure Wi-Fi provides HTTPS for a service worker and opt-in Web Push. Lock-screen alerts use the receiving browser’s encrypted push service.
- The HM-Bar bridge is opt-in and read-only. It shares only the live focus timer and next prayer through a versioned status file in the current account’s Sabri profile.
- Theme artwork uses local generated WebP images with CSS perspective, theme-specific particles and a reduced-motion fallback.
