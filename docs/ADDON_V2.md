# Sabri Add-on v2

This add-on extends the original build plan. Its requirements take precedence where they differ.

## Foundation

The settings and record validators live in `src/shared/addon-schema.ts`. Sabri keeps these collections in its existing atomic snapshot. Existing snapshots load with empty add-on collections and default values, including a 6-hour focus cap, 15% planning buffer, 2- and 5-day exam review spacing, and all themes unlocked. Worship scoring starts disabled. These defaults apply to both existing and new planner profiles.

| Logical domain from the plan | Snapshot collections |
| --- | --- |
| Plan | `planBlocks`, `energyProfiles`, `dayReviews` |
| Exam prep | `examPlans`, `studySessions` |
| Formulas | `formulas` |
| Assignments | `assignments`, `checklistTemplates` |
| Parking lot | `parkingItems` |
| Progress | `progressEvents`, `seasons`, `achievements` |
| LMS connections | `lmsConnections` |

Attachments belong under `sabri-data/attachments/<assignmentId>/` for copied files. Records store attachment metadata. The main process caps general attachments at 30 MB and pasted images at 5 MB. A backup retains metadata. Copy the attachments directory alongside the backup if you move Sabri to a new computer.

## Planning and assignments

- **Today Plan** uses deterministic, offline scheduling. Classes, prayer windows, meals, sleep, and locked blocks are fixed. Time caps and slack apply before work is placed. Explain each placement and show items that did not fit. Include an evening shutdown review, carryover, and tomorrow’s Big 3.
- **Exam Prep** works backward from exam dates and balances the daily cap across exams. Rank by difficulty and confidence, schedule learn and review time, and report when the available days cannot accommodate the requested plan. Reschedule missed sessions and show catch-up options, readiness, and weak topics.
- **Assignments** tracks work from not started through graded, with submission templates, attachments, deadline countdowns, and grade links. Moodle calendar assignments deduplicate by UID, retain local overrides, flag deadline changes, and mark upstream removal without deleting local work.
- **Parking lot** adds global `Ctrl+Alt+P` capture while the timer continues. The break review can convert an item into a task, note, or plan item, or mark it done or dismissed.

## Math, LMS connections, and progress

- **Math and formulas** use bundled KaTeX for left-to-right equations inside English and Arabic notes, a formula picker and printable A4 sheets, and a Leitner review queue. Validate and sanitize the rendered math and attachments.
- **LMS sync** begins with Moodle ICS and adds explicitly connected, read-only Moodle Web Services and Google Classroom. Use the system browser with a loopback redirect and PKCE for Classroom. Record confirmed course mappings. Moodle behavior depends on institution-enabled services and permissions.
- **Rewards** use a shared, idempotent event log with daily caps and no point loss. Make progress hideable. Light and Midnight use Minimal, F1 uses Championship, Stadium uses League, Manga uses XP, Forest uses Forest, Cyberpunk uses Credits, and Calligraphy uses Mosaic. Fictional competitors and original art are required. Theme unlocks are optional. Worship is excluded unless the user explicitly opts in.
- **Later extras** include focus scoring, course resource links, a weak-topic heatmap, weekly planning, reading backlog, and lab kit lists.

## Integration contracts

IPC channels are `planner:generate`, `lms:connect`, `lms:sync`, `lms:disconnect`, `lms:status`, `attachments:add`, `attachments:open`, and main-to-renderer `parking:capture`. Every payload must be validated and filesystem operations must remain in the main process.

Keep revocable, read-only tokens and private calendar URLs in Electron `safeStorage`. Exclude secrets from JSON, exports, backups, and logs. On Disconnect, delete the encrypted credential. Snapshots retain connection labels, safe public site addresses, course mappings, timestamps, and status codes. Never collect campus credentials or session cookies. No integration writes to, submits to, or modifies Moodle or Classroom.

## Dashboard and reminders

The dashboard offers Today Plan, Assignments due, Exam readiness, Parking lot, Progress, and Formula of the day. Assignment reminders default to 7 days, 3 days, 1 day, and 3 hours before the deadline. Other reminders cover LMS changes, exam prep and next-morning catch-up, daily formula reviews, and the evening shutdown ritual at 21:30. Parking review uses the in-app break screen.


## Connect a university LMS

1. Add or import your local Sabri courses.
2. Open **Study tools → Assignments → LMS connections**.
3. Choose Moodle ICS, Moodle Web Services, or Google Classroom. Verify the preview, map the source courses to your local ones, and confirm the import.

For Moodle ICS, paste an HTTPS or webcal export URL from Moodle’s calendar or open an exported ICS file. A calendar file can be imported again with the same connection name to update existing assignments. Calendar feeds usually cover a date window. Sabri flags disappeared assignments only inside the visible date range or when cancellation is explicit.

For Moodle Web Services, ask your university whether it offers a revocable read-only service token. The service must expose site information and assignment listing. Submission state also needs access to your own submission status. Use the ICS route when the institution does not expose these services.

For Classroom, enable the Google Classroom API in your Google Cloud project and create an OAuth client of type **Desktop app**. Configure the consent screen and add your account as a test user when appropriate. Enter the desktop client ID and client secret in Sabri, then approve access in your browser. A school admin may restrict third-party Classroom access. Google Calendar ICS export or manual entry remains available.

- [Google desktop OAuth setup](https://developers.google.com/identity/protocols/oauth2/native-app)
- [Classroom coursework permissions](https://developers.google.com/workspace/classroom/guides/manage-coursework)
- [Moodle calendar export](https://docs.moodle.org/29/en/Calendar_export)

## Verification

Run `npm run typecheck`, `npm run lint`, and `npm test -- --maxWorkers=1`. After `npm run build`, run `node tests/electron-addon.mjs` for the offline desktop workflows. Live Moodle Web Services and Google Classroom require an institution-provided account, service token, or OAuth client and access approval.
