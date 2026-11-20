# Repository Guidelines

Build in small milestones. Run `npm run typecheck && npm run lint && npm test` after each milestone and commit it with a clear message. Run `npm run dev` to launch Electron, `npm run build` for the production bundle, and `npm run dist` for Windows packages. Run one test file with `npm test -- tests/<file>.test.ts`.

Use strict TypeScript throughout. Explain any unavoidable use of `any`. Keep colors, fonts, radii, and shadows in theme tokens. Keep English and Arabic UI text in the i18next locale files and verify RTL layout. Every user-facing collection must support creation, editing, reordering, deletion, and undo.

Persistent data goes through the main-process storage service. Keep filesystem access outside the renderer. Use Electron context isolation, sandboxing, a narrow typed preload bridge, and a restrictive Content Security Policy. Keep remote content out of the main window. Validate every IPC payload with Zod.

Features must work offline. Optional external network calls are limited to user-supplied ICS feeds, requested Aladhan prayer verification, and explicitly requested location detection. Never collect university passwords or session cookies. Never scrape pages behind a login. Review imported data before applying it.

Cover pure logic with unit tests, including time calculations, scheduling conflicts, import formats, GPA, stats, streaks, and sync behavior. Record decisions about ambiguous requirements in `docs/DECISIONS.md`. Bundle only appropriately licensed fonts, images, and sounds. Record third-party assets in `resources/LICENSES.md`. Use original artwork for themes and avoid franchise or club marks.
