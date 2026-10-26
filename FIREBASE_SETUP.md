# Cortex — Firebase backend reference

Everything below is implemented in `src/services/*` (Firestore/Storage logic), `firestore.rules`, `storage.rules`
and `firestore.indexes.json`. Screens keep their original layout and call these services.

## 1. Firestore schema

| Path | Purpose / key fields |
|---|---|
| `users/{uid}` | Public profile: `username(+Lower)`, `displayName(+Lower)`, `avatarUrl`, `coverImageUrl`, `role` (student\|tutor), `tutorStatus`, `gradeLevel`, `institution`, `semesterOrYear`, `degreeOrStream`, `about`, `country`, `timezone`, `hoursGoal`, `teach[]`, `learn[]`, `educationHistory[]`, `credits`, `creditsEarned`, `teachingMinutes`, `studyStreak`, `lastStudyDate`, `online`, `lastSeen`, `searchTokens[]`, `teachTokens[]`, `onboarded`, `showLeaderboard`, `sosAvailable`, `emailNotifications`, `darkMode`, `lastCreditKind/Id` (rules markers) |
| `users_private/{uid}` | `email` (owner + admin only) |
| `usernames/{handle}` | `{uid, username}` — uniqueness lock, claimed in a transaction |
| `admins/{uid}` / `admin_emails/{email}` | Admin authority / allow-list (admin-only) |
| `users/{uid}/friends/{friendUid}` | Mutual buddy record (written for both users on accept) |
| `friend_requests/{req_FROM_TO}` | Pending requests only |
| `users/{uid}/notifications/{id}` | `type, title, text, read, actorId, actor, actionUrl, entityType/Id, requestStatus, createdAt` |
| `users/{uid}/creditHistory/{id}` | Credit ledger shown on the profile |
| `users/{uid}/{achievements,bookmarks,sosBookmarks,sosOffers,groups,quizzes,roadmaps,quizProgress,roadmapProgress,studyDays}` | Per-user data (owner only) |
| `users/{uid}/reviews/{reviewerUid}` | Peer review (reviewer must be a buddy) |
| `conversations/{id}` | `type, participants[], participantInfo{}, status, requestedBy, lastMessage, lastMessageAt, unread{uid:n}, lastRead{uid:ts}, typing{uid:ts}, groupId` — direct id = sorted `uidA_uidB`, group id = `group_{groupId}` |
| `conversations/{id}/messages/{id}` | `senderId, text, attachments[], createdAt` (immutable) |
| `posts/{id}` | `authorId, author{}, title, body, subject, tag, imageUrls[], imagePaths[], keywords[], likesCount, commentsCount, reportCount, createdAt` |
| `posts/{id}/likes/{uid}`, `posts/{id}/comments/{id}` | Likes (existence = liked) and comments |
| `reports/{postId_reporterUid}` | Moderation queue (admin-readable) |
| `sos_requests/{id}` | `requesterId, requester{}, title, subject, urgency, duration, credits, status (open→in_progress→resolved\|cancelled), offersCount, helperId, helper{}, escrowed, rewardClaimed, refundClaimed` |
| `sos_requests/{id}/offers/{helperUid}` | Helper offers |
| `tutor_applications/{uid}` | Application + `degreeProof{name,type,size,path}` (file lives in Storage) |
| `tutor_profiles/{uid}` | Public tutor listing: `credentials, bio, subjects[], languages[], timezone, rates{materials,asyncQa,zoomMeeting}, availability[{day,start,end}], acceptingSessions, ratingSum, ratingCount, sessionsCompleted` |
| `tutor_sessions/{id}` | `tutorId, studentId, mode, topic, slotLabel, credits, durationMin, status (pending→accepted→delivered→completed \| declined \| cancelled), payoutClaimed, refundClaimed, rating, review` |
| `groups/{id}` · `groups/{id}/members/{uid}` · `group_invites/{gid_uid}` | Study groups, membership, invitations |
| `quizzes/{id}`, `roadmaps/{id}` | Built-in catalog (public read, admin write; seeded by script) |

## 2. Storage structure

```
avatars/{uid}/{ts}-{file}            images ≤ 5 MB      read: signed-in      write: owner
covers/{uid}/{ts}-{file}             images ≤ 8 MB      read: signed-in      write: owner
posts/{uid}/{postId}/{ts}-{file}     images ≤ 8 MB      read: signed-in      write: owner
chat/{conversationId}/{ts}-{file}    images/PDF ≤ 10 MB read+write: conversation participants
tutor-proofs/{uid}/{ts}-{file}       images/PDF ≤ 10 MB read: owner + admin  write: owner
```

## 3. Indexes
All composite indexes are in `firestore.indexes.json` (conversations inbox, post feed filters, SOS board, tutor
sessions, groups, leaderboards, claim queries). Deploy with `firebase deploy --only firestore:indexes` and wait until
they show **Enabled** in the console before testing.

## 4. Credit-economy integrity (no Cloud Functions needed)
Balances can only change in the same batch as a state change on an escrow document (see `src/services/credits.ts`
and the `creditChangeOk()` rule): SOS escrow/reward/refund and tutor-session escrow/payout/refund. Each reward or refund
is claimable once (`rewardClaimed`/`payoutClaimed`/`refundClaimed` flips false→true). Streaks and achievements are
self-reported/cosmetic and grant no credits.

## 5. Manual steps before deployment
1. **Rotate the admin password** that was committed in the old README (`admin.cortex@gmail.com`) — treat it as compromised.
2. Firebase console → Authentication: enable **Email/Password** and **Google**; add your production domain(s) to *Authorized domains*; customise the *password reset* and *verification* email templates.
3. Create the Storage bucket (Firebase console → Storage) so `VITE_FIREBASE_STORAGE_BUCKET` is valid.
4. Copy `.env.example` → `.env` / Vercel env vars. Set `FIREBASE_API_KEY` (same as `VITE_FIREBASE_API_KEY`) and `GEMINI_API_KEY` on the **server**; leave `VITE_ENABLE_DEMO_LOGIN` unset/false in production.
5. `npm i -g firebase-tools && firebase login && firebase use <project>`, then
   `firebase deploy --only firestore:rules,firestore:indexes,storage`.
6. **Bootstrap the first admin:** sign up normally, copy your UID from Authentication → Users, then run
   `GOOGLE_APPLICATION_CREDENTIALS=./sa.json node scripts/seed-firestore.mjs --admin-uid <UID> --admin you@domain.com`
   (also seeds the quiz/roadmap catalog; needs `npm i -D firebase-admin`). Later admins: add their email to `admin_emails`; they verify their email and sign in at `/admin`.
7. **Run the rules against the emulator** (`firebase emulators:start`) and exercise every flow — buddy accept, message request, like/unlike, SOS create→offer→accept→resolve→claim, tutor request→accept→deliver→rate→payout, group join/leave/delete. The rules could not be executed in the environment this was written in.
8. Existing data: any `users/{uid}` documents written by the previous version may contain `email` (now stored in `users_private`) and base64 avatars; migrate or let users re-save their profile. Old `tutor_applications` with inline base64 proofs still open in the admin viewer.
9. Enable **App Check** (reCAPTCHA v3) for Firestore/Storage/Auth to limit scripted abuse; set billing budget alerts.
10. Delete leftovers when convenient: `src/integrations/supabase/*` (unused), `src/lib/mock-data.ts` (only `aiTools` is still imported, by the AI page).

## 6. Known limitations (be aware before launch)
- **Notifications are client-created.** Any signed-in user can drop a notification in another user's inbox as themselves (rules pin `actorId`). They can be spammed; move fan-out to Cloud Functions + App Check at scale. SOS fan-out is capped at 20 matching helpers.
- **No email/push delivery.** `emailNotifications` is stored but nothing sends email; add FCM / a mail extension via Cloud Functions.
- **Search** is prefix + token matching, not full-text/fuzzy (use Algolia/Typesense if needed).
- **Deleting a user/group/conversation** leaves orphaned message subcollections and Storage files; schedule a Cloud Function cleanup.
- **Post reports** hide a post after 5 reports but there is no admin reports UI yet (reports are in `reports/`).
- **Presence** is heartbeat based (`online` + `lastSeen` < 2.5 min); a Realtime Database `onDisconnect` is more precise.
- **Study time** counts minutes the tab is open and visible (it feeds the dashboard goal), not verified studying.
- Landing-page marketing numbers/testimonials are static copy.
