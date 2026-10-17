/**
 * Instant sync to the phone. When a task changes in a person's space (the website, the phone, the sheet), this sends the
 * phone a silent "tasks changed" message; the app wakes, reads the changes and re-books its alarms - seconds later,
 * instead of at the next 15-minute background refresh. See docs/INSTANT_SYNC.md for deploying it.
 *
 * Needs: the Firebase Blaze plan (Cloud Functions), and the phone registered its token in users/<uid>/meta/devices
 * (the app does that by itself once signed in).
 */
const { onDocumentWritten } = require('firebase-functions/v2/firestore');
const admin = require('firebase-admin');

admin.initializeApp();

const QUIET_MS = 1000;       // a burst of edits (a sync of many tasks) sends one message, 1 s after the first - not one each (kept short: sync must stay under 10 s)

exports.tasksChanged = onDocumentWritten('users/{uid}/tasks/{taskId}', async (event) => {
  const uid = event.params.uid;
  const ref = admin.firestore().doc(`users/${uid}/meta/devices`);
  // Read and claim in one transaction: two edits at the same instant send one message, not two.
  const claim = await admin.firestore().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.exists ? snap.data() : {};
    const tokens = Array.isArray(data.tokens) ? data.tokens.filter(Boolean) : [];
    if (!tokens.length || Date.now() - Number(data.lastPushAt || 0) < QUIET_MS) return null;
    tx.set(ref, { lastPushAt: Date.now() }, { merge: true });
    return tokens;
  });
  if (!claim) return;
  const tokens = claim;
  // Wait out the quiet time before sending: the edits that followed (and were skipped above) are then read too.
  await new Promise((resolve) => setTimeout(resolve, QUIET_MS));

  const res = await admin.messaging().sendEachForMulticast({
    tokens,
    data: { kind: 'wd-tasks-changed' },
    android: { priority: 'high' },
  });
  // Tokens the phone no longer uses (app removed, token renewed) are dropped.
  const dead = [];
  res.responses.forEach((r, i) => {
    const code = r.error && r.error.code;
    if (code === 'messaging/registration-token-not-registered' || code === 'messaging/invalid-registration-token') dead.push(tokens[i]);
  });
  // Removed on the server side (arrayRemove), not by writing back the list read above: a phone that registered its token
  // since then would have been dropped by that stale copy.
  if (dead.length) await ref.set({ tokens: admin.firestore.FieldValue.arrayRemove(...dead) }, { merge: true });
});
