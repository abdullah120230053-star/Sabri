# Quality checks

## Automated

Run `npm run typecheck`, `npm run lint`, and `npm test` for schema, storage, import, prayer calculation, task recurrence, timers, GPA, stats, and phone protocol tests.

After `npm run build`, run `node tests/electron-smoke.mjs --phone` for the desktop and a mobile-size Chrome session on the local network. The test opens every theme image, checks reduced motion, adds coursework, reviews a timetable, checks prayer completion, creates a note and a theme, saves a dashboard preset, and reloads the same profile. The phone check pairs over Wi-Fi, queues a prayer check while offline, reconnects, and revokes the device.

Run `node tests/electron-hidden.mjs` to finish a one-minute focus session with the whole desktop window hidden and verify that its session and notification were persisted. Use `SABRI_TEST_EXECUTABLE` with either test to exercise a separately built executable.

## Windows release

- Build the installer and portable executable. Check that the unpacked app launches with the bundled phone UI, artwork, fonts, and audio.
- In a new profile, add a full timetable and drag a class between days. Resize it onto a neighbor and confirm the overlap marker. Export the week as PNG, CSV, and ICS.
- On a device with OS notifications enabled, confirm the native banner is visible while the application is hidden. Windows Focus Assist can suppress it.
- With Sabri’s HM-Bar sharing enabled, open the Sabri panel from HM-Bar and verify the timer and next prayer. The `sabri://focus` link is registered by the installer.
- Test a real student calendar feed or timetable export with permission from its owner. The repository fixtures are synthetic and contain no university account data.

The automated phone run uses Chrome with a phone-sized viewport. Real Android and iOS camera, browser, Wi-Fi firewall, installation, and notification behavior should be checked on the intended hardware.
