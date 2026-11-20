# Sabri · صبري

Sabri is an offline-first desktop study planner for university students. It brings class schedules, coursework, focus sessions, habits, notes, calendar events, and daily prayers together in one workspace. It supports English and Arabic with a mirrored RTL layout.

## Install and get started

1. Download `Sabri Setup 1.0.0.exe` from [GitHub Releases](https://github.com/abdullah120230053-star/Sabri/releases/latest), run it on Windows, and open **Sabri** from the Start menu. If you have the portable build, open its executable directly.
2. In **Settings**, choose your language, confirm your city and timezone, and enable desktop notifications for the reminders you want.
3. Add your subjects in **Courses**, your classes in **Schedule**, and your exams in **Calendar**. To bring in a timetable you already have, start in **University data**.
4. Open **Today Plan**, choose your priorities, and select **Generate**. Review the draft and anything that did not fit, then select **Accept all**. Drag or resize blocks, lock commitments, or use **Start** on a block to launch a linked focus timer.

To try the app with examples, open **Settings → About Sabri → Use sample data** in a fresh planner.

## Study with Sabri

| To do this | Open this screen |
| --- | --- |
| Plan the day or week | **Today Plan**. Adjust your energy and workload, switch to the week view, or select **Replan from now** if the day changes. The shutdown review helps you carry work forward and pick tomorrow's priorities. |
| Prepare for an exam | **Exam Prep → New exam plan**. Select a calendar exam, enter topics or paste a syllabus one topic per line, and set your study availability. Generate and accept the sessions, then rate your confidence after each review. |
| Track coursework | **Assignments → New assignment**. Set a course and deadline, apply a checklist, attach files, and track your work through submission and grading. |
| Write and review equations | **Notes** supports inline `$…$` and block `$$…$$` math. In **Formula sheets**, save formulas, quiz yourself, or export an A4 PDF from **Sheet preview**. |
| Clear a distraction | Press **Ctrl+Alt+P** while Sabri is running. Type and press **Enter** to save or **Esc** to close. The timer continues. Review captures during a break or in **Parking lot**. |
| Change the look and rewards | Choose a theme in **Settings**. Open **Progress** for themed stats, achievements, and cosmetic rewards. Worship is excluded from scoring by default. |

## Read the Quran and set a daily Mushaf Werd

1. Open **Quran Mushaf** and navigate the offline Madinah Mushaf by surah, juz, or page. Select **Bookmark page** to save your place.
2. Select **New Mushaf Werd** and choose a starting page, pages per day, and reminder time. Leave **Daily reminder** checked and enable notifications in **Settings**.
3. Select **Open today’s reading** and then **Mark today complete** when you finish. Sabri advances to the next pages automatically. Keep Sabri running to receive desktop reminders.

## Build from source

```powershell
npm ci
npm run dev
npm run typecheck
npm run lint
npm test -- --maxWorkers=1
npm run build
node tests/electron-addon.mjs
npm run dist
```

Windows packages are written to `release/`. The setup package installs Sabri and registers the `sabri://focus` link. The portable build can run from the release folder. Electron Builder targets for macOS and Linux are defined in `electron-builder.yml` and are intended to be built on the corresponding platforms.

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

To sync assignment deadlines, open **Assignments → LMS connections**. Choose Moodle ICS, Moodle Web Services, or Google Classroom, then confirm the course mapping before importing. Moodle Web Services requires a revocable read-only token from a supported school setup. Classroom uses a Google Cloud desktop OAuth client. See the [LMS connection guide](docs/ADDON_V2.md#connect-a-university-lms) for setup and export options.

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

Sabri stores data under `%APPDATA%\Sabri\sabri-data` on Windows. It has no analytics or account requirement. Network features are optional and include phone sync, user-supplied calendar feeds, read-only LMS sync, prayer time comparison, location lookup, and manual update checks on configured releases. Disconnecting an LMS removes its local credentials.

Use **Settings → Data and backups** to export, import, or restore a snapshot. Sabri rotates daily backups and retains a pre-restore copy. When moving to another computer, copy custom audio and copied attachments separately, reconnect private feeds and LMS accounts, and relink files whose paths changed. See [data formats](docs/DATA_SCHEMA.md), [quality checks](docs/QA.md), and [asset sources](resources/LICENSES.md).

The local installer has no publisher signature. A release build can use a Windows signing certificate and a publisher-hosted HTTPS update feed as described in [building releases](docs/RELEASING.md).
