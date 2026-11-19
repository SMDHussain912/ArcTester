# Student announcements and notifications

This document defines the server-side delivery and acknowledgement contract for student communications.

## Announcements

- Administrators create announcements with an optional `expiresAt`. An expiry must be in the future when the announcement is created.
- An announcement is visible only after `startsAt` and while `expiresAt` is null or later than the server's current time.
- `GET /announcements/active` returns currently active announcements that the authenticated student has not yet acknowledged.
- `POST /announcements/:id/acknowledge` (and the compatibility `/read` route) records acknowledgement in `AnnouncementView`, uniquely keyed by `announcementId + userId`. One student's acknowledgement never hides the announcement for another student.
- Acknowledgement is durable and idempotent: repeat requests must preserve the first `acknowledgedAt` timestamp.
- `GET /announcements` is the authenticated student's active announcement history and includes that student's `seenAt` and `acknowledgedAt` values. Expired and not-yet-started announcements are excluded.

## Student notification inbox

- `StudentNotification` rows belong to exactly one user and have a globally unique `dedupeKey`.
- Exam assignment notifications are created in the same database transaction as their assignment, using `exam-assignment:<assignmentId>`.
- Exam result or review-pending notifications are created in the same transaction as the submission, using `exam-submission:<submissionId>`.
- `GET /notifications` returns only the authenticated student's non-expired notifications, newest first, plus an unread count. Add `?unread=true` to return only unread rows.
- `POST /notifications/:id/read` marks a notification read for its owner. Repeating the request is safe; another student cannot read it. Expired notifications are not listed and cannot be marked read.
- Notification expiry is evaluated by the server on reads; expired rows may remain stored for audit/retention and are not returned to students.

## Verification

The contract is covered by:
- `api/tests/announcementRoutes.test.ts`: future/expired validation, active-feed expiry, per-student acknowledgement isolation, durable acknowledgement timestamps, and history state.
- `api/tests/notificationRoutes.test.ts`: per-student inbox isolation, expiry filtering, unread count/filter, idempotent read, and cross-student access rejection.
- `api/tests/exams.test.ts`: assignment and submission notification creation, stable deduplication across repeated assignment/submission requests.
- `web/app/announcements/page.test.tsx` and `web/app/notifications/page.test.tsx`: authenticated student page flows.
- `web/src/StudentAnnouncementsInbox.test.tsx` and `web/src/StudentNotificationsInbox.test.tsx`: component acknowledgement/read actions.
