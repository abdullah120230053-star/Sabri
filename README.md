# Sabri · صبري

Sabri is an offline-first desktop study planner for university students. It brings class schedules, coursework, focus sessions, habits, notes, calendar events, and daily prayers together in one workspace. It supports English and Arabic with a mirrored RTL layout.

## Run and build

```powershell
npm ci
npm run dev
npm run typecheck
npm run lint
npm test
npm run build
npm run dist
```

Windows packages are written to `release/`. The setup package installs Sabri and registers the `sabri://focus` link. The portable build can run from the release folder. Electron Builder targets for macOS and Linux are defined in `electron-builder.yml` and are intended to be built on the corresponding platforms.

In **Settings → About Sabri**, select **Use sample data** to populate a sandbox or fresh planner with example courses, classes, tasks, and an exam.

## Bring in university data

Open **University data**, choose a source and input method, and review the rows before saving to **Schedule** or **Calendar**.

| Source | How to connect |
| --- | --- |
| Moodle | Export an ICS file or copy the HTTPS calendar export link from Moodle Calendar. Saved links can be refreshed and reviewed without duplicating event UIDs. [Moodle calendar export](https://docs.moodle.org/en/Calendar_export) |
| Google Classroom | In a class, open **Classwork → Google Calendar**. Import the class calendar’s ICS file or private iCal address where school policy permits export. [Classroom calendars](https://support.google.com/edu/classroom/answer/6272985) · [Google Calendar exports](https://support.google.com/calendar/answer/37111) |
| E-JUST | Open SIS or Moodle via the Student Service Hub. Export the timetable as a text-based PDF, CSV, or ICS file, or copy the visible timetable and paste it. [E-JUST Student Service Hub](https://ejust.edu.eg/students) |
| Zewail City or another SIS | Use any file or table export your portal makes available. The importer supports English/Arabic day labels, Arabic-Indic digits, timetable grids, list layouts, and manual column mapping. |

PDF import uses embedded text and table coordinates. For scans and image-only timetables, use a text/CSV export or paste the visible table. Export availability varies by university and account.

A saved calendar link can grant calendar access. Sabri encrypts it using the operating system credential store and lists only its hostname in the planner. Backup exports leave out calendar-link secrets. Reconnect these links after moving to a new PC.

## Pair a phone

1. Open **Phone sync** and start it on a trusted Wi-Fi network. Enter an optional 4–8 digit pairing PIN before starting.
2. Generate and scan the QR code. Name the device and enter the PIN if prompted.
3. Use **Today** for classes, prayers, and tasks due today. **Tasks** contains the full list and an upcoming filter. **Notifications** shows prayer, class, task, exam, habit, and focus reminders. The phone receives new reminders while the page is open.
4. Rename devices, change permissions, revoke access, or send a test alert from the desktop. The paired phone also has the focus timer, quick notes, and calendar agenda.
5. Keep the phone page open during a temporary outage. It queues edits in IndexedDB and applies them when the desktop reconnects.

The server binds only while enabled and stops when Sabri quits. Standard Wi-Fi mode works in the phone browser and shows reminders inside Sabri. An already-open tab keeps working during a temporary connection loss. [Set up lock-screen and background notifications](docs/PHONE_NOTIFICATIONS.md) using optional Secure Wi-Fi.

## Connect HM-Bar

Enable **Settings → About Sabri → Show timer and next prayer in HM-Bar**. Open **Sabri** from the HM-Bar launcher. The panel displays Sabri’s timer and next prayer as long as Sabri is running. **Open Sabri focus** opens the focus screen of the installed application.

The bridge shares a small read-only status file under the current Windows user profile. The file contains timer state and the next prayer time. Turning off sharing removes it.

## Data and privacy

Sabri stores data under `%APPDATA%\Sabri\sabri-data` on Windows. It has no analytics or account requirement. Apart from local phone sync, opt-in browser push for background phone alerts, and manual update checks on configured releases, the only runtime network features are user-provided calendar feeds, the optional AlAdhan comparison, and optional IP-based location. Automatic feed checks can be disabled per source.

Use **Settings → Data and backups** to export, import, or restore a snapshot. Sabri rotates daily backups and retains a pre-restore copy. Transfer custom audio separately from the `sounds` folder when moving to another computer. See [data formats](docs/DATA_SCHEMA.md), [quality checks](docs/QA.md), and [asset sources](resources/LICENSES.md).

The local installer has no publisher signature. A release build can use a Windows signing certificate and a publisher-hosted HTTPS update feed as described in [building releases](docs/RELEASING.md).
