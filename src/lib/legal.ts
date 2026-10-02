// Legal copy shown in-app (Settings → Terms / Privacy) and linked at sign-up.
//
// IMPORTANT: This is a plain-language TEMPLATE to satisfy the store requirement
// that Terms/EULA and a Privacy Policy exist, are linked at sign-up, and are
// reachable in the app. It is NOT legal advice. Before a real public launch,
// have these reviewed and also host them at a public URL (see PRIVACY_URL /
// TERMS_URL below) — both App Store Connect and Google Play require a publicly
// reachable Privacy Policy link in the console listing.

export const APP_NAME = 'LetsLiinger';
export const SUPPORT_EMAIL = 'letsliinger@gmail.com';
export const EFFECTIVE_DATE = 'August 12, 2026';

// Hosted pages live in /docs (served by GitHub Pages). Enable Pages on the
// repo (Settings → Pages → deploy from `main` /docs) to make these live.
export const TERMS_URL = 'https://angelicariveraaguasvivas.github.io/lets-liinger/terms.html';
export const PRIVACY_URL = 'https://angelicariveraaguasvivas.github.io/lets-liinger/privacy.html';

export const TERMS_TEXT = `${APP_NAME} — Terms of Service & End User License Agreement

Effective ${EFFECTIVE_DATE}

Welcome to ${APP_NAME}. By creating an account or using the app, you agree to these Terms. Please read them.

1. Who can use ${APP_NAME}
You must be at least 13 years old to use ${APP_NAME}. If you are under the age of majority where you live, you may only use the app with the involvement of a parent or guardian. You are responsible for keeping your login secure and for everything that happens under your account.

2. Your content
${APP_NAME} lets you create profiles, events, comments, and direct messages ("your content"). You keep ownership of your content, but you grant ${APP_NAME} a license to store and display it so the app can work. You are responsible for your content and confirm you have the right to share it.

3. Acceptable use and zero tolerance for objectionable content
There is no tolerance for objectionable content or abusive behavior. You agree NOT to post, send, or share content that is:
  • hateful, harassing, threatening, or bullying;
  • sexually explicit, or that sexualizes minors in any way;
  • violent, or that promotes self-harm or illegal activity;
  • spam, scams, or someone else's private information.
You also agree not to impersonate others, or to use the app to break the law.

4. Moderation, reporting, and enforcement
You can report content or users, and you can block users. We review reports and act on them — including removing content and suspending or terminating accounts — typically within 24 hours of a report. We may remove content or end accounts that violate these Terms, at our discretion.

5. Ending your account
You can delete your account at any time from Settings → Delete Account. Deleting your account permanently removes your profile and associated data. We may suspend or terminate accounts that violate these Terms.

6. Disclaimers and liability
${APP_NAME} is provided "as is," without warranties. To the extent allowed by law, ${APP_NAME} is not liable for indirect or incidental damages arising from your use of the app. Events and users are not verified unless explicitly marked; use good judgment when meeting people or attending events.

7. Changes
We may update these Terms. If we make material changes, we'll notify you in the app. Continued use after changes means you accept the updated Terms.

8. Contact
Questions? Email ${SUPPORT_EMAIL}.
`;

export const PRIVACY_TEXT = `${APP_NAME} — Privacy Policy

Effective ${EFFECTIVE_DATE}

This Privacy Policy explains what ${APP_NAME} collects, why, and your choices.

1. Information we collect
  • Account info: your email address (used to sign in and secure your account).
  • Profile info: display name, username, bio, interests, clubs, and a profile photo you choose to upload.
  • Content you create: events, RSVPs, likes, comments, and direct messages.
  • Location: if you allow it, approximate location is used to show events near you and to place event pins on the map. You can decline; the app still works.
  • Photos: if you choose to set a profile picture or event image, we access the photo you select.
  • Basic technical data: information needed to operate the app (e.g. sign-in sessions).

2. How we use your information
We use your information to run the app: to sign you in, show your profile to other students, display events and the map, deliver messages, and keep the community safe (moderation, blocking, and reviewing reports).

3. What we share
Your profile, events, comments, and public activity are visible to other users of ${APP_NAME}. Direct messages are visible to the people in the conversation. We use Supabase to host our database, authentication, and file storage on our behalf. We do not sell your personal information.

4. Data linked to you
The data above (email, profile, location, photos, and content) is linked to your account identity.

5. Your choices and rights
  • You can edit your profile at any time.
  • You can turn off location permission in your device settings.
  • You can block and report other users.
  • You can permanently delete your account and data from Settings → Delete Account.
Depending on where you live (e.g. GDPR / CCPA), you may have rights to access or delete your data. Email ${SUPPORT_EMAIL} to make a request.

6. Children
${APP_NAME} is not directed to children under 13, and you must be 13 or older to use it.

7. Changes
We may update this Policy and will notify you in the app of material changes.

8. Contact
Questions about your privacy? Email ${SUPPORT_EMAIL}.
`;
