# Data schema

The main process owns persistent writes. `sabri-data/state.json` is a versioned snapshot. Each commit increments an integer `revision`. Zod validates the complete snapshot on load and before committing.

| Domain | Fields |
| --- | --- |
| Settings | Language, theme, region, schedule, focus, prayer, notification, sound, GPA, dashboard, and HM-Bar preferences |
| Schedule and courses | Recurring or dated blocks with civil times, course links, grade components, and attendance |
| Tasks and notes | Task status, tags, due date, linked course, recurrence, and subtasks. Notes hold sanitized rich HTML. |
| Prayers | Civil-date records with per-prayer status, congregation and optional observance fields |
| Calendar and feeds | Event times, reminders and source UIDs. Feed records keep host and refresh metadata. |
| Focus, habits, and statistics | Timestamp-driven timer, finished sessions, habit definitions and daily values |
| Custom themes and layouts | Theme overrides, widget layouts and named presets |
| Phone receipts | A bounded list of acknowledged operation IDs to deduplicate reconnect retries |

Records use UUIDs with `createdAt`, `updatedAt` and optional `deletedAt`. Audit timestamps are ISO 8601 UTC. Civil dates and times use ISO dates and 24-hour wall time in the configured IANA timezone. The main-process writer serializes updates. It flushes a temporary file before replacing the snapshot, so readers observe an entire previous or new revision.

Daily snapshots are held in `backups/YYYY-MM-DD/`. The loader quarantines a corrupt active file and restores the newest valid daily snapshot. A pre-migration or pre-restore snapshot is retained separately. A newer incompatible schema is rejected before writing.

`calendar-secrets/` holds OS-encrypted HTTPS export links. `devices.json` holds paired-device metadata, SHA-256 token digests, and push subscriptions for devices that opt in. `phone-tls.json` and `phone-push.json` store the local HTTPS and Web Push identity keys. `sounds/` holds user-selected audio. These items are local and are excluded from JSON backup exports to keep feed secrets and device access tied to the current computer.

The phone companion sends small validated operations. The desktop assigns timestamps on receipt, updates only the requested field where possible, and commits the operations and retry receipts together. Devices are never sent university feed URLs, the backup file, or the full desktop data store.
