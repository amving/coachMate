Current policy — 23 October 2026
===============================

Update AvailabilityMail.gs and Distribution.gs together in the existing separate
Apps Script project. Retain installed triggers; an existing minute worker does
not need a duplicate installation. Its heartbeat now identifies
worker-invitations-v3. Older workers cannot send the new invitation format.

Confirmations acknowledge receipt without automatically including either link.
The Google-generated editUrl is still saved in the matched FormInvites row.
Only the coach's explicit Wijzigingslink nasturen action prepares that link.
The invitation uses parentName (first name; fallback parent), shortName and round.
New invitations include only the personal start URL. Submitted, pending,
uncertain and already invited players must not receive another start invitation.

FormDeliveries appends optional renderedMessage after message, preserving old
columns and rows. The worker sends this frozen personal text, with escaped HTML
and one labeled personal link. WhatsApp confirmations are channel=whatsapp and
are never sent by the mail worker. Preparing/opening a WhatsApp draft is local;
only explicit coach confirmation adds a shared sent record. No test messages
were sent as part of this change. The historical notes below describe earlier
behavior and are superseded where they mention automatically mailed edit links.

CoachMate availability confirmation
=================================

Google project (prepared, authorization still required):
https://script.google.com/home/projects/1hjLFLC5BzBjrEkeef9I2wMZgQrr8kSvU8NArXKjn6mv25tJWP4l_fKIh/edit

Run coachMateInstallAvailabilityMail once and approve Forms, Sheets, outgoing
mail and trigger permissions in Google. This uses MailApp, not Gmail read access.
No deployment as a public web app is needed. Do not change the existing bound
CoachMate.gs ID/validation script.

The installer registers form-submit triggers for active seasons and a 15-minute
registration check for new round Forms. Newly registered forms catch up on
submissions made since activation. Pre-activation submissions are not mailed.
Google's trigger and daily mail quotas still apply; execution failures are visible
in the Apps Script execution history. A new Form may take up to 15 minutes to
receive its trigger. Availability itself remains an explicit CoachMate import.

FormInvites columns:
A formId, B playerId, C code, D personalUrl (start link), E editUrl,
F responseId, G submittedAt, H mailSentAt.

Opening personalUrl starts with all games present. Opening editUrl restores that
submitted response. Both require explicit submission to affect availability.
The script writes only the matched invite row and never availability/statistics.
Its recipient comes exclusively from Players.parentEmail for the exact form's
teamSeasonId/playerId. Shared parent addresses never merge siblings.

A successful first submission is emailed once per response. Editing that same
response keeps the same link and does not repeatedly email. A separate new
submission stores and mails its own edit link. Missing/invalid email or quota
failures retain the saved edit link; the coach can resend it manually. Do not
publish these links: they grant editing access to a player's submitted answers.

Acceptance test after Google authorization: the user submits their own truthful
test answer for the player whose parentEmail is their own address; verify receipt,
editUrl in the Sheet, and explicit import. Change via the mailed edit link,
resubmit and import again. Do not invent availability for another player.


## Round invitations and fixed template (2026-10-17)

Save AvailabilityMail.gs and Distribution.gs in the same existing Apps Script project. Run coachMateInstallDistribution once and authorize Drive copy access. This adds a one-minute worker and optional FormJobs/FormDeliveries tabs. Installation sends no invitation. Existing submission and registration triggers remain.

The app offers Beschikbaarheid uitvragen for the selected round, Selecteer alle spelers, E-mail and WhatsApp. Email queues one separate message per selected reachable player. Missing parentEmail values are shown and skipped. Players.parentPhone is optional; use international format such as +31612345678. Without it the coach chooses the recipient in WhatsApp. WhatsApp messages are opened manually and are never marked sent merely because they were opened.

The worker copies the configured team template, retains its theme/header, prepares all match questions and personal links, and publishes the parent form. The backend checks the real REST question IDs before finalizing the mapping. New rounds never reset existing answers.

Batch IDs persist locally before submission; retrying an unconfirmed action uses the same selection and batch ID. Sent, queued, failed and uncertain statuses are distinct. An interrupted send remains uncertain and is never automatically retried. No production test invitation is sent without an explicit recipient selection and send action.

## First production invitation test — 2026-10-17

One personal invitation for Tijn, round 2, was queued from production v23 and subsequently displayed as sent (1 of 1). No other players were selected. The parent will fill and submit the Form themselves; no attendance values were submitted by the agent. Receipt, response import, confirmation/edit link and edited-response import remain to be verified.

Observed issue: the first queue attempt returned a source revision conflict before any delivery row was created. Reloading current team data and retrying the same persisted batch ID succeeded. Investigate whether the minute worker heartbeat in FormJobs invalidates the full source fingerprint; do not weaken conflicts on actual team data or blindly retry uncertain deliveries.
