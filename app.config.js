/**
 * app.json plus the phone-update settings. Set the repository variable EAS_PROJECT_ID (the project's id on expo.dev) and the next APK
 * build can receive JavaScript-only updates ("Publish phone update" workflow, docs/PHONE_UPDATES.md). Without it nothing changes: the
 * app is built as before and does not look for updates.
 */
module.exports = ({ config }) => {
  const id = String(process.env.EAS_PROJECT_ID || '').trim();
  if (!/^[0-9a-f-]{36}$/i.test(id)) return config;
  return {
    ...config,
    updates: {
      url: `https://u.expo.dev/${id}`,
      enabled: true,
      checkAutomatically: 'ON_LOAD',
      fallbackToCacheTimeout: 0,
      requestHeaders: { 'expo-channel-name': 'production' },
    },
    extra: { ...(config.extra || {}), eas: { ...((config.extra || {}).eas || {}), projectId: id } },
  };
};
