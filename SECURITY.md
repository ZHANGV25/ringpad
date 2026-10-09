# Security

Ringpad records audio and reads key presses system-wide, so security problems matter even though
it never goes online.

## Reporting a problem

Report security problems privately through GitHub:
**Security > Report a vulnerability** on this repository. Please don't open a public issue.

Include what you found, how to reproduce it, and which version you use. Expect a first reply
within a week.

## What Ringpad does and doesn't do

- It reads key presses through Raw Input only to match your hotkeys. It never stores or sends
  them.
- It records audio your PC already plays, holds the last 10 to 120 seconds in memory, and writes a
  file only when you clip or save.
- It makes no network connections. Links open only when you click them.

## Supported versions

Only the latest release gets fixes.
