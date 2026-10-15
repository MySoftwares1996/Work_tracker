#!/usr/bin/env node
/**
 * Puts the web version (dist/, from `npm run build:web`) on Firebase Hosting. Used by
 * .github/workflows/web-deploy.yml and by `npm run deploy:web` on a computer.
 *
 * It deploys only to the site named in FIREBASE_HOSTING_SITE, never the project's default site: the Banking
 * Work Tracker web app may live there, and a deploy without a site would replace it. So there is no
 * firebase.json in the repo; this writes one naming the site and deploys with it.
 *
 *   FIREBASE_HOSTING_SITE=my-site npm run deploy:web
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const PROJECT = process.env.FIREBASE_PROJECT || 'work-tracker-3b728';
const SITE = String(process.env.FIREBASE_HOSTING_SITE || '').trim();
const FIREBASE_TOOLS = 'firebase-tools@15';
// The folder to put on Hosting: dist/ (the Expo website), or another, e.g. WEB_DIST_DIR=newweb/dist for the new web app.
const DIST = String(process.env.WEB_DIST_DIR || 'dist').trim();

if (!/^[a-z0-9-]{3,63}$/.test(SITE)) {
  console.error('Set FIREBASE_HOSTING_SITE to the Hosting site to deploy to (Firebase console -> Hosting -> the site\'s name),');
  console.error('for example:  FIREBASE_HOSTING_SITE=my-working-dashboard npm run deploy:web');
  process.exit(2);
}
if (SITE === PROJECT) {
  console.error(`"${SITE}" is the project's default site, where the Banking Work Tracker web app may live. Use a separate site.`);
  process.exit(2);
}
if (!fs.existsSync(path.join(ROOT, DIST, 'index.html'))) {
  console.error(`${DIST}/ has no website in it yet. Build it first (npm run build:web, or npm run build in newweb/).`);
  process.exit(2);
}

const config = {
  hosting: {
    site: SITE,
    public: DIST,
    ignore: ['**/.*'],
    // Every address opens the app (it has a single page).
    rewrites: [{ source: '**', destination: '/index.html' }],
    headers: [
      // The bundle and assets have a content hash in their name: they never change, so browsers keep them.
      { source: '/_expo/**', headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }] },
      { source: '/assets/**', headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }] },
      // The page itself is always fetched fresh, so a new deploy is seen at once.
      // '/' and every other page address (no dot in the name) are served index.html by the rewrite above, and
      // the header rule goes by the address asked for, not the file served: without these, a browser could keep
      // showing the previous deploy until it was refreshed.
      { source: '/index.html', headers: [{ key: 'Cache-Control', value: 'no-cache' }] },
      { source: '/', headers: [{ key: 'Cache-Control', value: 'no-cache' }] },
      { source: '**/!(*.*)', headers: [{ key: 'Cache-Control', value: 'no-cache' }] },
    ],
  },
};
// The Firestore security rules (firestore.rules: each account reads and writes only its own data) go out with the
// site when DEPLOY_FIRESTORE_RULES=true. The key then also needs the "Firebase Rules Admin" role.
const withRules = String(process.env.DEPLOY_FIRESTORE_RULES || '').trim() === 'true';
if (withRules) config.firestore = { rules: 'firestore.rules' };
const configPath = path.join(ROOT, 'firebase.web-deploy.json');
fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');

console.log(`Deploying ${DIST}/ to https://${SITE}.web.app (project ${PROJECT})${withRules ? ' and the Firestore security rules' : ''}`);
let status = 0;
try {
  execFileSync('npx', ['--yes', FIREBASE_TOOLS, 'deploy', '--only', withRules ? `hosting:${SITE},firestore:rules` : `hosting:${SITE}`, '--project', PROJECT, '--config', configPath, '--non-interactive'], { cwd: ROOT, stdio: 'inherit' });
} catch (e) {
  status = e.status || 1;
}
// Removed before exiting: process.exit() inside the catch would skip a finally block.
fs.rmSync(configPath, { force: true });
process.exit(status);
