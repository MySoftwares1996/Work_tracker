import { dismissEntryNotifications } from '../../src/notify.js';
import { __present, __shown } from 'expo-notifications';

export async function run({ ck, section }) {
  section('Notification buttons: a tapped ✓ / 💤 / 🔔 clears the notification');
  __present('n-due15', { kind: 'wd-entry', entryId: 'e7', key: 'due-15' });
  __present('n-due60', { kind: 'wd-entry', entryId: 'e7', key: 'due-60' });
  __present('n-other', { kind: 'wd-entry', entryId: 'e8', key: 'due' });
  __present('n-walk', { kind: 'walk' });
  await dismissEntryNotifications('e7', 'n-due15');
  ck('the tapped notification leaves the shade', !__shown().includes('n-due15'));
  ck('...and the same task\'s earlier warning too', !__shown().includes('n-due60'));
  ck('another task\'s notification and other reminders stay', __shown().includes('n-other') && __shown().includes('n-walk'));
}
