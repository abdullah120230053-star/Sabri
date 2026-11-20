# Design decisions

- The app starts with empty personal data. An example timetable and sample tasks can be added from Settings.
- The desktop stores a versioned JSON snapshot with separate domain collections in a single atomic transaction. Importing many rows and completing a linked focus session are each committed as one write.
- Calendar exports are the supported integration boundary for Classroom and Moodle. Files and copied timetable tables cover university SIS installations with different export formats.
- The default academic week begins on Saturday and the default location is Cairo. The dashboard groups the student's schedule, daily focus, prayer and next actions into a compact overview.
