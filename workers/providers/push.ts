// workers/providers/push.ts
// Web Push / FCM notification provider.
//
// ── Setup ────────────────────────────────────────────────────────────────────
// Option A — Firebase Cloud Messaging (recommended for mobile + web):
// 1. Create a Firebase project at https://console.firebase.google.com
// 2. Generate a service account key (Project Settings → Service Accounts)
// 3. Add env vars in Vercel:
//
//      FCM_PROJECT_ID       = your-firebase-project-id
//      FCM_CLIENT_EMAIL     = firebase-adminsdk-xxx@your-project.iam.gserviceaccount.com
//      FCM_PRIVATE_KEY      = "-----BEGIN PRIVATE KEY-----\n..."
//
// 4. Install SDK:  npm install firebase-admin
//
// Option B — VAPID Web Push (browser-only, no Firebase):
// 1. Generate VAPID keys: npx web-push generate-vapid-keys
// 2. Add env vars:
//
//      VAPID_PUBLIC_KEY   = <base64url public key>
//      VAPID_PRIVATE_KEY  = <base64url private key>
//      VAPID_SUBJECT      = mailto:admin@gcm.example.com
//
// 3. Install SDK:  npm install web-push
// 4. Expose NEXT_PUBLIC_VAPID_PUBLIC_KEY in next.config.ts so the service
//    worker can subscribe users.
//
// ── Status ───────────────────────────────────────────────────────────────────
// The subscribe UI hides the push channel until this provider is wired up.
// Once configured, re-enable 'push' in ALLOWED_CHANNELS in
// app/api/subscribe/route.ts and add a service worker registration to
// app/layout.tsx.

import type { AlertFrequency } from '../alerts';

interface PushEvent {
  headline:        string;
  summary_20w:     string;
  severity:        string;
  country_primary: string;
  confidence:      string;
}

/**
 * Send a push notification via FCM.
 *
 * @param fcmToken  FCM registration token stored in subscribers.address
 * @param events    List of conflict events to include
 * @param frequency Alert frequency label
 */
export async function sendPushAlert(
  fcmToken:  string,
  events:    PushEvent[],
  frequency: AlertFrequency,
): Promise<void> {
  const projectId   = process.env.FCM_PROJECT_ID;
  const clientEmail = process.env.FCM_CLIENT_EMAIL;
  const privateKey  = process.env.FCM_PRIVATE_KEY?.replace(/\\n/g, '\n');

  if (!projectId || !clientEmail || !privateKey) {
    console.warn('[push] FCM env vars not set — skipping push dispatch');
    return;
  }

  const admin = await import('firebase-admin').then(m => m.default ?? m);

  // Initialise only once (firebase-admin is a singleton)
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
    });
  }

  const ev      = events[0];
  const title   = frequency === 'instant' ? '🚨 GCM Breaking Alert' : `GCM ${frequency} Digest`;
  const body    = ev ? `${ev.severity.toUpperCase()} — ${ev.country_primary}: ${ev.headline ?? ev.summary_20w}` : 'New conflict updates';

  await admin.messaging().send({
    token:        fcmToken,
    notification: { title, body },
    data: {
      frequency,
      event_count: String(events.length),
      severity:    ev?.severity ?? 'low',
    },
    android: { priority: frequency === 'instant' ? 'high' : 'normal' },
    apns:    { headers: { 'apns-priority': frequency === 'instant' ? '10' : '5' } },
  });
}
