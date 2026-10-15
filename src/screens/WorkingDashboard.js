import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, Alert, Pressable, Linking, Platform, Animated, Easing, AppState } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import AnimatedLogo from '../AnimatedLogo';
import * as Clipboard from 'expo-clipboard';
import { BottomTabs, useLayout, useAboveBottomBar, FadeInUp, AnimatedNumber, Screen, Card, H2, P, Small, Btn, Row, Field, Sheet, Segmented, DateTimeField, OptionPicker, PickerButton, Choices, SwipeTabs, RingtonePicker, prefersReducedMotion } from '../ui';
import WdAlertSettings from './WdAlertSettings';
import { SOURCES } from '../optionSources';
import { useTheme, blend, THEMES, FONT_LEVELS } from '../theme';
import AppLockSettings from './AppLockSettings';
import { useStore, uid } from '../store';
import { shareCsv, pickCsv } from '../csv';
import { previewRingtone } from '../ringtones';
import { scheduleEntryAlert, cancelEntryAlert, armTodaysReminders } from '../workingDashboardNotify';
import { isValidScriptUrl, testConnection, pullSheetEntries, mergeSheetPull, pullSheetHolidays, mergeHolidays, seenWebFields } from '../cloudSync';
import { useRealtimeStatus, setRealtimeStatus } from '../realtimeStatus';
import { signInWithGoogle, signOutOfGoogle } from '../firebaseSync';
import { fetchUnreadEmails, markEmailRead, fetchEmailBody, filterEmails, emailToEntryDraft } from '../workingDashboardMail';
import CommandPalette from '../CommandPalette';
import { parseQuickAdd, describeQuickAdd } from '../quickAdd';
import { addAudit, auditDiff, ACTION_AUDIT } from '../audit';
import { WHATS_NEW } from '../whatsNew';
import { checklistText, checklistOpen, checklistOf, addStep, toggleStep, removeStep } from '../checklist';
import { setNarrationSink, addHistory } from '../narrationHistory';
import { recordNarration } from '../narrationHistory';
import { templateFrom, applyTemplate, saveTemplate } from '../templates';
import { trackerAvailable, canDrawOverlays, requestOverlayPermission, isFullScreenIntentAllowed, requestFullScreenIntentPermission } from '../tracker';
import EntryTable from '../EntryTable';
import { stampChanges, toolsValue, normalizeLink, linkFolders, parseBookmarks, bookmarksHtml, addLinks, downloadText, pickTextFile } from '../links';
import { paymentsByVendor, fmtRupees, reportCsvRows, buildReportModel, reportModelToText, verifyAiRewrite, mergeAiReport, DEFAULT_PAYMENT_INTRO, buildPeriodSummary, reportMailUrl } from '../workingDashboardReport';
import { paymentLists, makeNarration, findSubCategory, subCategoryText, validatePaymentDetails, subCategoryComplete, paymentSections, normalizeKeyPoints, noteWork, normStatus, isUnstartedStatus, narrationFor, withWebNarrationTypes } from '../workingDashboardPayments';
import { PaymentFields, KeyPointsEditor, NarrationForm } from './WdPaymentFields';
import WdCalendar from './WdCalendar';
import { BankFollowUpForm } from './WdBankFollowUp';
import { isBankFollowUpCategory, addBankFollowUp, defaultNextFollowUp, followUpAgeText, followUpsDueToday, fmtFollowDate, isLongPending, LONG_PENDING_DAYS, followUpWho, followUpsByBank, needsEscalationPrompt, escalateFollowUp, declineEscalation } from '../bankFollowUp';
import { learnStyle, buildStylePrompt, buildSummaryPrompt, summaryNumbersLost, examplesFor, checkFacts } from '../reportStyle';
import { getAdvice } from '../sheets';
import { listReportSamples, saveReportSample, deleteReportSample, rewriteReportWithAi } from '../workingDashboardReportCloud';
import { shareReportPdf } from '../reportPdf';
import {
  blankEntry, listsWithEntryValues, toggleEntryDar, RECURRENCES, RECURRENCE_LABELS, RECURRENCE_PRESETS, recurrenceLabel, nextRecurringEntry, dashboardStats, groupCounts, toDateKey,
  quickDueOptions, EMPTY_WD_FILTER, ANY, DUE_WITHIN_OPTIONS, DUE_TILL_TODAY, isWdFilterActive, filterEntries, SORTS, sortEntries,
  completeEntry, reopenEntry, binEntry, restoreEntry, isOpen, isOverdue, editedNow,
  completedTime, DONE_SORTS,
  nextWorkingDay, holidaysWithinDays, holidayBlocks, normalizeHolidays, normalizeLeaveDays, holidayDateKey, entriesToCsvRows, csvRowsToEntries, findDuplicateEntries, WD_CSV_COLUMNS,
  nextFreeSlot, ALERT_MODES, alertModeOf, autoSkipDailyOnNonWorking, isSkippedToday, isOfficeClosed,
} from '../workingDashboard';
import { useTabHistory } from '../useStepBack';
import { fmtDate, fmtDateTime, StatTile, PRIORITY_COLOR, HHMM, fmtDue, RoundBtn, GRID, SEARCH_PLACEHOLDER, WEB_DAR, gridCount, CardGrid, EntryRow, OpenCard, DoneCard, UndoBar, ShowMore, CountList } from './wdCards';

// Shared empties: a fresh [] / {} on each render made the memos below recompute every time.
const NO_LIST = [];

// One-tap wording for Rewrite with AI (Daily Report); the text lands in the instructions box and can be edited.
const REPORT_PRESETS = [
  { label: 'Formal', text: 'Write in a formal, professional tone suitable for senior management.' },
  { label: 'Two lines per task', text: 'Write two lines for each task, in a formal, professional way: what was done, then the outcome or next step.' },
  { label: 'Short', text: 'Keep each bullet to one short line.' },
  { label: 'Detailed', text: 'Give each task a fuller description of what was done, with the people and banks involved, in a formal tone.' },
];

// web.app only: a Narration tab after the Bin - the Tally narration builder, whatever an entry's status.
const TAB_KEYS = ['dashboard', 'register', 'done', 'holidays', 'config', 'bin', ...(Platform.OS === 'web' ? ['narration', 'links'] : []), 'report'];
// Bottom bar, same order as the web app (Report is reached from the Dashboard).
const BAR_TABS = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'register', label: 'Register' },
  { key: 'done', label: 'Completed' },
  { key: 'holidays', label: 'Holidays' },
  { key: 'config', label: 'Config' },
  { key: 'bin', label: 'Bin' },
  ...(Platform.OS === 'web' ? [{ key: 'narration', label: 'Narration', icon: 'list' }, { key: 'links', label: 'Links', icon: 'links' }] : []),
];
const TAB_TITLES = { dashboard: 'Dashboard', register: 'Register', done: 'Completed', holidays: 'Holidays', config: 'Config', bin: 'Bin', narration: 'Tally Narration', links: 'Links', report: 'Daily Report' };
export default function WorkingDashboard() {
  const insets = useSafeAreaInsets();
  const { wide, tablet: tabletWidth, sideBar } = useLayout();
  // "Both" (the APK and the website on a phone): Config, Register, Completed and Holidays use their phone layouts -
  // one column, laid out like the web app's (Config as one page with every section open, not a list of sheets).
  const phoneLayout = !tabletWidth;
  // Bank follow-ups (📞 and the form section): phone-width screens ("Both") and web.app at every size.
  const followUpHere = phoneLayout || Platform.OS === 'web';
  // web.app's Narration tab: three fields to a row on a wide screen (900+), two on anything narrower.
  const narrationCols = wide ? 3 : 2;
  const aboveBar = useAboveBottomBar();
  const fabBottom = wide ? 32 : aboveBar + 20;
  const navigation = useNavigation();
  const route = useRoute();
  const t = useTheme();
  const { data, update } = useStore();
  const wd = data.workingDashboard;
  // The web app's Sub Categories, which categories carry one, and its Tally narration types.
  // The Imports Payments narration type is offered on web.app only.
  const plists = useMemo(() => { const l = paymentLists(wd, wd.categories); return Platform.OS === 'web' ? withWebNarrationTypes(l) : l; }, [wd.subCategories, wd.subCategoryCategories, wd.narrationTypes, wd.categories]); // eslint-disable-line react-hooks/exhaustive-deps
  const entries = wd.entries || NO_LIST;
  const followToday = useMemo(() => followUpsDueToday(entries), [entries]);
  const byBank = useMemo(() => (Platform.OS === 'web' ? followUpsByBank(entries) : []), [entries]);
  // The newest stored copy of each entry, for handlers whose card may have drawn an older one.
  const entriesRef = useRef(entries);
  entriesRef.current = entries;
  const openEntries = useMemo(() => entries.filter(isOpen), [entries]);

  // Back steps through the tabs you visited (a card opens Register; Back returns to Dashboard).
  // Back to the Dashboard also drops the filter a card applied, so Register opens unfiltered next time.
  const [tab, setTab] = useTabHistory('dashboard', (to) => { setVisibleCount(5); if (to === 'dashboard') setFilters(EMPTY_WD_FILTER); });
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState(EMPTY_WD_FILTER);
  const [sortBy, setSortBy] = useState('dueAsc');
  // Completed tab: its own search and filters, so Register's are not carried over (and the other way round).
  const [doneFilters, setDoneFilters] = useState(EMPTY_WD_FILTER);
  const [showDoneFilters, setShowDoneFilters] = useState(false);
  const [doneSortOpen, setDoneSortOpen] = useState(false);
  const setDoneFilter = (patch) => { setDoneFilters((f) => ({ ...f, ...patch })); setVisibleCount(5); };
  const [visibleCount, setVisibleCount] = useState(5);
  const setFilter = (patch) => { setFilters((f) => ({ ...f, ...patch })); setVisibleCount(5); };

  const [entrySheet, setEntrySheet] = useState(null); // draft entry, or null
  const [entryMore, setEntryMore] = useState(false);   // phone form: mail chain, notes and key points opened out
  const [recurrenceOpen, setRecurrenceOpen] = useState(false);
  const [holidaySheet, setHolidaySheet] = useState(null);
  const [checklistSheet, setChecklistSheet] = useState(null);  // web.app: { id, opts } - the checklist shown before ✓ / DAR completes a task
  const [followSheet, setFollowSheet] = useState(null);     // a bank follow-up from a card's 📞: { id, remarks, next }
  const [configSection, setConfigSection] = useState(null);
  const [narrationPage, setNarrationPage] = useState({ typeName: '', includeMail: false });      // web.app's Narration tab
  const [narrationMail, setNarrationMail] = useState('');
  const [narrationEntry, setNarrationEntry] = useState(null);      // an entry picked on the Narration tab, or null
  const [narrationFind, setNarrationFind] = useState('');
  const [linkDraft, setLinkDraft] = useState({ id: '', title: '', url: '', folder: '' });      // web.app's Links tab
  const colItem = Platform.OS === 'web' && wide ? { breakInside: 'avoid' } : undefined;      // a dashboard panel inside the CSS columns
  const tableView = (Platform.OS !== 'web' || wide) && !!wd.tableView;      // web.app: Register / Completed as a table
  // APK: without "Open over other apps" (or full-screen alarms) Android shows an alarm only as a stacked notification to tap.
  // A banner on the dashboard says so and fixes it in one tap; it checks again whenever the app comes back to the front.
  const [alarmBlock, setAlarmBlock] = useState('');      // '' = fine; 'overlay' | 'fullscreen' = what to allow
  useEffect(() => {
    if (Platform.OS === 'web' || !trackerAvailable()) return undefined;
    const look = async () => {
      const [overlay, fsi] = await Promise.all([canDrawOverlays(), isFullScreenIntentAllowed()]);
      setAlarmBlock(!overlay ? 'overlay' : !fsi ? 'fullscreen' : '');
    };
    look();
    const sub = AppState.addEventListener('change', (st) => { if (st === 'active') look(); });
    return () => sub.remove();
  }, []);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);      // web.app: press ? for the keyboard shortcuts
  const [paletteOpen, setPaletteOpen] = useState(false);      // web.app's Cmd/Ctrl+K finder
  const [linkFind, setLinkFind] = useState('');
  const [linkFolder, setLinkFolder] = useState('');      // '' = all folders
  const [reportAlt, setReportAlt] = useState(null);      // { standard, ai, showing } after Rewrite with AI
  const [configFocus, setConfigFocus] = useState('all');      // the phone Config page: every section, or one
  // The phone Holidays tab's search and filters.
  const [holQuery, setHolQuery] = useState('');
  const [holCalendar, setHolCalendar] = useState('All');
  const [holCalendarOpen, setHolCalendarOpen] = useState(false);
  const [holAlertsOnly, setHolAlertsOnly] = useState(false);
  const [doneCatOpen, setDoneCatOpen] = useState(false);       // the phone Completed tab's category list
  const [actDraft, setActDraft] = useState('');
  const [logDraft, setLogDraft] = useState({ title: '', details: '' });
  const [newListDraft, setNewListDraft] = useState({}); // throwaway selection per Lists picker - one shared value showed a Category as the Priority and Status too
  const [testingAlarm, setTestingAlarm] = useState(false);
  const [csvBusy, setCsvBusy] = useState(false);

  // Cloud Sync / Gmail / AI Daily Report
  const [urlDraft, setUrlDraft] = useState(wd.cloudSyncUrl || '');
  const [testResult, setTestResult] = useState(null); // { ok, message } | null
  const [testing, setTesting] = useState(false);
  const [pulling, setPulling] = useState(false);
  const [pullInfo, setPullInfo] = useState(null);
  const [mailBusy, setMailBusy] = useState(false);
  const [mailQuery, setMailQuery] = useState('');
  const [emails, setEmails] = useState([]);
  const [reportDate, setReportDate] = useState(toDateKey(new Date()));
  const [reportText, setReportText] = useState('');
  const [reportKind, setReportKind] = useState('day');      // 'day' (the Daily Activity Report), 'week' or 'month' (a summary)
  const [reportModel, setReportModel] = useState(null);
  const [reportNote, setReportNote] = useState('');
  const [aiBusy, setAiBusy] = useState(false);
  const [samples, setSamples] = useState([]);
  const [samplesBusy, setSamplesBusy] = useState(false);
  const [sampleDraft, setSampleDraft] = useState('');
  const [introDraft, setIntroDraft] = useState(wd.paymentIntro && wd.paymentIntro.length ? wd.paymentIntro : DEFAULT_PAYMENT_INTRO);
  const [mailSheet, setMailSheet] = useState(false);

  // Realtime Sync (Firestore + Google Sign-In)
  const { user: googleUser, listenError, pushError } = useRealtimeStatus();      // the sync itself runs app-wide (RealtimeSync.js)
  // Fetch Mail works with the person's own Apps Script if they added one, else straight from Gmail once signed in.
  const mailAvailable = !!wd.cloudSyncUrl || !!googleUser;
  const [realtimeBusy, setRealtimeBusy] = useState(false);
  const realtimeError = listenError || pushError;
  // Offline: the browser says so (web), or the last send failed (phone). Edits are kept here and sent when the connection returns.
  const [browserOffline, setBrowserOffline] = useState(Platform.OS === 'web' && typeof globalThis.navigator !== 'undefined' && globalThis.navigator.onLine === false);
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof globalThis.addEventListener !== 'function') return undefined;
    const off = () => setBrowserOffline(true);
    const on = () => setBrowserOffline(false);
    globalThis.addEventListener('offline', off);
    globalThis.addEventListener('online', on);
    return () => { globalThis.removeEventListener('offline', off); globalThis.removeEventListener('online', on); };
  }, []);
  const waiting = !!googleUser && (browserOffline || !!pushError);
  const wdRef = useRef(wd);
  wdRef.current = wd;

  /* ---------- derived ---------- */
  const stats = useMemo(() => dashboardStats(entries), [entries]);
  const byCategory = useMemo(() => groupCounts(openEntries, (e) => e.category), [openEntries]);
  const byStatus = useMemo(() => groupCounts(openEntries, (e) => e.status), [openEntries]);
  const byPriority = useMemo(() => groupCounts(openEntries, (e) => e.priority), [openEntries]);
  const byAssignee = useMemo(() => groupCounts(openEntries, (e) => e.pendingWith, 'Unassigned'), [openEntries]);
  // Whatever shape the web app stored (names, date formats) is read into one clean shape here.
  const holidayList = useMemo(() => normalizeHolidays(wd.holidays), [wd.holidays]);
  const leaveList = useMemo(() => normalizeLeaveDays(wd.leaveDays), [wd.leaveDays]);
  const offDays = useMemo(() => ({ holidays: holidayList, leaveDays: leaveList }), [holidayList, leaveList]);
  const upcomingHolidays = useMemo(() => holidaysWithinDays(holidayList, new Date(), 7), [holidayList]);
  const holidayGroups = useMemo(() => {
    const today = toDateKey(new Date());
    const rank = (h) => ((h.endDate || h.date) >= today ? 0 : 1);       // upcoming first, past ones last
    const sorted = [...holidayList].sort((a, b) => rank(a) - rank(b) || (rank(a) ? b.date.localeCompare(a.date) : a.date.localeCompare(b.date)));
    const groups = [];
    sorted.forEach((h) => {
      const key = `${rank(h)}-${h.date.slice(0, 7)}`;
      let g = groups.find((x) => x.key === key);
      if (!g) {
        const label = new Date(`${h.date.slice(0, 7)}-01T12:00:00`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
        g = { key, label: rank(h) ? `${label} · past` : label, items: [] };
        groups.push(g);
      }
      g.items.push(h);
    });
    return groups;
  }, [holidayList]);
  const holidayRelative = (h) => {
    const todayKey = toDateKey(new Date());
    const end = h.endDate || h.date;
    if (h.date <= todayKey && end >= todayKey) return { today: true, past: false, text: 'Today' };
    const days = Math.round((new Date(`${h.date}T12:00:00`) - new Date(`${todayKey}T12:00:00`)) / 86400000);
    if (days < 0) return { past: true, text: `${-days}d ago` };
    return { past: false, text: days === 1 ? 'Tomorrow' : `In ${days}d` };
  };

  // "Both" (phone-width screens): search also finds banker remarks and the narration.
  const filteredOpen = useMemo(() => sortEntries(filterEntries(openEntries, filters, new Date(), { deep: phoneLayout }), sortBy), [openEntries, filters, sortBy, phoneLayout]);
  const doneSort = wd.doneSort || 'completedDesc';
  const allDone = useMemo(() => entries.filter((e) => e.done && !e.binned), [entries]);
  const doneEntries = useMemo(() => sortEntries(filterEntries(allDone, doneFilters, new Date(), { deep: phoneLayout }), doneSort), [allDone, doneFilters, doneSort, phoneLayout]);
  const doneNarrowed = isWdFilterActive(doneFilters) || doneSort !== 'completedDesc';
  const clearDone = () => { setDoneFilters(EMPTY_WD_FILTER); setVisibleCount(5); if (wd.doneSort && wd.doneSort !== 'completedDesc') updateWd((w) => ({ ...w, doneSort: 'completedDesc' })); };
  const binnedEntries = useMemo(() => sortEntries(entries.filter((e) => e.binned), 'logged'), [entries]);
  // web.app lists every entry (Register and Completed); the APK adds 20 at a time with "Show more".
  // The cards are drawn in batches so a long Completed list does not freeze the page while it opens.
  const [webBatch, setWebBatch] = useState(60);
  useEffect(() => {
    if (Platform.OS !== 'web') return undefined;
    const total = Math.max(filteredOpen.length, doneEntries.length);
    if (webBatch >= total) return undefined;
    const id = setTimeout(() => setWebBatch((n) => n + 60), 120);
    return () => clearTimeout(id);
  }, [webBatch, filteredOpen.length, doneEntries.length]);
  const shownCount = Platform.OS === 'web' ? webBatch : tabletWidth ? gridCount(visibleCount) : visibleCount;      // whole rows of two where the web shows a grid
  const binGrid = GRID && tabletWidth;      // the Bin's grid card layout, where the web shows a grid
  const visibleRegister = filteredOpen.slice(0, shownCount);
  // The Completed tab (web.app and the APK) opens on the last five days (today and the four before); the older ones are under "Show more".
  const [showOlderDone, setShowOlderDone] = useState(false);
  const [darNote, setDarNote] = useState(null);      // web.app: { entry, text } - the notes asked for when DAR is pressed
  const doneDays = [1, 3, 5, 10].includes(Number(wd.doneDays)) ? Number(wd.doneDays) : 5;      // Today / 3 / 5 / 10 days
  const doneRecent = useMemo(() => {
    const from = new Date(); from.setHours(0, 0, 0, 0); from.setDate(from.getDate() - (doneDays - 1));
    return doneEntries.filter((e) => completedTime(e) >= from.getTime());
  }, [doneEntries, doneDays]);
  const doneFolded = !showOlderDone && doneRecent.length < doneEntries.length;
  const visibleDone = (showOlderDone ? doneEntries : doneRecent).slice(0, shownCount);

  const updateWd = (fn) => update((db) => ({ ...db, workingDashboard: fn(db.workingDashboard) }));
  // Links and the AI instructions follow the account: stamped so the newer copy wins on every device.
  const setTools = (fn) => updateWd((w) => { const next = fn(w); const now = Date.now(); return { ...next, toolsStamps: stampChanges(toolsValue(w), toolsValue(next), w.toolsStamps, now), toolsUpdatedAt: now }; });

  const pushLog = (w, title, details = '', auto = true) => ({
    ...w,
    activityLog: [{ id: uid(), at: new Date().toISOString(), title, details, auto }, ...(w.activityLog || [])].slice(0, 500),
  });

  /* ---------- entry CRUD ---------- */
  const goTab = (k) => { setTab(k); setVisibleCount(5); if (k === 'report' && !reportModel) buildReport(); };
  // The narration form starts from the entry's saved narration ("Include mail chain" off for a new one; an older
  // narration, saved before the tick existed, keeps the mail chain - as on the web app).
  const withDrafts = (entry) => {
    const n = entry.narration;
    return {
      ...entry,
      keyPoints: normalizeKeyPoints(entry.keyPoints),
      followUpDraft: { remarks: '', next: null },
      narrationDraft: n ? { typeName: n.typeName || '', percent: n.percent || '', docNo: n.docNo || '', poNo: n.poNo || '', purpose: n.purpose || '', fieldsValues: { ...(n.fieldsValues || {}) }, includeMail: n.includeMail !== false } : { typeName: '', includeMail: false },
    };
  };
  const openNewEntry = () => { setEntryMore(false); setEntrySheet(withDrafts(blankEntry())); };
  // Narrations copied anywhere are kept (the last 30, stars stay) - shown under the narration form.
  useEffect(() => { setNarrationSink((text, typeName) => updateWd((w) => ({ ...w, narrationHistory: addHistory(w.narrationHistory || [], text, typeName) }))); return () => setNarrationSink(null); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // Quick add: a typed sentence opens the New Entry form pre-filled (title, due date and time, priority, category, person).
  // Meeting mode: every alert (and walk / water nudge) is held until a chosen moment, then rings once. Kept in the alerts
  // settings (holdUntil) and synced with the account (meta/tools), so the website and the phone follow it.
  const [meetingOpen, setMeetingOpen] = useState(false);
  const holdUntil = Number((wd.alerts || {}).holdUntil) || 0;
  const meetingOn = holdUntil > Date.now();
  const setHold = (ms) => { setTools((w) => ({ ...w, alerts: { ...(w.alerts || {}), holdUntil: ms } })); setMeetingOpen(false); };
  const holdFor = (min) => setHold(Date.now() + min * 60000);
  const holdTomorrow = () => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0); setHold(d.getTime()); };
  const [payMonth, setPayMonth] = useState(0);      // Dashboard's Payments by vendor: 0 = this month, 1 = last month
  const [quickText, setQuickText] = useState('');
  // Voice add (website): the browser's speech recognition fills the quick-add box; on the phone the keyboard's own microphone does.
  const SpeechApi = Platform.OS === 'web' ? (globalThis.SpeechRecognition || globalThis.webkitSpeechRecognition || null) : null;
  const [listening, setListening] = useState(false);
  const listenOnce = () => {
    if (!SpeechApi) return;
    try {
      const r = new SpeechApi();
      r.lang = (wd.quickAdd || {}).speechLang || 'en-IN';
      r.interimResults = true;
      r.onresult = (ev) => { setQuickText(Array.from(ev.results).map((x) => x[0].transcript).join(' ')); };
      r.onend = () => setListening(false);
      r.onerror = () => setListening(false);
      setListening(true);
      r.start();
    } catch { setListening(false); }
  };
  const [attDraft, setAttDraft] = useState({ title: '', url: '' });      // an attachment link being typed in the entry form
  const [showAudit, setShowAudit] = useState(false);      // the task's history, opened in the entry form
  const [stepDraft, setStepDraft] = useState('');      // the checklist step being typed in the entry form
  const payMonthKey = (() => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - payMonth); return toDateKey(d).slice(0, 7); })();
  const payTotals = useMemo(() => paymentsByVendor(entries, plists, payMonthKey), [entries, plists, payMonthKey]);
  const qa = { dateOrder: (wd.quickAdd || {}).dateOrder || 'dmy', dateOnlyTime: (wd.quickAdd || {}).dateOnlyTime || '' };
  const quickParsed = useMemo(() => (quickText.trim() ? parseQuickAdd(quickText, { categories: wd.categories || [], assignees: wd.assignees || [], ...qa }) : null), [quickText, wd.categories, wd.assignees, qa.dateOrder, qa.dateOnlyTime]);
  const quickAdd = (text = quickText) => {
    const p = parseQuickAdd(text, { categories: wd.categories || [], assignees: wd.assignees || [], ...qa });
    if (!p.title && !p.dueAt) return;
    const base = blankEntry();
    setEntryMore(false);
    setEntrySheet(withDrafts({ ...base, title: p.title || String(text).trim(), ...(p.priority ? { priority: p.priority } : null), ...(p.category ? { category: p.category } : null), ...(p.pendingWith ? { pendingWith: p.pendingWith } : null), ...(p.dueAt ? { dueAt: p.dueAt } : null), ...(p.reference ? { reference: p.reference } : null) }));
    setQuickText('');
  };
  const openEditEntry = (entry, patch = {}) => { setEntryMore(false); setEntrySheet({ ...withDrafts(entry), ...patch }); };
  const closeEntrySheet = () => setEntrySheet(null);

  /**
   * The form as it is saved, the web app's way: blank Key Points dropped; the narration built from its form
   * (kept as it was when its section is not shown); a status of Completed completes the entry (and another
   * reopens it); a real status move goes into the work log.
   */
  const finalizeDraft = (d) => {
    const prev = entries.find((x) => x.id === d.id);
    const { narrationDraft, followUpDraft, duplicateOk, ...rest } = d;      // duplicateOk: the save's own flag, not kept
    let row = { ...rest, title: String(d.title || '').trim(), keyPoints: normalizeKeyPoints(d.keyPoints) };
    const completedStatus = normStatus(row.status) === 'completed';
    const now = new Date();
    if (completedStatus && !row.done) row = { ...row, done: true, completedAt: now.toISOString(), snoozeUntil: null };
    else if (!completedStatus && row.done && prev && prev.status !== row.status) row = { ...row, done: false, completedAt: null };
    const sec = paymentSections(row.category, row.status, plists, row.done);
    if (sec.narration) {
      const n = makeNarration(narrationDraft, row, plists);
      if (n) row.narration = n; else if (narrationDraft && !narrationDraft.typeName) delete row.narration;
      // A narration whose type is not on this phone (renamed, or not synced yet) is kept as it was.
      if (!n && prev?.narration && narrationDraft?.typeName && narrationDraft.typeName === prev.narration.typeName) row.narration = prev.narration;
    }
    if (row.narration === undefined) delete row.narration;
    const statusMoved = prev ? prev.status !== row.status : true;
    if (statusMoved && !isUnstartedStatus(row.status)) row = noteWork(row, row.status, now);
    // A bank follow-up written in the form (phone width): logged for today, due again on the next date.
    if (isBankFollowUpCategory(row.category) && String(followUpDraft?.remarks || '').trim()) {
      const was = lastWho(prev || row);
      row = addBankFollowUp(row, { remarks: followUpDraft.remarks, bank: followUpDraft.bank ?? was.bank, banker: followUpDraft.banker ?? was.banker, next: row.done ? null : (followUpDraft.next || defaultNextFollowUp(prev || row, now, offDays)) }, now);
    }
    // Audit trail: what this save changed, and from which device.
    row = { ...row, audit: addAudit(prev ? prev.audit : [], auditDiff(prev || null, row), Platform.OS === 'web' ? 'web' : 'phone', now.getTime()) };
    return row;
  };

  const saveEntry = () => {
    const d = entrySheet;
    if (!d.title.trim()) return Alert.alert('A task description is needed');
    const paymentError = validatePaymentDetails(finalizeDraft(d), plists);
    if (paymentError) return Alert.alert('Almost there', paymentError);
    if (d.recurrence === 'custom' && !(Number(d.recurrenceEveryMin) >= 1)) return Alert.alert('Enter how many minutes between repeats');
    if (d.recurrence !== 'none' && !d.dueAt) return Alert.alert('A repeating entry needs a due date and time');
    // "Both" (phone-width screens): a new task with the title and category of one already open is asked about first.
    const same = (x) => String(x || '').trim().toLowerCase();
    const twin = phoneLayout && !d.duplicateOk && !entries.some((x) => x.id === d.id)
      && entries.find((x) => isOpen(x) && same(x.title) === same(d.title) && same(x.category) === same(d.category));
    if (twin) {
      Alert.alert('Looks like a task you already have', `"${twin.title}" is open${twin.dueAt ? ` (due ${fmtDateTime(twin.dueAt)})` : ''}. Save this one anyway?`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Open the existing one', onPress: () => openEditEntry(twin) },
        { text: 'Save anyway', onPress: () => saveEntryChecked({ ...d, duplicateOk: true }) },
      ]);
      return;
    }
    saveEntryChecked(d);
  };
  const saveEntryChecked = (d) => {
    if (d.dueAt && wd.timeSlotHoldMin > 0) {
      const pushed = nextFreeSlot(d.dueAt, entries, wd.timeSlotHoldMin, d.id);
      if (pushed) {
        Alert.alert(
          'That time is already held',
          `Another entry holds the clock until then. Use ${fmtDateTime(pushed)} instead?`,
          [
            // web.app: Cancel closes the question and leaves the form open, nothing saved.
            ...(Platform.OS === 'web' ? [{ text: 'Cancel', style: 'cancel' }] : []),
            { text: 'Keep my time', onPress: () => commitEntry(d) },
            { text: `Use ${fmtDateTime(pushed)}`, onPress: () => commitEntry({ ...d, dueAt: pushed }) },
          ],
        );
        return;
      }
    }
    commitEntry(d);
  };

  const commitEntry = (d) => {
    const row = { ...finalizeDraft(d), ...editedNow() };
    const isNew = !entries.some((x) => x.id === row.id);
    const prev = entries.find((x) => x.id === row.id);
    // Completed from the form (status set to Completed - also the way a payment that needs its Sub Category is
    // completed): a repeating entry rolls on to its next occurrence, as ✓ on its card does.
    const rolled = row.done && !prev?.done ? nextRecurringEntry(row, entries, new Date(), { holidays: holidayList, leaveDays: leaveList }) : null;
    if (prev) offerUndo(`Edited “${row.title}”`, [prev], rolled ? [rolled.id] : []);
    else offerUndo(`Added “${row.title}”`, [], [row.id, ...(rolled ? [rolled.id] : [])]);
    updateWd((w) => {
      const next = isNew ? [row, ...(w.entries || [])] : w.entries.map((x) => (x.id === row.id ? row : x));
      // The narration type used for this category is remembered for the next entry in it.
      const memory = row.narration?.typeName && row.category ? { narrationByCategory: { ...(w.narrationByCategory || {}), [row.category]: row.narration.typeName } } : {};
      return pushLog({ ...w, ...memory, entries: rolled ? [rolled, ...next] : next }, isNew ? 'Logged' : 'Edited', row.title);
    });
    scheduleEntryAlert(row, wd.alarmRingtone, wd.alerts).catch(() => {});
    if (rolled) scheduleEntryAlert(rolled, wd.alarmRingtone, wd.alerts).catch(() => {});
    closeEntrySheet();
  };

  /* ---------- undo ---------- */
  const [undo, setUndo] = useState(null);       // { message, before: [entries as they were], addedIds }
  // Every undoable change is also kept (the last 25, with the task as it was) for Config > Recent Changes.
  const offerUndo = (message, before, addedIds = []) => {
    const item = { id: `u-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e4)}`, message, before, addedIds, at: Date.now() };
    setUndo(item);
    updateWd((w) => ({ ...w, undoHistory: [item, ...(w.undoHistory || [])].slice(0, 25) }));
  };
  const runUndo = (item) => {
    const u = item && item.before ? item : undo;
    if (!item || !item.before) setUndo(null); else if (undo && undo.id === item.id) setUndo(null);
    if (!u) return;
    updateWd((w) => ({ ...w, undoHistory: (w.undoHistory || []).filter((x) => x.id !== u.id) }));
    const stamp = new Date().toISOString();       // a fresh time, so Realtime Sync sends the restored version too
    const back = new Map(u.before.map((e) => [e.id, { ...e, updatedAt: stamp, localEditAt: new Date(stamp).getTime() }]));
    updateWd((w) => pushLog({
      ...w,
      entries: (w.entries || []).filter((x) => !u.addedIds.includes(x.id)).map((x) => back.get(x.id) || x),
      // A rolled-on repeat that is taken back must also go from the cloud.
      deletedIds: [...new Set([...(w.deletedIds || []), ...u.addedIds])],
    }, 'Undone', u.message));
    u.addedIds.forEach((id) => cancelEntryAlert(id).catch(() => {}));
    u.before.forEach((e) => { if (isOpen(e)) scheduleEntryAlert(e, wd.alarmRingtone, wd.alerts).catch(() => {}); else cancelEntryAlert(e.id).catch(() => {}); });
  };

  const act = (shown, kind, opts = {}) => {
    // web.app: ✓ or DAR on a task with a checklist opens the checklist first, to tick the steps before it is completed.
    if (kind === 'complete' && Platform.OS === 'web' && !opts.checklistOk) {
      const live = entriesRef.current.find((x) => x.id === shown.id) || shown;
      if (checklistOf(live).length) { setChecklistSheet({ id: live.id, opts }); return; }
    }
    // web.app: DAR on a card first asks for the notes that go into the daily report.
    if (kind === 'complete' && opts.dar === true && opts.notes === undefined && Platform.OS === 'web') {
      setDarNote({ entry: entriesRef.current.find((x) => x.id === shown.id) || shown, text: '' });
      return;
    }
    const withNotes = (x) => (String(opts.notes || '').trim() ? { ...x, notes: x.notes ? `${x.notes}\n${String(opts.notes).trim()}` : String(opts.notes).trim() } : x);
    // Applied to the newest copy, not the one the card drew: a web-app edit arriving just before the tap
    // was otherwise overwritten by the card's older copy.
    const pick = (x) => (kind === 'complete' ? completeEntry(withNotes(opts.dar === undefined ? x : { ...x, dar: opts.dar })) : kind === 'reopen' ? reopenEntry(x) : kind === 'bin' ? binEntry(x) : restoreEntry(x));
    const entry = entriesRef.current.find((x) => x.id === shown.id) || shown;
    // As on the web app: a category that needs a Sub Category is completed from the form, with its details.
    if (kind === 'complete' && !subCategoryComplete(entry, plists)) {
      openEditEntry(entry, { status: 'Completed', ...(opts.dar === undefined ? {} : { dar: opts.dar }), ...(String(opts.notes || '').trim() ? { notes: withNotes(entry).notes } : {}) });
      Alert.alert('Sub Category needed', 'Select a Sub Category and fill in its details, then save to mark this done.');
      return;
    }
    // A checklist with steps still open: ask before completing (the web asks too).
    if (kind === 'complete' && !opts.checklistOk && checklistOpen(entry).length) {
      Alert.alert('Steps still open', `${checklistOpen(entry).length} of ${checklistText(entry).split('/')[1]} checklist steps are not ticked. Complete the task anyway?`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Complete anyway', onPress: () => act(shown, kind, { ...opts, checklistOk: true }) },
      ]);
      return;
    }
    const applied = pick(entry);
    const label = kind === 'complete' ? 'Completed' : kind === 'reopen' ? 'Reopened' : kind === 'bin' ? 'Binned' : 'Restored';
    const rolled = kind === 'complete' ? nextRecurringEntry(entry, entriesRef.current, new Date(), { holidays: holidayList, leaveDays: leaveList }) : null;
    updateWd((w) => pushLog({ ...w, entries: [...(rolled ? [rolled] : []), ...w.entries.map((x) => (x.id === entry.id ? (() => { const r = pick(x); return { ...r, audit: addAudit(x.audit, ACTION_AUDIT[kind] || label, Platform.OS === 'web' ? 'web' : 'phone') }; })() : x))] }, label, entry.title));
    offerUndo(`${label} “${entry.title}”`, [entry], rolled ? [rolled.id] : []);
    if (kind === 'complete' || kind === 'bin') cancelEntryAlert(entry.id).catch(() => {});
    if (rolled) scheduleEntryAlert(rolled, wd.alarmRingtone, wd.alerts).catch(() => {});
    else if (kind === 'reopen') scheduleEntryAlert(applied, wd.alarmRingtone, wd.alerts).catch(() => {});
  };

  /** A card's 📞 (bank follow-ups, phone width): today's banker update and the next follow-up date. */
  // The bank and banker start as last time's: usually the same person is followed up with.
  const lastWho = (entry) => { const log = entry.bankFollowUps || []; const l = log[log.length - 1] || {}; return { bank: l.bank || '', banker: l.banker || '' }; };
  const openFollowUp = (entry) => setFollowSheet({ id: entry.id, remarks: '', next: defaultNextFollowUp(entry, new Date(), offDays), ...lastWho(entry) });
  const saveFollowUp = () => {
    const f = followSheet;
    const entry = entriesRef.current.find((x) => x.id === f.id);
    if (!entry) { setFollowSheet(null); return; }
    if (!String(f.remarks || '').trim()) { Alert.alert("Enter the banker's remarks / update"); return; }
    const item = { remarks: f.remarks, next: f.next, bank: f.bank, banker: f.banker };
    const applied = addBankFollowUp(entry, item, new Date());
    updateWd((w) => pushLog({ ...w, entries: w.entries.map((x) => (x.id === entry.id ? addBankFollowUp(x, item, new Date()) : x)) }, 'Followed up', entry.title));
    scheduleEntryAlert(applied, wd.alarmRingtone, wd.alerts).catch(() => {});
    setFollowSheet(null);
  };

  const deleteForever = (entry) => {
    Alert.alert('Delete forever?', 'This cannot be undone.', [
      { text: 'Cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => {
        // Remembered as a tombstone so Realtime Sync deletes the cloud copy too, and cannot bring it back.
        // purgedIds is never trimmed by a Firestore push, so a later sheet pull cannot bring it back either.
        updateWd((w) => ({
          ...w,
          entries: (w.entries || []).filter((x) => x.id !== entry.id),
          deletedIds: [...new Set([...(w.deletedIds || []), String(entry.id)])].slice(-500),
          purgedIds: [...new Set([...(w.purgedIds || []), String(entry.id)])].slice(-2000),
        }));
        cancelEntryAlert(entry.id).catch(() => {});
      } },
    ]);
  };

  /** 🔔 / 🔕 on a card: this task rings as an alarm, or is a plain reminder - its alerts are booked again at once. */
  // "Both" (phone-width cards): the long pending follow-up's escalation offer, answered once.
  const answerEscalation = (entry, yes) => {
    const now = new Date();
    updateWd((w) => {
      const next = { ...w, entries: w.entries.map((x) => (x.id === entry.id ? (yes ? escalateFollowUp(x, now) : declineEscalation(x, now)) : x)) };
      return yes ? pushLog(next, 'Escalated', entry.title) : next;
    });
    if (yes) Alert.alert('Escalated', 'Now High priority. "Escalated to manager" is in today\'s Daily Activity Report.');
  };
  const toggleAlert = (shown) => {
    const entry = entriesRef.current.find((x) => x.id === shown.id) || shown;
    const next = { ...entry, alertMode: alertModeOf(entry, wd.alerts) === 'alarm' ? 'gentle' : 'alarm', ...editedNow() };
    updateWd((w) => ({ ...w, entries: w.entries.map((x) => (x.id === entry.id ? { ...x, alertMode: next.alertMode, ...editedNow() } : x)) }));
    scheduleEntryAlert(next, wd.alarmRingtone, wd.alerts).catch(() => {});
  };

  const toggleDar = (shown) => {
    const entry = entriesRef.current.find((x) => x.id === shown.id) || shown;
    updateWd((w) => ({ ...w, entries: w.entries.map((x) => (x.id === entry.id ? toggleEntryDar(x) : x)) }));
    offerUndo(`${entry.dar !== false ? 'Removed from' : 'Added to'} the daily report`, [entry]);
  };

  // The phone Config page shows Report Style Samples open: load them when it is opened.
  useEffect(() => { if (tab === 'config') loadSamples(true); }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps

  // web.app keyboard shortcuts: N a new entry, / search Register, Esc closes the open form. Not while typing.
  const keysRef = useRef({});
  keysRef.current = { entrySheet, followSheet, openNewEntry, closeEntrySheet, setFollowSheet, goTab, openPalette: () => setPaletteOpen(true), openShortcuts: () => setShortcutsOpen(true) };
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof globalThis.addEventListener !== 'function') return undefined;
    const onKey = (ev) => {
      const k = keysRef.current;
      if (ev.key === 'Escape') {
        if (k.entrySheet) { k.closeEntrySheet(); ev.preventDefault(); } else if (k.followSheet) { k.setFollowSheet(null); ev.preventDefault(); }
        return;
      }
      if ((ev.metaKey || ev.ctrlKey) && (ev.key === 'k' || ev.key === 'K')) { ev.preventDefault(); k.openPalette(); return; }
      const el = ev.target;
      const typing = el && (el.isContentEditable || /^(input|textarea|select)$/i.test(el.tagName || ''));
      if (typing || ev.ctrlKey || ev.metaKey || ev.altKey || k.entrySheet || k.followSheet) return;
      if (ev.key === '?') { ev.preventDefault(); k.openShortcuts(); return; }
      if (ev.key === 'n' || ev.key === 'N') { ev.preventDefault(); k.openNewEntry(); return; }
      if (ev.key === '/') {
        ev.preventDefault();
        k.goTab('register');
        setTimeout(() => { const box = globalThis.document?.querySelector(`input[placeholder="${SEARCH_PLACEHOLDER}"]`); if (box) box.focus(); }, 150);
      }
    };
    globalThis.addEventListener('keydown', onKey);
    return () => globalThis.removeEventListener('keydown', onKey);
  }, []);

  // Sent here by the week summary reminder (APK): the Report tab with the week's summary.
  useEffect(() => {
    const kind = route.params?.summary;
    if (!kind) return;
    navigation.setParams({ summary: undefined, at: undefined });
    setTab('report');
    buildSummary(kind);
  }, [route.params?.summary, route.params?.at]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sent here by the Past Due Alert's "Mark done" for an entry that needs its Sub Category first.
  // Shared into the app (Gmail's Share menu): the mail subject becomes a pre-filled New Entry, with the mail chain.
  useEffect(() => {
    const text = route.params?.quick;
    if (!text) return;
    navigation.setParams({ quick: undefined, at: undefined });
    quickAdd(String(text).split('\n')[0].replace(/^(?!\s*(re|fw|fwd)\s*:)/i, 'RE: '));
  }, [route.params?.quick, route.params?.at]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const id = route.params?.completeId;
    if (!id) return;
    navigation.setParams({ completeId: undefined });
    const entry = entriesRef.current.find((x) => String(x.id) === String(id));
    if (!entry || !isOpen(entry)) return;
    openEditEntry(entry, { status: 'Completed', ...(route.params?.dar === false ? { dar: false } : {}) });
    Alert.alert('Sub Category needed', 'Select a Sub Category and fill in its details, then save to mark this done.');
  }, [route.params?.completeId]); // eslint-disable-line react-hooks/exhaustive-deps

  // As on the web app: a Daily task never falls on a day the office is closed - it moves on to the next working day
  // by itself, recorded as skipped (not done). Checked when the app opens and whenever holidays or leave days change.
  useEffect(() => {
    const res = autoSkipDailyOnNonWorking(entriesRef.current, holidayList, leaveList);
    if (!res.moved.length) return;
    const byId = new Map(res.moved.map((m) => [m.entry.id, m.entry]));
    const before = entriesRef.current.filter((x) => byId.has(x.id));
    updateWd((w) => ({ ...w, entries: (w.entries || []).map((x) => byId.get(x.id) || x) }));
    res.moved.forEach((m) => scheduleEntryAlert(m.entry, wd.alarmRingtone, wd.alerts).catch(() => {}));
    const m = res.moved[0];
    offerUndo(res.moved.length === 1 ? `“${m.entry.title}” (daily) skipped for ${fmtDate(m.off)} - next on ${fmtDate(m.next)}` : `${res.moved.length} daily tasks skipped for ${fmtDate(m.off)} - next on ${fmtDate(m.next)}`, before);
  }, [holidayList, leaveList]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---------- holidays ---------- */
  const openNewHoliday = () => setHolidaySheet({ id: uid(), title: '', date: toDateKey(new Date()), endDate: '', tag: '', officeClosed: true });
  const saveHoliday = () => {
    const h = holidaySheet;
    if (!h.title.trim() || !h.date) return Alert.alert('A name and date are needed');
    const row = { ...h, title: h.title.trim(), endDate: h.endDate || h.date };
    updateWd((w) => {
      const cur = normalizeHolidays(w.holidays);
      const isNew = !cur.some((x) => x.id === row.id);
      return { ...w, holidays: normalizeHolidays(isNew ? [...cur, row] : cur.map((x) => (x.id === row.id ? row : x))) };
    });
    setHolidaySheet(null);
  };
  const removeHoliday = (id) => updateWd((w) => ({ ...w, holidays: normalizeHolidays(w.holidays).filter((x) => x.id !== id) }));

  /* ---------- config: fixed activities / leave days / activity log ---------- */
  const addFixedActivity = () => {
    const v = actDraft.trim();
    if (!v) return;
    updateWd((w) => ({ ...w, fixedActivities: [...(w.fixedActivities || []), { id: uid(), text: v, active: true }] }));
    setActDraft('');
  };
  const toggleFixedActivity = (id) => updateWd((w) => ({ ...w, fixedActivities: w.fixedActivities.map((x) => (x.id === id ? { ...x, active: !x.active } : x)) }));
  const removeFixedActivity = (id) => updateWd((w) => ({ ...w, fixedActivities: w.fixedActivities.filter((x) => x.id !== id) }));

  const todayKey = toDateKey(new Date());               // local day: toISOString() is UTC and names yesterday before ~5:30 am in India
  // Leave days can arrive from the web app as ranges or an object map, not just date strings.
  const markTodayLeave = () => updateWd((w) => { const cur = normalizeLeaveDays(w.leaveDays); return cur.includes(todayKey) ? w : { ...w, leaveDays: [...cur, todayKey] }; });
  const removeLeaveDay = (day) => updateWd((w) => ({ ...w, leaveDays: normalizeLeaveDays(w.leaveDays).filter((x) => x !== day) }));

  const addLogEntry = () => {
    if (!logDraft.title.trim()) return;
    updateWd((w) => pushLog(w, logDraft.title.trim(), logDraft.details.trim(), false));
    setLogDraft({ title: '', details: '' });
  };

  /* ---------- reminders / time slots / alarm ---------- */
  const saveReminder = (kind, patch) => {
    const next = { ...wd.reminders, [kind]: { ...wd.reminders[kind], ...patch } };
    updateWd((w) => ({ ...w, reminders: next }));
    // Each keystroke saves; only a complete pair of times is booked ("1" on the way to "10:00" would book from 1 am).
    const valid = (r) => !r?.enabled || (HHMM.test(String(r.start || '')) && HHMM.test(String(r.end || '')));
    if (valid(next.walk) && valid(next.water)) armTodaysReminders(next, wd.alarmRingtone, wd.alerts).catch(() => {});
  };

  /* ---------- data backup ---------- */
  const exportCsv = async () => {
    setCsvBusy(true);
    try {
      await shareCsv(entriesToCsvRows(entries), `working-dashboard-${todayKey}.csv`, WD_CSV_COLUMNS);
    } catch (e) { Alert.alert('Export failed', e.message); }
    finally { setCsvBusy(false); }
  };
  const importCsv = async () => {
    setCsvBusy(true);
    try {
      const rows = await pickCsv();
      if (!rows) return;
      const added = csvRowsToEntries(rows, { existing: entries });
      if (!added.length) return Alert.alert('Nothing new', 'Every row already matches something in the register.');
      updateWd((w) => {
        const have = new Set((w.entries || []).map((x) => x.id));
        return { ...w, entries: [...added.filter((x) => !have.has(x.id)), ...(w.entries || [])] };
      });
      Alert.alert('Imported', `${added.length} new entr${added.length === 1 ? 'y' : 'ies'} added.`);
    } catch (e) { Alert.alert('Import failed', e.message); }
    finally { setCsvBusy(false); }
  };
  const duplicateGroups = useMemo(() => findDuplicateEntries(entries), [entries]);

  const testAlarm = async () => {
    setTestingAlarm(true);
    await previewRingtone(wd.alarmRingtone);
    setTimeout(() => setTestingAlarm(false), 2000);
  };

  /* ---------- Cloud Sync ---------- */
  const pullFromSheet = async (url) => {
    setPulling(true);
    // Whatever goes wrong, "Pulling..." must end: an error thrown here used to leave the button disabled.
    try { await pullFromSheetInner(url); }
    catch (e) { setTestResult({ ok: false, message: e?.message || 'The sheet could not be read.' }); }
    finally { setPulling(false); }
  };
  const pullFromSheetInner = async (url) => {
    const res = await pullSheetEntries(url, blankEntry());
    if (res.ok) {
      const pulledAt = Date.now();
      updateWd((w) => {
        const merged = mergeSheetPull(w.entries || [], res.tasks, w.lastSheetPullAt || 0, w.purgedIds || [], { addOnly: !!googleUser });
        // Only values from entries new to this device join the lists, so a deleted option is not brought back.
        const had = new Set((w.entries || []).map((x) => String(x.id)));
        return { ...w, ...listsWithEntryValues(w, merged.entries.filter((x) => !had.has(String(x.id)))), entries: merged.entries, lastSheetPullAt: pulledAt };
      });
      pullSheetHolidays(url).then((h) => {
        if (!h.ok) return;
        const found = normalizeHolidays(h.holidays);
        if (found.length) updateWd((w) => ({ ...w, holidays: mergeHolidays(normalizeHolidays(w.holidays), found).holidays }));
      }).catch(() => {});
      setPullInfo({ action: res.action, columns: res.columns, sample: res.sample, statuses: res.statuses });
      const live = res.tasks.filter((e) => !e.purged);
      const open = live.filter((e) => !e.done && !e.binned).length;
      const dated = live.filter((e) => e.dueAt).length;
      setTestResult({
        ok: true,
        message: `Loaded ${live.length} entries - ${open} open, ${dated} with a due date.${dated === 0 ? ` No due-date column recognised. Sheet columns: ${res.columns.join(', ')}` : ''}`,
      });
    } else {
      setTestResult({ ok: false, message: res.message });
    }
  };
  const saveCloudUrl = () => {
    const url = urlDraft.trim();
    updateWd((w) => ({ ...w, cloudSyncUrl: url }));
    setTestResult(null);
    if (isValidScriptUrl(url)) pullFromSheet(url);
  };
  const runTestConnection = async () => {
    setTesting(true);
    setTestResult(null);
    const url = urlDraft.trim();
    const res = await testConnection(url);
    setTestResult(res);
    if (res.ok) updateWd((w) => ({ ...w, cloudSyncUrl: url }));
    setTesting(false);
  };

  /* ---------- Gmail Fetch Mail ---------- */
  const closeMail = () => { setMailSheet(false); setMailQuery(''); };
  const openMail = async () => {
    setConfigSection(null);
    setMailSheet(true);
    if (!mailAvailable) return;
    setMailBusy(true);
    try { setEmails(await fetchUnreadEmails(wd.cloudSyncUrl)); }
    catch (e) { Alert.alert('Could not fetch mail', e.message); }
    finally { setMailBusy(false); }
  };
  const ignoreEmail = (email) => {
    setEmails((list) => list.filter((e) => e.id !== email.id));
    markEmailRead(wd.cloudSyncUrl, email.id).catch(() => {});
  };
  const addTaskFromEmail = async (email) => {
    closeMail();
    const draft = emailToEntryDraft(email);
    // The web app keeps the mail's id on the task (emailId), so it can open the original mail.
    setEntrySheet({ ...withDrafts(draft), emailId: email.id });
    ignoreEmail(email);
    if (!email.body) {
      try {
        const body = (await fetchEmailBody(wd.cloudSyncUrl, email.id)).slice(0, 500);
        setEntrySheet((s) => ({ ...s, notes: `From: ${email.sender || ''}\n\n${body}` }));
      } catch { /* keep the placeholder note */ }
    }
  };
  const visibleEmails = useMemo(() => filterEmails(emails, mailQuery), [emails, mailQuery]);
  const openEmailInGmail = (email) => Linking.openURL(`https://mail.google.com/mail/u/0/#all/${encodeURIComponent(email.id)}`).catch(() => {});

  /* ---------- AI Daily Report ---------- */
  const buildReport = (date = reportDate) => {
    const model = buildReportModel({ entries, fixedActivities: wd.fixedActivities, activityLog: wd.activityLog, date, paymentIntro: wd.paymentIntro, leaveDays: leaveList, holidays: holidayList, lists: plists,
      // web.app only: every line is written from the entry's notes and Tally narration too (the owner's choice).
      details: Platform.OS === 'web' });
    setReportModel(model);
    setReportAlt(null);
    setReportText(reportModelToText(model));
    setReportNote('');
    setReportKind('day');
    return model;
  };
  // A week's or month's totals up to the picked date (workingDashboardReport.buildPeriodSummary).
  const buildSummary = (kind) => {
    const sum = buildPeriodSummary({ entries, kind, date: reportDate, lists: plists });
    setReportModel(null);
    setReportAlt(null);
    setReportText(sum.text);
    setReportNote('');
    setReportKind(kind);
  };
  // The report in a new mail (the phone's mail app, or the computer's), ready to address and send.
  const reportTitle = () => (reportKind === 'day'
    ? `Daily Activity Report - ${new Date(`${reportDate}T12:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`
    : reportText.split('\n')[0]);
  // Addressed to the "Send to" address saved below the report, when there is one.
  const emailReport = () => {
    Linking.openURL(reportMailUrl(reportTitle(), reportText, wd.reportEmail)).catch(() => Alert.alert('No mail app', 'Copy the report and paste it into a mail instead.'));
  };
  const csvReport = async () => {
    const { rows, columns } = reportCsvRows(reportKind === 'day' ? reportModel : null, reportText);
    if (!rows.length) return Alert.alert('Nothing to export', 'Generate the report first.');
    try { await shareCsv(rows, `${reportTitle().replace(/[^\w -]+/g, '').trim().replace(/\s+/g, '-') || 'report'}.csv`, columns); }
    catch (e) { Alert.alert('Could not export', e?.message || 'Try again.'); }
  };
  const pdfReport = async () => {
    const ok = await shareReportPdf(reportTitle(), reportText).catch(() => false);
    if (!ok) Alert.alert('Could not make the PDF', Platform.OS === 'web' ? 'Allow pop-ups for this site, then try again.' : 'Copy the report instead.');
  };
  // Weekly / monthly summaries: the same Rewrite with AI, with its own saved instructions. Nothing is used unless every number survives.
  const rewriteSummaryWithAi = async () => {
    const draft = reportText;
    setAiBusy(true);
    try {
      const prompt = buildSummaryPrompt(draft, wd.reportAiNotesSummary || '', reportKind);
      const advisor = data.settings?.aiAdvisor || {};
      let ai = '';
      if (advisor.enabled && advisor.endpoint) {
        try { const res = await getAdvice(advisor.endpoint, prompt, { task: `${reportKind}-summary`, date: reportDate, draft }); ai = (res && (res.advice || res.reply)) || ''; } catch { ai = ''; }
      }
      if (!ai.trim()) ai = await rewriteReportWithAi(wd.cloudSyncUrl, { date: reportDate, draft, itemCount: 0, prompt, examples: [] });
      const lost = summaryNumbersLost(draft, ai);
      if (!ai.trim() || lost.length) { setReportNote(`AI version was not used${lost.length ? ` - it lost ${lost.length} number(s) such as ${lost[0]}` : ''}. Showing the standard summary.`); return; }
      setReportAlt({ standard: draft, ai: ai.trim(), showing: 'ai' });
      setReportText(ai.trim());
      setReportNote('✨ Rewritten with AI - every number is kept. Use "Show the standard version" to compare.');
    } catch (e) {
      setReportNote(`AI not available right now (${e.message}) - showing the standard summary.`);
    } finally { setAiBusy(false); }
  };
  const aiKey = reportKind === 'day' ? 'reportAiNotes' : 'reportAiNotesSummary';
  const rewriteAny = () => (reportKind === 'day' ? rewriteWithAi() : rewriteSummaryWithAi());
  const rewriteWithAi = async () => {
    const model = reportModel || buildReport();
    setAiBusy(true);
    try {
      const draft = reportModelToText(model, { headings: true });
      // Your past reports (saved here and on the sheet) teach the wording; the facts come only from the draft.
      let pool = samples;
      if (!pool.length && wd.cloudSyncUrl) { try { pool = await listReportSamples(wd.cloudSyncUrl); setSamples(pool); } catch { pool = []; } }
      const style = learnStyle([...(wd.reportSamplesLocal || []), ...pool.map((x) => x.sampleText)].filter((x, i, a) => a.indexOf(x) === i));
      const prompt = buildStylePrompt(model, draft, style, wd.reportAiNotes || '');
      const examples = model.sections.flatMap((sec) => sec.rows.map((r) => ({ line: r.line, like: examplesFor({ section: sec.title, category: r.entry && r.entry.category, text: r.line }, style, 2) })));
      const advisor = data.settings?.aiAdvisor || {};
      let ai = '';
      if (advisor.enabled && advisor.endpoint) {
        // The Apps Script AI endpoint takes the whole prompt as its instructions, so the style is followed exactly.
        // If it fails, fall through to the Cloud Sync rewrite below rather than giving up.
        try {
          const res = await getAdvice(advisor.endpoint, prompt, { task: 'daily-activity-report', date: model.date, draft });
          ai = (res && (res.advice || res.reply)) || '';
        } catch { ai = ''; }
      }
      if (!ai.trim()) ai = await rewriteReportWithAi(wd.cloudSyncUrl, { date: model.date, draft, itemCount: model.data.bullets, prompt, examples });
      // As on the web app: merged section by section - payments, duty and import lines stay word for word, and a
      // section the AI shortened keeps the standard wording. Mail chains it copied in are taken out.
      const mails = entries.map((x) => String(x.reference || '').trim()).filter((x) => x.length > 6);
      const merged = mergeAiReport(model, ai, mails);
      if (merged && merged.ai) ai = merged.text;
      const verdict = verifyAiRewrite(model, ai);
      if (!verdict.ok) { setReportNote(`AI version was not used (it ${merged ? 'shortened every section' : verdict.reason}) — showing the complete standard report.`); return; }
      const facts = checkFacts(model, ai);
      if (!facts.ok) { setReportNote(`AI version was not used — it lost ${facts.missing.length} fact(s) such as "${facts.missing[0].fact}". Showing the complete standard report.`); return; }
      setReportAlt({ standard: reportModelToText(model), ai, showing: 'ai' });
      setReportText(ai);
      setReportNote(`✨ Written in your style${style.samples ? ` (learned from ${style.samples} past report${style.samples === 1 ? '' : 's'})` : ' (add past reports in Config → Report Style Samples to teach it)'} — every item, amount, name and reference checked present.`);
    } catch (e) {
      setReportNote(`AI not available right now (${e.message}) — showing the complete standard report.`);
    } finally { setAiBusy(false); }
  };
  const copyReport = async () => { await Clipboard.setStringAsync(reportText); Alert.alert('Copied', 'Report copied to the clipboard.'); };

  // `quiet`: loaded by itself (the phone Config page opening) - a failure is not worth an alert there.
  const loadSamples = async (quiet = false) => {
    if (!wd.cloudSyncUrl) return;
    setSamplesBusy(true);
    try { setSamples(await listReportSamples(wd.cloudSyncUrl)); }
    catch (e) { if (!quiet) Alert.alert('Could not load samples', e.message); }
    finally { setSamplesBusy(false); }
  };
  const addSample = async () => {
    const text = sampleDraft.trim();
    if (!text) return;
    if (!wd.cloudSyncUrl) { updateWd((w) => ({ ...w, reportSamplesLocal: [...(w.reportSamplesLocal || []).filter((x) => x !== text), text].slice(-30) })); setSampleDraft(''); return; }
    setSamplesBusy(true);
    updateWd((w) => ({ ...w, reportSamplesLocal: [...(w.reportSamplesLocal || []).filter((x) => x !== text), text].slice(-30) }));
    try { await saveReportSample(wd.cloudSyncUrl, text); setSampleDraft(''); await loadSamples(); }
    catch (e) { Alert.alert('Could not save sample', e.message); }
    finally { setSamplesBusy(false); }
  };
  const removeSample = async (id) => {
    const gone = samples.find((x) => x.id === id);
    if (gone) updateWd((w) => ({ ...w, reportSamplesLocal: (w.reportSamplesLocal || []).filter((x) => x !== gone.sampleText) }));
    setSamplesBusy(true);
    try { await deleteReportSample(wd.cloudSyncUrl, id); await loadSamples(); }
    catch (e) { Alert.alert('Could not delete sample', e.message); }
    finally { setSamplesBusy(false); }
  };

  const savePaymentIntro = (lines) => { setIntroDraft(lines); updateWd((w) => ({ ...w, paymentIntro: lines })); };

  /* ---------- Realtime Sync (Firestore + Google Sign-In) ---------- */
  const doGoogleSignIn = async () => {
    setRealtimeBusy(true);
    setRealtimeStatus({ listenError: '' });
    try { await signInWithGoogle(); } catch (e) { setRealtimeStatus({ listenError: e.message }); }
    finally { setRealtimeBusy(false); }
  };
  const doGoogleSignOut = async () => {
    setRealtimeBusy(true);
    try { await signOutOfGoogle(); } catch { /* already signed out */ }
    finally { setRealtimeBusy(false); }
  };

  /*
   * The New / Edit Entry form. One set of fields, laid out two ways: the desktop website (900+ wide - the owner's
   * "web.app desktop only") fills the screen with four fields a row so the whole form fits without scrolling (it
   * still scrolls when it has to); every other screen - the APK, the website on a phone or tablet - keeps the
   * form exactly as it was.
   */
  const deskForm = GRID && wide;
  // Cancel / Save stay pinned at the bottom of the New Entry page, so Save is one tap away however far down the form
  // is scrolled: on phone-width screens, and on the website below 900px (its one-column form). The APK on a tablet
  // keeps them at the end of the form; the desktop form has them beside it.
  const pinSave = !deskForm && (!tabletWidth || Platform.OS === 'web');
  const entryButtons = (
    <Row gap={10}>
      <Btn style={{ flex: 1 }} kind="soft" title="Cancel" onPress={closeEntrySheet} />
      <Btn style={{ flex: 2 }} title="Save Entry" onPress={saveEntry} />
    </Row>
  );
  const renderEntryForm = () => {
    // Each field as the form has always drawn it; the Row-pair children keep their { flex: 1 } wrapper.
    const isNew = !entries.some((x) => x.id === entrySheet.id);
    const f = {
      // A new task can start from a saved template; any task can be saved as one.
      templates: isNew && (wd.templates || []).length ? (
        <View style={{ marginBottom: 12 }}>
          <Small style={{ marginBottom: 5 }}>START FROM A TEMPLATE</Small>
          <Row style={{ flexWrap: 'wrap', gap: 6 }}>
            {(wd.templates || []).map((tp) => (
              <View key={tp.id} style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: t.accent + '14', borderRadius: 999, borderWidth: 1, borderColor: t.accent + '40' }}>
                <Pressable onPress={() => setEntrySheet((d) => withDrafts(applyTemplate(d, tp)))} accessibilityRole="button" accessibilityLabel={`Use template ${tp.name}`} style={{ paddingHorizontal: 12, paddingVertical: 6 }}>
                  <Text style={{ color: t.accent, fontWeight: '700', fontSize: t.fs(12.5) }} numberOfLines={1}>📋 {tp.name}</Text>
                </Pressable>
                <Pressable onPress={() => setTools((w) => ({ ...w, templates: (w.templates || []).filter((x) => x.id !== tp.id) }))} hitSlop={6} accessibilityLabel={`Delete template ${tp.name}`} style={{ paddingRight: 10 }}>
                  <Text style={{ color: t.textDim, fontSize: t.fs(12) }}>✕</Text>
                </Pressable>
              </View>
            ))}
          </Row>
        </View>
      ) : null,
      saveTemplate: String(entrySheet.title || '').trim() ? (
        <Pressable onPress={() => { setTools((w) => ({ ...w, templates: saveTemplate(w.templates || [], templateFrom(entrySheet)) })); Alert.alert('Template saved', `"${String(entrySheet.title).trim()}" is now a template - start a new task from it in the New Entry form.`); }} hitSlop={6} style={{ alignSelf: 'flex-start', marginTop: -6, marginBottom: 12 }}>
          <Small style={{ color: t.accent, fontWeight: '700' }}>📋 Save as template</Small>
        </Pressable>
      ) : null,
      title: (
            <Field label="TASK DESCRIPTION" value={entrySheet.title} onChangeText={(v) => setEntrySheet({ ...entrySheet, title: v })} placeholder="e.g. Follow up on LC opening" />
      ),
      category: (
              <View style={{ flex: 1 }}><OptionPicker editChip label="CATEGORY" source={SOURCES.wdCategory} value={entrySheet.category} onChange={(v) => setEntrySheet({ ...entrySheet, category: v })} placeholder="Select category" /></View>
      ),
      priority: (
              <View style={{ flex: 1 }}><OptionPicker editChip label="PRIORITY" source={SOURCES.wdPriority} value={entrySheet.priority} onChange={(v) => setEntrySheet({ ...entrySheet, priority: v })} /></View>
      ),
      status: (
              <View style={{ flex: 1 }}><OptionPicker editChip label="STATUS" source={SOURCES.wdStatus} value={entrySheet.status} onChange={(v) => setEntrySheet({ ...entrySheet, status: v })} /></View>
      ),
      pendingWith: (
              <View style={{ flex: 1 }}><OptionPicker editChip label="PENDING WITH" source={SOURCES.wdAssignee} value={entrySheet.pendingWith} onChange={(v) => setEntrySheet({ ...entrySheet, pendingWith: v })} placeholder="Select person" /></View>
      ),
      mail: (
              <View style={{ flex: 1 }}>
                <Small style={{ marginBottom: 5 }}>MAIL CHAIN / REFERENCE</Small>
                <Row gap={6} style={{ alignItems: 'flex-start' }}>
                  <View style={{ flex: 1 }}><Field style={{ marginBottom: 0 }} value={entrySheet.reference} onChangeText={(v) => setEntrySheet({ ...entrySheet, reference: v })} placeholder="e.g. Ticket #1234" /></View>
                  <Pressable
                    accessibilityLabel="Copy mail chain"
                    disabled={!entrySheet.reference}
                    onPress={async () => { await Clipboard.setStringAsync(entrySheet.reference); Alert.alert('Copied', 'Mail chain copied.'); }}
                    style={{ width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: t.accent + '1F', opacity: entrySheet.reference ? 1 : 0.4 }}
                  ><Text style={{ color: t.accent, fontSize: t.fs(16) }}>⧉</Text></Pressable>
                </Row>
              </View>
      ),
      recurrence: (
              <View style={{ flex: 1 }}>
                <Small style={{ marginBottom: 5 }}>RECURRENCE</Small>
                <PickerButton text={recurrenceLabel(entrySheet)} onPress={() => setRecurrenceOpen(true)} />
              </View>
      ),
      payment: (
            <>
            {/* The web app's payment sections: Import details, Sub Category, Tally Narration - each only when it applies. */}
            {/* "Both" (phone-width screens): the narration type used last time for this category starts picked. */}
            <PaymentFields draft={entrySheet} setDraft={setEntrySheet} lists={plists} rememberedType={phoneLayout ? (wd.narrationByCategory || {})[entrySheet.category] || '' : ''} />
            {followUpHere && isBankFollowUpCategory(entrySheet.category) && entries.some((x) => x.id === entrySheet.id) && (
              <BankFollowUpForm quickRemarks={wd.followUpRemarks} onQuickRemarks={(list) => updateWd((w) => ({ ...w, followUpRemarks: list }))} entry={entrySheet} draft={{ ...lastWho(entrySheet), ...(entrySheet.followUpDraft || {}), next: entrySheet.followUpDraft?.next || defaultNextFollowUp(entrySheet, new Date(), offDays) }}
                onChange={(patch) => setEntrySheet((d) => ({ ...d, followUpDraft: { ...(d.followUpDraft || {}), ...patch } }))} />
            )}
            </>
      ),
      custom: (
            <>
            {entrySheet.recurrence === 'custom' && (
              <View style={{ marginBottom: 12 }}>
                <Small style={{ marginBottom: 6 }}>REPEAT EVERY (MINUTES)</Small>
                <Row style={{ flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
                  {RECURRENCE_PRESETS.map((m) => {
                    const on = Number(entrySheet.recurrenceEveryMin) === m;
                    return (
                      <Pressable key={m} onPress={() => setEntrySheet({ ...entrySheet, recurrenceEveryMin: m })} style={{ paddingHorizontal: 13, paddingVertical: 8, borderRadius: 999, backgroundColor: on ? t.accent : t.surfaceAlt, borderWidth: 1, borderColor: on ? t.accent : t.border }}>
                        <Text style={{ color: on ? '#fff' : t.text, fontSize: t.fs(13) }}>{m >= 60 && m % 60 === 0 ? `${m / 60} h` : `${m} min`}</Text>
                      </Pressable>
                    );
                  })}
                </Row>
                <Field keyboardType="number-pad" value={entrySheet.recurrenceEveryMin ? String(entrySheet.recurrenceEveryMin) : ''} onChangeText={(v) => setEntrySheet({ ...entrySheet, recurrenceEveryMin: Math.min(1440, Number(v.replace(/[^0-9]/g, '')) || 0) })} placeholder="Or type your own, e.g. 20" />
              </View>
            )}
            </>
      ),
      due: (
            <>
            <DateTimeField labelColor={t.accent} label="DUE DATE & TIME" clearable value={entrySheet.dueAt} onChange={(v) => setEntrySheet({ ...entrySheet, dueAt: v })} />
            {/* "Both" (phone-width screens): one tap for the usual due times instead of the two pickers. */}
            {phoneLayout && (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: -4, marginBottom: 12 }}>
                {quickDueOptions(new Date(), holidayList, leaveList).map(([label, iso]) => {
                  const on = entrySheet.dueAt && Math.abs(new Date(entrySheet.dueAt) - new Date(iso)) < 60000;
                  return (
                    <Pressable key={label} onPress={() => setEntrySheet({ ...entrySheet, dueAt: iso })} accessibilityRole="button" accessibilityLabel={`Due ${label}`}
                      style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: on ? t.accent : t.accent + '14', borderWidth: 1, borderColor: t.accent + '40' }}>
                      <Text style={{ color: on ? '#fff' : t.accent, fontSize: t.fs(12.5), fontWeight: '700' }}>{label}</Text>
                    </Pressable>
                  );
                })}
              </View>
            )}
            </>
      ),
      slot: (
            <>
            {!!entrySheet.dueAt && wd.timeSlotHoldMin > 0 && (() => {
              // Same message as the web app: whether this time is free, and the window it holds.
              const taken = nextFreeSlot(entrySheet.dueAt, entries, wd.timeSlotHoldMin, entrySheet.id);
              const start = new Date(entrySheet.dueAt);
              const hm = (d) => d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
              const tone = taken ? t.warn : t.ok;
              return (
                <View style={{ marginTop: -4, marginBottom: 12, padding: 12, borderRadius: 14, backgroundColor: tone + '1A', borderWidth: 1, borderColor: tone + '55' }}>
                  <Text style={{ color: tone, fontWeight: '600', fontSize: t.fs(13.5) }}>
                    {taken
                      ? `Slot taken - another entry holds this time. Next free: ${fmtDateTime(taken)}.`
                      : `Slot free - this entry holds ${hm(start)} to ${hm(new Date(start.getTime() + wd.timeSlotHoldMin * 60000))}.`}
                  </Text>
                </View>
              );
            })()}
            </>
      ),
      deadline: (
            <DateTimeField label="DEADLINE (optional)" clearable value={entrySheet.deadlineAt} onChange={(v) => setEntrySheet({ ...entrySheet, deadlineAt: v })} />
      ),
      alert: (
            <>
            {/* This task's own alert: a ringing alarm for urgent work, a plain notification for the rest. */}
            <Small style={{ marginBottom: 6 }}>ALERT</Small>
            <Segmented options={ALERT_MODES.map((m) => ({ key: m.key, label: m.label }))} value={alertModeOf(entrySheet, wd.alerts)}
              onChange={(v) => setEntrySheet({ ...entrySheet, alertMode: v })} style={{ marginBottom: 4 }} />
            <Small style={{ marginBottom: 12 }}>{(ALERT_MODES.find((m) => m.key === alertModeOf(entrySheet, wd.alerts)) || ALERT_MODES[0]).hint}.</Small>
            </>
      ),
      checklist: (
        <View style={{ marginBottom: 12 }}>
          <Small style={{ marginBottom: 5 }}>CHECKLIST (optional){checklistText(entrySheet) ? ` · ${checklistText(entrySheet)} done` : ''}</Small>
          {(entrySheet.checklist || []).map((c) => (
            <Row key={c.id} gap={8} style={{ alignItems: 'center', marginBottom: 6 }}>
              <Pressable onPress={() => setEntrySheet((d) => ({ ...d, checklist: toggleStep(d.checklist, c.id) }))} accessibilityRole="checkbox" accessibilityState={{ checked: !!c.done }} accessibilityLabel={c.text}
                style={{ width: 24, height: 24, borderRadius: 7, alignItems: 'center', justifyContent: 'center', backgroundColor: c.done ? t.ok : 'transparent', borderWidth: c.done ? 0 : 1.5, borderColor: t.textDim }}>
                {!!c.done && <Text style={{ color: '#fff', fontWeight: '900' }}>✓</Text>}
              </Pressable>
              <Text style={{ flex: 1, color: c.done ? t.textDim : t.text, textDecorationLine: c.done ? 'line-through' : 'none', fontSize: t.fs(14.5) }}>{c.text}</Text>
              <Pressable onPress={() => setEntrySheet((d) => ({ ...d, checklist: removeStep(d.checklist, c.id) }))} hitSlop={8} accessibilityLabel="Remove step"><Text style={{ color: t.textDim, fontSize: t.fs(16) }}>✕</Text></Pressable>
            </Row>
          ))}
          <Row gap={8}>
            <View style={{ flex: 1 }}><Field style={{ marginBottom: 0 }} value={stepDraft} onChangeText={setStepDraft} placeholder="Add a step..." onSubmitEditing={() => { setEntrySheet((d) => ({ ...d, checklist: addStep(d.checklist, stepDraft) })); setStepDraft(''); }} /></View>
            <Btn kind="soft" title="Add" onPress={() => { setEntrySheet((d) => ({ ...d, checklist: addStep(d.checklist, stepDraft) })); setStepDraft(''); }} />
          </Row>
        </View>
      ),
      attachments: (
        <View style={{ marginBottom: 12 }}>
          <Small style={{ marginBottom: 5 }}>ATTACHMENTS (links to the invoice, bank advice, Drive file...)</Small>
          {(entrySheet.attachments || []).map((a) => (
            <Row key={a.id} gap={8} style={{ alignItems: 'center', marginBottom: 6 }}>
              <Pressable onPress={() => Linking.openURL(a.url)} accessibilityRole="link" style={{ flex: 1 }}>
                <Text numberOfLines={1} style={{ color: t.accent, fontWeight: '700', fontSize: t.fs(14) }}>📎 {a.title}</Text>
                <Small numberOfLines={1}>{a.url}</Small>
              </Pressable>
              <Pressable onPress={() => setEntrySheet((d) => ({ ...d, attachments: (d.attachments || []).filter((x) => x.id !== a.id) }))} hitSlop={8} accessibilityLabel="Remove attachment"><Text style={{ color: t.textDim, fontSize: t.fs(16) }}>✕</Text></Pressable>
            </Row>
          ))}
          <Row gap={8} style={{ alignItems: 'flex-end' }}>
            <View style={{ flex: 1 }}><Field style={{ marginBottom: 0 }} value={attDraft.title} onChangeText={(v) => setAttDraft((d) => ({ ...d, title: v }))} placeholder="Name" /></View>
            <View style={{ flex: 2 }}><Field style={{ marginBottom: 0 }} value={attDraft.url} onChangeText={(v) => setAttDraft((d) => ({ ...d, url: v }))} placeholder="https://..." autoCapitalize="none" /></View>
            <Btn kind="soft" title="Add" onPress={() => {
              const url = normalizeLink(attDraft.url);
              if (!url) return Alert.alert('Enter a link', 'Paste the web address of the file, such as a Drive or SharePoint link.');
              setEntrySheet((d) => ({ ...d, attachments: [...(d.attachments || []), { id: `att-${Date.now().toString(36)}`, title: attDraft.title.trim() || url.replace(/^https?:\/\/(www\.)?/i, '').replace(/\/.*$/, ''), url }] }));
              setAttDraft({ title: '', url: '' });
            }} />
          </Row>
        </View>
      ),
      history: !isNew && (entrySheet.audit || []).length ? (
        <View style={{ marginBottom: 12 }}>
          <Pressable onPress={() => setShowAudit((v) => !v)} hitSlop={6}>
            <Small style={{ fontWeight: '700' }}>HISTORY ({(entrySheet.audit || []).length}) {showAudit ? '▴' : '▾'}</Small>
          </Pressable>
          {showAudit && (entrySheet.audit || []).slice(0, 15).map((a, i) => (
            <Row key={`${a.at}-${i}`} gap={8} style={{ paddingVertical: 4 }}>
              <Small style={{ width: 96 }}>{new Date(a.at).toLocaleString([], { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</Small>
              <Small style={{ width: 44, fontWeight: '700' }}>{a.by === 'web' ? '🌐 web' : '📱 phone'}</Small>
              <Text style={{ flex: 1, color: t.text, fontSize: t.fs(12.5) }}>{a.what}</Text>
            </Row>
          ))}
        </View>
      ) : null,
      notes: (
            <Field label="NOTES" multiline value={entrySheet.notes} onChangeText={(v) => setEntrySheet({ ...entrySheet, notes: v })} placeholder="Additional notes or context..." />
      ),
      keyPoints: (
            <KeyPointsEditor points={entrySheet.keyPoints} onChange={(kp) => setEntrySheet((d) => ({ ...d, keyPoints: kp }))} />
      ),
      dar: (
            <Pressable
              onPress={() => setEntrySheet({ ...entrySheet, dar: entrySheet.dar === false })}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: entrySheet.dar !== false }}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 14, marginBottom: 14, backgroundColor: t.ok + '1A', borderWidth: 1, borderColor: t.ok + '55' }}
            >
              <View style={{ width: 26, height: 26, borderRadius: 6, alignItems: 'center', justifyContent: 'center', backgroundColor: entrySheet.dar !== false ? t.ok : 'transparent', borderWidth: entrySheet.dar !== false ? 0 : 2, borderColor: t.ok }}>
                {entrySheet.dar !== false && <Text style={{ color: '#fff', fontWeight: '900' }}>✓</Text>}
              </View>
              <Text style={{ flex: 1, color: t.text, fontSize: t.fs(14) }}>
                <Text style={{ fontWeight: '800' }}>Include in Daily Activity Report</Text> ("Done + DAR") - untick for "Done" only (completed, but left out of the report)
              </Text>
            </Pressable>
      ),
    };
    const isSaved = entries.some((x) => x.id === entrySheet.id);
    const binBtn = isSaved && <Btn kind="danger" title="Bin" onPress={() => { act(entries.find((x) => x.id === entrySheet.id) || entrySheet, 'bin'); closeEntrySheet(); }} />;
    if (!deskForm) {
      // Phone (the APK, and the website below 900px): numbered sections, one column - "Option A".
      const section = (n, title, children) => (
        <View style={{ backgroundColor: t.surface, borderRadius: 16, borderWidth: 1, borderColor: t.border, padding: 14, paddingBottom: 2, marginBottom: 12 }}>
          <Row gap={10} style={{ alignItems: 'center', marginBottom: 12 }}>
            <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: t.accent, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: '#fff', fontWeight: '800', fontSize: t.fs(12) }}>{n}</Text></View>
            <Text style={{ color: t.text, fontWeight: '800', fontSize: t.fs(15) }}>{title}</Text>
          </Row>
          {children}
        </View>
      );
      // Mail chain, notes and key points fold away until wanted - open at once when the entry already has any.
      const hasDetails = !!(String(entrySheet.reference || '').trim() || String(entrySheet.notes || '').trim() || (entrySheet.keyPoints || []).length);
      const showMore = entryMore || hasDetails;
      return (
        <View>
          {section(1, 'Task', (
            <>
              {f.templates}
              {f.title}
              {f.saveTemplate}
              <Row gap={10}>{f.category}{f.priority}</Row>
            </>
          ))}
          {section(2, 'When', (
            <>
              {f.due}
              {f.slot}
              {f.alert}
              {f.deadline}
              <Row>{f.recurrence}</Row>
              {f.custom}
            </>
          ))}
          {section(3, 'Status', <Row gap={10}>{f.status}{f.pendingWith}</Row>)}
          {f.payment}
          {showMore ? (
            <View style={{ marginBottom: 4 }}>
              {f.mail}
              <View style={{ height: 12 }} />
              {f.checklist}
              {f.attachments}
              {f.notes}
              {f.keyPoints}
              {f.history}
            </View>
          ) : (
            <Pressable onPress={() => setEntryMore(true)} accessibilityRole="button"
              style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 14, borderRadius: 12, borderWidth: 1, borderStyle: 'dashed', borderColor: t.border, backgroundColor: t.surfaceAlt, marginBottom: 12 }}>
              <Text style={{ color: t.accent, fontWeight: '700', fontSize: t.fs(14) }}>＋ Mail chain, notes, key points</Text>
              <Text style={{ color: t.accent, fontWeight: '800' }}>⌄</Text>
            </Pressable>
          )}
          {f.dar}
          {!pinSave && entryButtons}
          {!!binBtn && <View style={{ marginTop: 8 }}>{binBtn}</View>}
        </View>
      );
    }
    // Desktop website (900px+): the form on the left, a live preview of the card on the right - "Option C".
    const cell = (span, node, key) => <View key={key} style={{ width: `${(span * 100) / 3}%`, paddingHorizontal: 6, flexDirection: 'row' }}>{node}</View>;
    const gridRow = (...cells) => <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -6 }}>{cells}</View>;
    const block = (node) => <View style={{ flex: 1 }}>{node}</View>;
    const pc = t[PRIORITY_COLOR[entrySheet.priority]] || t.textDim;
    const chip = (text, color, key) => (
      <View key={key} style={{ paddingHorizontal: 9, paddingVertical: 3, borderRadius: 999, backgroundColor: color + '1A', borderWidth: 1, borderColor: color + '40', marginRight: 6, marginBottom: 6 }}>
        <Text style={{ color, fontSize: t.fs(12), fontWeight: '600' }}>{text}</Text>
      </View>
    );
    return (
      <Row gap={18} style={{ alignItems: 'flex-start' }}>
        <View style={{ flex: 1.6, backgroundColor: t.surface, borderRadius: 16, borderWidth: 1, borderColor: t.border, padding: 16 }}>
          {f.templates}
          {f.title}
          {f.saveTemplate}
          {gridRow(cell(1, f.category, 'c'), cell(1, f.priority, 'p'), cell(1, f.status, 's'))}
          {gridRow(cell(1, f.pendingWith, 'w'), cell(1, block(<>{f.due}{f.slot}</>), 'd'), cell(1, block(f.deadline), 'l'))}
          {gridRow(cell(1, f.recurrence, 'r'), cell(2, f.mail, 'm'))}
          {f.custom}
          {f.payment}
          {f.checklist}
          {f.attachments}
          {f.notes}
          {f.keyPoints}
          {f.history}
        </View>
        <View style={{ flex: 1 }}>
          <Small style={{ marginBottom: 6, fontWeight: '700' }}>HOW IT WILL LOOK</Small>
          <View style={{ backgroundColor: t.surface, borderRadius: 16, borderWidth: 1, borderColor: t.border, borderLeftWidth: 5, borderLeftColor: pc, padding: 14, marginBottom: 16 }}>
            <Text style={{ color: entrySheet.title ? t.text : t.textDim, fontWeight: '800', fontSize: t.fs(16), marginBottom: 8 }} numberOfLines={3}>{entrySheet.title || 'Task description'}</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
              {!!entrySheet.priority && chip(entrySheet.priority, pc, 'p')}
              {!!entrySheet.category && chip(entrySheet.category, t.accent, 'c')}
              {!!entrySheet.status && chip(entrySheet.status, t.textDim, 's')}
              {!!entrySheet.pendingWith && chip(entrySheet.pendingWith, t.warn, 'w')}
              {entrySheet.recurrence && entrySheet.recurrence !== 'none' && chip(`↻ ${recurrenceLabel(entrySheet)}`, t.purple, 'r')}
            </View>
            <Text style={{ color: entrySheet.dueAt ? t.text : t.textDim, fontWeight: '800', fontSize: t.fs(14), marginTop: 4 }}>{entrySheet.dueAt ? `⏰ ${fmtDue(entrySheet.dueAt)}` : 'No due date yet'}</Text>
          </View>
          {f.alert}
          {f.dar}
          <Btn title="Save Entry" onPress={saveEntry} />
          <Btn style={{ marginTop: 8 }} kind="soft" title="Cancel" onPress={closeEntrySheet} />
          {!!binBtn && <View style={{ marginTop: 8 }}>{binBtn}</View>}
        </View>
      </Row>
    );
  };

  /*
   * What each Config section holds. Shown in its own sheet from the Config list (tablets and desktop browsers), or
   * open on the Config page itself on a phone-width screen ("Both": the APK and the website on a phone).
   */
  const configBodies = {
    lists: (
      <>
      <P dim>Manage the options offered for Category, Priority, Status and Pending With. Search a new name and tap it to add; open an existing one to remove it.</P>
      <OptionPicker label="Category" source={SOURCES.wdCategory} value={newListDraft.category} onChange={(v) => setNewListDraft((d) => ({ ...d, category: v }))} />
      <OptionPicker label="Priority" source={SOURCES.wdPriority} value={newListDraft.priority} onChange={(v) => setNewListDraft((d) => ({ ...d, priority: v }))} />
      <OptionPicker label="Status" source={SOURCES.wdStatus} value={newListDraft.status} onChange={(v) => setNewListDraft((d) => ({ ...d, status: v }))} />
      <OptionPicker label="Pending with" source={SOURCES.wdAssignee} value={newListDraft.pendingWith} onChange={(v) => setNewListDraft((d) => ({ ...d, pendingWith: v }))} />
      </>
    ),
    fixed: (
      <>
      <P dim>Standing tasks you do every working day. Described once, included in every daily report automatically. Uncheck to pause one without losing it.</P>
      <Row gap={8}>
        <Field style={{ flex: 1 }} value={actDraft} onChangeText={setActDraft} placeholder="e.g. Daily NOSTRO account reconciliation" />
        <Btn title="Add" onPress={addFixedActivity} style={{ paddingHorizontal: 16 }} />
      </Row>
      {!(wd.fixedActivities || []).length && <P dim>No fixed activities yet.</P>}
      {(wd.fixedActivities || []).map((a) => (
        <Row key={a.id} style={{ justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: t.border }}>
          <Pressable onPress={() => toggleFixedActivity(a.id)} style={{ flex: 1 }}>
            <Text style={{ color: a.active ? t.text : t.textDim, textDecorationLine: a.active ? 'none' : 'line-through' }}>{a.text}</Text>
          </Pressable>
          <Pressable onPress={() => removeFixedActivity(a.id)} hitSlop={8}><Text style={{ color: t.danger }}>✕</Text></Pressable>
        </Row>
      ))}
      </>
    ),
    leave: (
      <>
      <P dim>Mark a day where there's genuinely nothing to do. Leave days count as non-working, and never show up in the activity report.</P>
      <Btn title="Mark Today as Leave" onPress={markTodayLeave} />
      {!leaveList.length && <P dim style={{ marginTop: 10 }}>No leave days marked.</P>}
      {[...leaveList].reverse().map((d) => (
        <Row key={d} style={{ justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: t.border }}>
          <Text style={{ color: t.text }}>{fmtDate(d)}</Text>
          <Pressable onPress={() => removeLeaveDay(d)} hitSlop={8}><Text style={{ color: t.danger }}>✕</Text></Pressable>
        </Row>
      ))}
      </>
    ),
    log: (
      <>
      <P dim>Fills itself in automatically - every entry you log, edit, complete, bin or restore is recorded here. Use the box below only for something worth reporting that never became an entry at all.</P>
      <Field value={logDraft.title} onChangeText={(v) => setLogDraft({ ...logDraft, title: v })} placeholder="Something NOT already an entry (e.g. Team standup)" />
      <Field value={logDraft.details} onChangeText={(v) => setLogDraft({ ...logDraft, details: v })} placeholder="Details (optional)" />
      <Btn title="Log this activity" onPress={addLogEntry} />
      {(wd.activityLog || []).slice(0, 100).map((l) => (
        <View key={l.id} style={{ paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: t.border }}>
          <Text style={{ color: t.text, fontWeight: '600' }}>{l.title}{l.auto ? '' : ' (manual)'}</Text>
          {!!l.details && <Small>{l.details}</Small>}
          <Small>{fmtDateTime(l.at)}</Small>
        </View>
      ))}
      </>
    ),
    alarm: (
      <>
      <WdAlertSettings alerts={wd.alerts} priorities={wd.priorities || []} onChange={(v) => updateWd((w) => ({ ...w, alerts: v }))} />
      <Text style={{ color: t.text, fontWeight: '700', marginTop: 16, marginBottom: 4 }}>Alarm sound</Text>
      <P dim>Plays for every Working Dashboard alert. Tap a name to use it.</P>
      <RingtonePicker value={wd.alarmRingtone} onChange={(v) => updateWd((w) => ({ ...w, alarmRingtone: v }))} />
      <Btn title={testingAlarm ? 'Playing...' : 'Test Alarm'} kind="soft" disabled={testingAlarm} onPress={testAlarm} style={{ marginTop: 10 }} />
      </>
    ),
    slots: (
      <>
      <P dim>Keeps two entries off the same time. A scheduled entry holds the clock for the minutes below; anything booked inside that window is pushed to the next free time.</P>
      <Field label="Hold for (min)" keyboardType="numeric" value={String(wd.timeSlotHoldMin)} onChangeText={(v) => updateWd((w) => ({ ...w, timeSlotHoldMin: Number(v) || 0 }))} />
      </>
    ),
    backup: (
      <>
      <H2>CSV</H2>
      <Row gap={10}>
        <Btn style={{ flex: 1 }} title={csvBusy ? 'Working...' : 'Export CSV'} disabled={csvBusy} onPress={exportCsv} />
        <Btn style={{ flex: 1 }} kind="soft" title={csvBusy ? 'Working...' : 'Import CSV'} disabled={csvBusy} onPress={importCsv} />
      </Row>
      <H2 style={{ marginTop: 16 }}>Duplicates</H2>
      {!duplicateGroups.length ? <P dim>No likely duplicates found.</P> : duplicateGroups.map((group, i) => (
        <Card key={i} style={{ marginBottom: 10 }}>
          <Text style={{ color: t.text, fontWeight: '700' }} numberOfLines={1}>{group[0].title}</Text>
          <Small>{group.length} entries look the same ({group[0].category || 'Uncategorised'})</Small>
          {group.slice(1).map((dup) => (
            <Row key={dup.id} style={{ justifyContent: 'space-between', marginTop: 6 }}>
              <Small>{fmtDate(dup.createdAt)}</Small>
              <Pressable onPress={() => deleteForever(dup)}><Small style={{ color: t.danger }}>Delete this one</Small></Pressable>
            </Row>
          ))}
        </Card>
      ))}
      </>
    ),
    realtime: (
      <>
      <P dim>Signs into the same Firebase project your web app uses, so entries, lists and holidays appear on every signed-in device within a second - the Apps Script Cloud Sync below stays on as a backup copy either way.</P>
      {!googleUser ? (
        <Btn title={realtimeBusy ? 'Signing in...' : 'Sign in with Google'} disabled={realtimeBusy} onPress={doGoogleSignIn} />
      ) : (
        <>
          <Card>
            <Text style={{ color: t.text, fontWeight: '700' }}>{googleUser.email}</Text>
            <Small style={{ marginTop: 2, color: t.ok }}>🟢 Live</Small>
          </Card>
          <Btn style={{ marginTop: 10 }} kind="danger" title={realtimeBusy ? 'Working...' : 'Sign out'} disabled={realtimeBusy} onPress={doGoogleSignOut} />
        </>
      )}
      {!!realtimeError && <Small style={{ color: t.danger, marginTop: 10 }}>{realtimeError}</Small>}
      </>
    ),
    cloudSync: (
      <>
      <P dim>Not needed: your tasks sync through your Google sign-in, Fetch Mail reads your Gmail directly and the AI report is built in. Only if you already run an Apps Script of your own (for a Google Sheet copy, or your own AI) paste its web app URL here (Deploy &gt; Manage deployments) - then Fetch Mail and the AI use it instead. Never use someone else's script.</P>
      <Field label="Script URL" value={urlDraft} onChangeText={(v) => { setUrlDraft(v); setTestResult(null); }} placeholder="https://script.google.com/macros/s/.../exec" autoCapitalize="none" autoCorrect={false} />
      <Row gap={10}>
        <Btn style={{ flex: 1 }} kind="soft" title={testing ? 'Testing...' : 'Test connection'} disabled={testing || !isValidScriptUrl(urlDraft.trim())} onPress={runTestConnection} />
        <Btn style={{ flex: 1 }} title={pulling ? 'Loading...' : 'Save'} onPress={saveCloudUrl} disabled={!urlDraft.trim() || pulling} />
      </Row>
      {!!wd.cloudSyncUrl && <Btn style={{ marginTop: 10 }} kind="soft" title={pulling ? 'Loading...' : 'Sync now (load from sheet)'} disabled={pulling} onPress={() => pullFromSheet(wd.cloudSyncUrl)} />}
      {!!testResult && (
        <Card style={{ marginTop: 12, borderLeftWidth: 4, borderLeftColor: testResult.ok ? t.ok : t.danger }}>
          <Text style={{ color: t.text }}>{testResult.message}</Text>
        </Card>
      )}
      {!!wd.cloudSyncUrl && !testResult && <Small style={{ marginTop: 10 }}>Connected.</Small>}
      {!!pullInfo && (
        <Card style={{ marginTop: 12 }}>
          <Small style={{ fontWeight: '700' }}>What the script sent (for checking)</Small>
          <Text selectable style={{ color: t.text, fontSize: t.fs(11), marginTop: 6 }}>
            {`action: ${pullInfo.action}\ncolumns: ${(pullInfo.columns || []).join(', ')}\nstatuses: ${JSON.stringify(pullInfo.statuses)}\nfirst rows: ${JSON.stringify(pullInfo.sample)}`}
          </Text>
        </Card>
      )}
      </>
    ),
    reportSamples: (
      <>
      <P dim>Paste daily reports you wrote yourself - the more the better (5-10 covering different kinds of work). The app learns how you word each type of task, and every AI report copies that wording. Facts always come from your entries and are checked line by line.</P>
      <Field multiline value={sampleDraft} onChangeText={setSampleDraft} placeholder="Paste a past report here..." />
      <Btn title={samplesBusy ? 'Working...' : 'Save sample'} disabled={samplesBusy || !sampleDraft.trim()} onPress={addSample} />
      {!!wd.cloudSyncUrl && <Btn style={{ marginTop: 8 }} kind="soft" title="Refresh" onPress={() => loadSamples()} disabled={samplesBusy} />}
      {(() => {
        const texts = [...(wd.reportSamplesLocal || []), ...samples.map((x) => x.sampleText)].filter((x, i, arr) => arr.indexOf(x) === i);
        const st = learnStyle(texts);
        return (
          <>
            {!!st.samples && (
              <Card style={{ marginTop: 12 }}>
                <Text style={{ color: t.text, fontWeight: '800', fontSize: t.fs(15) }}>What the app learned</Text>
                <Small style={{ marginTop: 4 }}>{st.samples} report{st.samples === 1 ? '' : 's'} · {st.lines.length} example lines · about {st.avgWords} words per line</Small>
                {!!st.headings.length && <Small style={{ marginTop: 4 }}>Sections: {st.headings.slice(0, 6).join(' · ')}</Small>}
                {!!st.openers.length && <Small style={{ marginTop: 4 }}>You often start with: {st.openers.slice(0, 6).map((o) => `"${o}…"`).join(', ')}</Small>}
              </Card>
            )}
            {texts.map((txt, i) => {
              const cloud = samples.find((x) => x.sampleText === txt);
              return (
                <Card key={`${i}-${txt.length}`} style={{ marginTop: 10 }}>
                  <Text style={{ color: t.text }} numberOfLines={4}>{txt}</Text>
                  <Pressable
                    onPress={() => (cloud ? removeSample(cloud.id) : updateWd((w) => ({ ...w, reportSamplesLocal: (w.reportSamplesLocal || []).filter((x) => x !== txt) })))}
                    style={{ marginTop: 8 }}
                  ><Small style={{ color: t.danger }}>Delete</Small></Pressable>
                </Card>
              );
            })}
            {!texts.length && !samplesBusy && <P dim style={{ marginTop: 10 }}>No samples saved yet - the AI uses a plain, factual default style.</P>}
          </>
        );
      })()}
      </>
    ),
    paymentIntro: (
      <>
      <P dim>Two fixed lines shown at the top of the Payments section in every report, above the individual payment lines.</P>
      <Field label="Line 1" multiline value={introDraft[0] || ''} onChangeText={(v) => setIntroDraft([v, introDraft[1] || ''])} />
      <Field label="Line 2" multiline value={introDraft[1] || ''} onChangeText={(v) => setIntroDraft([introDraft[0] || '', v])} />
      <Row gap={10}>
        <Btn style={{ flex: 1 }} title="Save" onPress={() => savePaymentIntro(introDraft)} />
        <Btn style={{ flex: 1 }} kind="soft" title="Reset to default" onPress={() => savePaymentIntro(DEFAULT_PAYMENT_INTRO)} />
      </Row>
      </>
    ),
    paymentRules: (
      <>
      <P dim>Set up on the web app (Config) and received with Realtime Sync. The entry form asks for a Sub Category when one of these categories is completed, and builds the Tally narration from these types.</P>
      <Small style={{ marginTop: 10, marginBottom: 6, fontWeight: '700' }}>CATEGORIES WITH A SUB CATEGORY</Small>
      <P>{plists.subCategoryCategories.length ? plists.subCategoryCategories.join(', ') : 'None'}</P>
      <Small style={{ marginTop: 12, marginBottom: 6, fontWeight: '700' }}>SUB CATEGORIES</Small>
      {!plists.subCategories.length && <P dim>None yet.</P>}
      {plists.subCategories.map((sc) => (
        <Card key={sc.id || sc.name} style={{ marginBottom: 8 }}>
          <Text style={{ color: t.text, fontWeight: '700' }}>{sc.name}</Text>
          <Small>{sc.fields.map((f) => f.label).join(', ') || 'No extra fields'}</Small>
        </Card>
      ))}
      <Small style={{ marginTop: 12, marginBottom: 6, fontWeight: '700' }}>NARRATION TYPES</Small>
      {plists.narrationTypes.map((nr) => (
        <Card key={nr.id || nr.name} style={{ marginBottom: 8 }}>
          <Text style={{ color: t.text, fontWeight: '700' }}>{nr.name}</Text>
          {nr.template ? <Small>{nr.template.replace('{%}', '[%]').replace(/\{([^{}%]+)\}/g, '[$1]')}</Small> : <Small>Being {nr.hasPercent ? '[%] ' : ''}{nr.phrase}[{nr.docLabel}]{nr.fields.length ? ` · Fields: ${nr.fields.map((f) => f.label).join(', ')}` : ''}</Small>}
        </Card>
      ))}
      </>
    ),
  };
  const reminderBody = (kind) => (
    <>
      <P dim>{kind === 'walk' ? 'Nudges you to leave the desk while you work.' : 'Nudges you to drink water through the day.'} Alerts at each slot in the window below.</P>
      <Row style={{ justifyContent: 'space-between', marginBottom: 12 }}>
        <P>Reminder</P>
        <Btn kind={wd.reminders[kind].enabled ? 'ok' : 'soft'} title={wd.reminders[kind].enabled ? 'On' : 'Off'} onPress={() => saveReminder(kind, { enabled: !wd.reminders[kind].enabled })} />
      </Row>
      <Field label="Start (HH:MM)" value={wd.reminders[kind].start} onChangeText={(v) => saveReminder(kind, { start: v })} placeholder="10:00" />
      <Field label="End (HH:MM)" value={wd.reminders[kind].end} onChangeText={(v) => saveReminder(kind, { end: v })} placeholder="19:30" />
      <Field label="Every (min)" keyboardType="numeric" value={String(wd.reminders[kind].everyMin)} onChangeText={(v) => saveReminder(kind, { everyMin: Number(v) || 60 })} />
    </>
  );
  const CONFIG_SHEETS = [['lists', 'Lists'], ['fixed', 'Fixed Daily Activities'], ['leave', 'Leave Days'], ['log', 'Activity Log'], ['alarm', 'Alerts & Alarm Sound'], ['slots', 'Time Slots'], ['backup', 'Data Backup'], ['realtime', 'Realtime Sync'], ['cloudSync', 'Cloud Sync'], ['reportSamples', 'Report Style Samples'], ['paymentIntro', 'Payment Intro Lines'], ['paymentRules', 'Sub Categories & Narration Types']];

  return (
    <View style={[{ flex: 1, paddingLeft: sideBar }, t.bgGradient ? { backgroundImage: t.bgGradient } : null]}>
    <Screen>
      {/* web.app: a window-style top bar - frosted, and it stays at the top while the page scrolls. */}
      <Row style={[{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
        Platform.OS === 'web' && t.frosted ? { position: 'sticky', top: 0, zIndex: 20, backgroundColor: t.bar, backdropFilter: 'blur(24px) saturate(180%)', WebkitBackdropFilter: 'blur(24px) saturate(180%)', marginHorizontal: wide ? -28 : tabletWidth ? -20 : -16, paddingHorizontal: wide ? 28 : tabletWidth ? 20 : 16, paddingVertical: 10, marginTop: wide ? -20 : -8, borderBottomWidth: 0.5, borderBottomColor: t.sideEdge } : null]}>
        {/* web.app only: the app's logo beside the title (the APK's header has none). */}
        {Platform.OS === 'web' && <View style={{ marginRight: 12 }}><AnimatedLogo size={44} /></View>}
        <View style={{ flex: 1 }}>
          {Platform.OS === 'web' ? (
            <>
              <Text numberOfLines={1} style={{ color: t.text, fontWeight: '800', fontSize: t.fs(wide ? 30 : 24), letterSpacing: -0.6 }}>{TAB_TITLES[tab]}</Text>
              <Small>{new Date().toLocaleString([], { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: 'numeric', minute: '2-digit' })}</Small>
            </>
          ) : (
            <>
              {/* APK: the same title and date as the website, sized for the phone. */}
              <Text numberOfLines={1} style={{ color: t.text, fontWeight: '800', fontSize: t.fs(t.frosted ? 26 : 22), letterSpacing: t.frosted ? -0.6 : 0 }}>{TAB_TITLES[tab]}</Text>
              <Small>{new Date().toLocaleString([], { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })}</Small>
            </>
          )}
        </View>
        {/* The Spotlight-style finder (Cmd/Ctrl + K on the website; the search button on the phone). */}
        {(
          <Pressable onPress={() => setPaletteOpen(true)} accessibilityRole="button" accessibilityLabel="Search"
            style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginRight: 10, backgroundColor: t.surfaceAlt, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 7, minWidth: wide ? 230 : 0 }}>
            <Text style={{ color: t.textDim, fontSize: t.fs(15) }}>⌕</Text>
            {wide && <Text style={{ flex: 1, color: t.textDim, fontSize: t.fs(13) }}>Search</Text>}
            {wide && <Text style={{ color: t.textDim, fontSize: t.fs(11.5), fontWeight: '600' }}>⌘K</Text>}
          </Pressable>
        )}
        <Pressable onPress={() => setMeetingOpen(true)} accessibilityRole="button" accessibilityLabel={meetingOn ? 'Meeting mode is on' : 'Meeting mode'}
          style={{ marginRight: 8, backgroundColor: meetingOn ? t.warn + '33' : t.surfaceAlt, borderRadius: 16, paddingHorizontal: 10, paddingVertical: 7 }}>
          <Text style={{ fontSize: t.fs(14) }}>{meetingOn ? '🔕' : '🔔'}</Text>
        </Pressable>
        <Pressable onPress={() => setTab('config')} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: t.surfaceAlt, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 7 }}>
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: waiting ? t.warn : googleUser && realtimeError ? t.danger : googleUser ? t.ok : wd.cloudSyncUrl ? t.warn : t.textDim }} />
          <Text style={{ color: t.textDim, fontWeight: '700', fontSize: t.fs(12) }}>{waiting ? 'offline · edits waiting' : googleUser && realtimeError ? 'sync error' : googleUser ? 'live' : wd.lastSheetPullAt ? `synced ${new Date(wd.lastSheetPullAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : wd.cloudSyncUrl ? 'sheet' : 'local'}</Text>
        </Pressable>
        {/* web.app only: the page has no top bar (it wasted a strip of the screen), so Settings sits here. */}
        {Platform.OS === 'web' && (
          <Pressable onPress={() => navigation.navigate('Settings')} hitSlop={10} accessibilityRole="button" accessibilityLabel="Settings" style={{ marginLeft: 12 }}>
            <Text style={{ color: t.accent, fontSize: t.fs(22) }}>⚙</Text>
          </Pressable>
        )}
      </Row>

      {wd.whatsNewSeen !== WHATS_NEW.id && tab === 'dashboard' && (
        <Card style={{ marginBottom: 12, borderWidth: 1, borderColor: t.accent + '55' }}>
          <Row style={{ alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <Text style={{ color: t.accent, fontWeight: '800', fontSize: t.fs(15) }}>🎉 {WHATS_NEW.title}</Text>
            <Pressable onPress={() => updateWd((w) => ({ ...w, whatsNewSeen: WHATS_NEW.id }))} hitSlop={10} accessibilityLabel="Dismiss what's new"><Text style={{ color: t.textDim, fontSize: t.fs(18) }}>✕</Text></Pressable>
          </Row>
          {WHATS_NEW.items.map(([icon, title, text]) => (
            <Row key={title} gap={10} style={{ alignItems: 'flex-start', paddingVertical: 4 }}>
              <Text style={{ fontSize: t.fs(16), width: 24 }}>{icon}</Text>
              <View style={{ flex: 1 }}><Text style={{ color: t.text, fontWeight: '700', fontSize: t.fs(13.5) }}>{title}</Text><Small>{text}</Small></View>
            </Row>
          ))}
          <Btn style={{ marginTop: 8 }} kind="soft" title="Got it" onPress={() => updateWd((w) => ({ ...w, whatsNewSeen: WHATS_NEW.id }))} />
        </Card>
      )}
      {meetingOn && (
        <Card style={{ marginBottom: 12, backgroundColor: blend(t.warn, 0.14, t.surface), borderWidth: 1, borderColor: blend(t.warn, 0.5, t.surface) }}>
          <Row style={{ alignItems: 'center', gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: t.text, fontWeight: '800' }}>🔕 Meeting mode until {new Date(holdUntil).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' })}</Text>
              <Small>Alerts are held and ring once when it ends.</Small>
            </View>
            <Btn kind="soft" title="End now" onPress={() => setHold(0)} />
          </Row>
        </Card>
      )}
      {!!alarmBlock && (
        <Card style={{ marginBottom: 12, backgroundColor: blend(t.danger, 0.1, t.surface), borderWidth: 1, borderColor: blend(t.danger, 0.45, t.surface) }}>
          <Text style={{ color: t.danger, fontWeight: '800', fontSize: t.fs(14.5) }}>⚠ Alarms cannot open full screen yet</Text>
          <Small style={{ marginTop: 3, marginBottom: 8 }}>
            {alarmBlock === 'overlay'
              ? 'Android shows task alerts only as a notification you must tap. Allow "Open over other apps" so an alert opens full screen on the lock screen and while you use the phone.'
              : 'Allow full-screen alarms so an alert opens over the lock screen instead of a notification.'}
          </Small>
          <Btn title={alarmBlock === 'overlay' ? 'Allow "Open over other apps"' : 'Allow full-screen alarms'} onPress={() => (alarmBlock === 'overlay' ? requestOverlayPermission() : requestFullScreenIntentPermission())} />
        </Card>
      )}

      {/* APK: no left / right swipe between tabs (the owner's choice) - the tab bar changes tab; the website keeps it. */}
      <SwipeTabs tabs={TAB_KEYS} value={tab} onChange={goTab} swipe={Platform.OS === 'web'}>
        <FadeInUp key={tab} distance={16} duration={340}>

        {tab === 'dashboard' && (
          <View>
            {/* web.app only: the greeting, the summary and the past-due alert on ONE line (the header above is the other). */}
            {Platform.OS === 'web' ? (
              <Row style={{ alignItems: 'center', gap: 12, marginBottom: 14, flexWrap: tabletWidth ? 'nowrap' : 'wrap' }}>
                <Text numberOfLines={tabletWidth ? 1 : undefined} style={{ flex: tabletWidth ? 1 : undefined, width: tabletWidth ? undefined : '100%', color: t.textDim, fontSize: t.fs(15) }}>
                  <Text style={{ color: t.text, fontWeight: '800', fontSize: t.fs(18) }}>
                    {new Date().getHours() < 12 ? 'Good morning' : new Date().getHours() < 17 ? 'Good afternoon' : 'Good evening'}
                  </Text>
                  {'   You have '}<Text style={{ color: t.accent, fontWeight: '800' }}>{stats.totalOpen}</Text>{' open entries — '}
                  <Text style={{ color: t.accent, fontWeight: '800' }}>{stats.overdue}</Text>{' past the deadline, '}
                  <Text style={{ color: t.accent, fontWeight: '800' }}>{stats.dueToday}</Text>{' due today, '}
                  <Text style={{ color: t.accent, fontWeight: '800' }}>{stats.next7Days}</Text>{' in the next 7 days.'}
                </Text>
                {stats.overdue > 0 && (
                  <Pressable onPress={() => navigation.navigate('PastDueAlert')} accessibilityLabel="Review the past due entries" style={{ backgroundColor: t.danger, borderRadius: 14, paddingVertical: 7, paddingHorizontal: 12 }}>
                    <Text numberOfLines={1} style={{ color: '#fff', fontWeight: '800' }}>🚨 {stats.overdue} past due — review them</Text>
                  </Pressable>
                )}
              </Row>
            ) : (
              <>
                <Text style={{ color: t.text, fontWeight: '800', fontSize: t.fs(22), marginBottom: 10 }}>
                  {new Date().getHours() < 12 ? 'Good morning' : new Date().getHours() < 17 ? 'Good afternoon' : 'Good evening'}
                </Text>
                <Small>Tap any card to open it in Tasks</Small>
                <Text style={{ color: t.textDim, fontSize: t.fs(15), lineHeight: 22, marginTop: 4, marginBottom: 14 }}>
                  {'You have '}<Text style={{ color: t.accent, fontWeight: '800' }}>{stats.totalOpen}</Text>{' open entries — '}
                  <Text style={{ color: t.accent, fontWeight: '800' }}>{stats.overdue}</Text>{' past the deadline, '}
                  <Text style={{ color: t.accent, fontWeight: '800' }}>{stats.dueToday}</Text>{' due today, '}
                  <Text style={{ color: t.accent, fontWeight: '800' }}>{stats.next7Days}</Text>{' in the next 7 days.'}
                </Text>
                {stats.overdue > 0 && (
                  <Pressable onPress={() => navigation.navigate('PastDueAlert')} style={{ backgroundColor: t.danger, borderRadius: 14, padding: 12, marginBottom: 12 }}>
                    <Text style={{ color: '#fff', fontWeight: '800' }}>🚨 {stats.overdue} past due — review them</Text>
                    <Text style={{ color: '#fff', opacity: 0.9, fontSize: t.fs(12.5) }}>Mark done, snooze, move or skip each one</Text>
                  </Pressable>
                )}
              </>
            )}
            {/* Quick add: type a sentence - "Pay ICICI invoice tomorrow 5pm high" - and the form opens filled in. */}
            <Card style={{ marginBottom: 12, paddingVertical: 10 }}>
              <Row gap={8} style={{ alignItems: 'center' }}>
                <View style={{ flex: 1 }}>
                  <Field style={{ marginBottom: 0 }} value={quickText} onChangeText={setQuickText} placeholder='➕ Quick add: "Pay vendor tomorrow 5pm high"' onSubmitEditing={() => quickAdd()} returnKeyType="done" />
                </View>
                {!!SpeechApi && <Btn kind={listening ? 'danger' : 'soft'} title={listening ? '● Listening' : '🎤'} onPress={listenOnce} />}
                <Btn title="Add" onPress={() => quickAdd()} disabled={!quickText.trim()} />
              </Row>
              {Platform.OS !== 'web' && !quickText && <Small style={{ marginTop: 6 }}>Tip: tap the 🎤 on your keyboard and say it - "Call the bank tomorrow 11am high".</Small>}
              {!!quickParsed && !!describeQuickAdd(quickParsed) && <Small style={{ marginTop: 6 }}>→ {describeQuickAdd(quickParsed)}</Small>}
            </Card>
            <Row style={{ flexWrap: 'wrap', gap: 10 }}>
              <StatTile index={0} label="Pending as on Today" value={stats.pendingAsOnToday} sub="Overdue + due today" color={t.danger} onPress={() => { setTab('register'); setFilter({ dueWithin: DUE_TILL_TODAY }); }} />
              <StatTile index={1} label="Due Today" value={stats.dueToday} sub="Still on the clock" color={t.accent} onPress={() => { setTab('register'); setFilter({ dueWithin: 'Today' }); }} />
              <StatTile index={2} label="Overdue" value={stats.overdue} sub="Past the due time" color={t.danger} onPress={() => { setTab('register'); setFilter({ dueWithin: 'Overdue' }); }} />
              <StatTile index={3} label="Next 7 Days" value={stats.next7Days} sub="Coming up" color={t.warn} onPress={() => { setTab('register'); setFilter({ dueWithin: 'Next 7 Days' }); }} />
              <StatTile index={4} label="This Month" value={stats.thisMonth} sub={`Due in ${new Date().toLocaleString([], { month: 'long' })}`} color={t.accent2} onPress={() => { setTab('register'); setFilter({ dueWithin: 'This Month' }); }} />
              <StatTile index={5} label="No Due Date" value={stats.noDueDate} sub="Needs a deadline" color={t.textDim} onPress={() => { setTab('register'); setFilter({ dueWithin: 'No Due Date' }); }} />
              <StatTile index={6} label="Pending" value={stats.pending} sub="As of now" color={t.warn} onPress={() => { setTab('register'); setFilter({ status: 'Pending' }); }} />
            </Row>

            {/* web.app, wide: the panels flow in two columns (CSS columns), so no column is left with empty space under it. */}
            <View style={Platform.OS === 'web' && wide ? { display: 'block', columnCount: 2, columnGap: 16 } : undefined}>
            {/* Phone-width screens and the whole website: the bank follow-ups to make today, with the banker's last word on each. */}
            {(phoneLayout || Platform.OS === 'web') && !!followToday.length && (
              <View style={colItem}><Card style={{ marginTop: 14 }}>
                <Small style={{ fontWeight: '700', textTransform: 'uppercase', marginBottom: 6 }}>📞 Follow-ups today ({followToday.length})</Small>
                {followToday.map(({ entry, overdue, last, long }, i) => (
                  <Pressable key={entry.id} onPress={() => openFollowUp(entry)} accessibilityRole="button" accessibilityLabel={`Follow up: ${entry.title}`}
                    style={{ paddingVertical: 8, borderTopWidth: i ? 1 : 0, borderTopColor: t.border }}>
                    <Row style={{ alignItems: 'center', gap: 8 }}>
                      <Text style={{ flex: 1, color: t.text, fontWeight: '700', fontSize: t.fs(14) }} numberOfLines={1}>{entry.title}</Text>
                      {/* "Both" (phone-width screens): a long pending follow-up is marked (it is listed first everywhere). */}
                      {phoneLayout && long && <Text style={{ color: t.danger, fontWeight: '800', fontSize: t.fs(12) }}>⚠ Long pending</Text>}
                      <Text style={{ color: overdue ? t.danger : t.accent, fontWeight: '700', fontSize: t.fs(12.5) }}>{overdue ? 'Overdue' : fmtDue(entry.dueAt)}</Text>
                    </Row>
                    <Small numberOfLines={2} style={{ marginTop: 2 }}>
                      {last ? `Last (${fmtFollowDate(last.at || `${last.d}T12:00:00`)}${followUpWho(last) ? `, ${followUpWho(last)}` : ''}): ${last.remarks || 'no remarks'}` : 'No follow-up yet'} · {followUpAgeText(entry)}
                    </Small>
                  </Pressable>
                ))}
                <Small style={{ marginTop: 6 }}>Tap one to add today's banker update and the next date.</Small>
              </Card></View>
            )}

            {/* web.app: open bank follow-ups by bank - where things are stuck. */}
            {Platform.OS === 'web' && !!byBank.length && (
              <View style={colItem}><Card style={{ marginTop: 14 }}>
                <Small style={{ fontWeight: '700', textTransform: 'uppercase', marginBottom: 8 }}>🏦 Bank follow-ups by bank</Small>
                <Row style={{ paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: t.border }}>
                  {['Bank', 'Open', 'Overdue', 'Oldest', 'Long pending'].map((h, i) => (
                    <Text key={h} style={{ flex: i ? 1 : 2, color: t.textDim, fontWeight: '700', fontSize: t.fs(12), textAlign: i ? 'center' : 'left' }}>{h}</Text>
                  ))}
                </Row>
                {byBank.map((g) => (
                  <Pressable key={g.bank} onPress={() => { setTab('register'); setFilter({ ...EMPTY_WD_FILTER, bank: g.bank === 'Bank not named' ? '-' : g.bank }); }} accessibilityRole="button"
                    accessibilityLabel={`${g.bank}: ${g.open} open`} style={{ flexDirection: 'row', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: t.border }}>
                    <View style={{ flex: 2 }}>
                      <Text style={{ color: t.text, fontWeight: '700', fontSize: t.fs(14) }}>{g.bank}</Text>
                      <Small numberOfLines={1}>{g.titles.join(' · ')}</Small>
                    </View>
                    <Text style={{ flex: 1, textAlign: 'center', color: t.text, fontWeight: '700' }}>{g.open}</Text>
                    <Text style={{ flex: 1, textAlign: 'center', color: g.overdue ? t.danger : t.textDim, fontWeight: '700' }}>{g.overdue}</Text>
                    <Text style={{ flex: 1, textAlign: 'center', color: t.text }}>{g.oldestDays} d</Text>
                    <Text style={{ flex: 1, textAlign: 'center', color: g.longPending ? t.danger : t.textDim, fontWeight: '700' }}>{g.longPending}</Text>
                  </Pressable>
                ))}
                <Small style={{ marginTop: 6 }}>Tap a bank to see its tasks in Register.</Small>
              </Card></View>
            )}

            {/* web.app: the month's open tasks by due date. */}
            {Platform.OS === 'web' && <View style={colItem}><WdCalendar entries={entries} holidays={holidayList} leaveDays={leaveList} onOpen={(e) => openEditEntry(e)} /></View>}
            {payTotals.count > 0 && (
              <View style={colItem}>
                <Card style={{ marginTop: 14 }}>
                  <Row style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <Small style={{ fontWeight: '700', textTransform: 'uppercase' }}>💳 Payments by vendor</Small>
                    <Row gap={6}>
                      {[['This month', 0], ['Last month', 1]].map(([label, n]) => (
                        <Pressable key={n} onPress={() => setPayMonth(n)} style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: payMonth === n ? t.accent : t.surfaceAlt }}>
                          <Text style={{ color: payMonth === n ? '#fff' : t.text, fontWeight: '700', fontSize: t.fs(11.5) }}>{label}</Text>
                        </Pressable>
                      ))}
                    </Row>
                  </Row>
                  <Text style={{ color: t.text, fontWeight: '800', fontSize: t.fs(22) }}>{payTotals.total > 0 ? fmtRupees(payTotals.total) : `${payTotals.count} payments`}</Text>
                  <Small style={{ marginBottom: 8 }}>{payTotals.count} payment{payTotals.count === 1 ? '' : 's'}{payTotals.withAmount < payTotals.count ? ` · ${payTotals.withAmount} with an amount in Key Points` : ''}</Small>
                  {payTotals.rows.slice(0, 8).map((r) => (
                    <View key={r.vendor} style={{ marginBottom: 6 }}>
                      <Row style={{ justifyContent: 'space-between' }}>
                        <Text style={{ color: t.text, fontSize: t.fs(13), flex: 1 }} numberOfLines={1}>{r.vendor}</Text>
                        <Text style={{ color: t.textDim, fontSize: t.fs(12.5) }}>{r.total > 0 ? fmtRupees(r.total) : '-'} · {r.count}</Text>
                      </Row>
                      <View style={{ height: 6, borderRadius: 3, backgroundColor: t.surfaceAlt, marginTop: 3 }}>
                        <View style={{ height: 6, borderRadius: 3, backgroundColor: t.accent, width: `${Math.max(4, Math.round((r.total || r.count) / ((payTotals.rows[0].total || payTotals.rows[0].count) || 1) * 100))}%` }} />
                      </View>
                    </View>
                  ))}
                </Card>
              </View>
            )}
            <View style={colItem}><CountList title="By Category" total={stats.totalOpen} rows={byCategory} onPress={(v) => { setTab('register'); setFilter({ category: v }); }} /></View>
            <View style={colItem}><CountList title="By Status" total={stats.totalOpen} rows={byStatus} onPress={(v) => { setTab('register'); setFilter({ status: v }); }} /></View>
            <View style={colItem}><CountList title="By Priority" total={stats.totalOpen} rows={byPriority} onPress={(v) => { setTab('register'); setFilter({ priority: v }); }} /></View>
            <View style={colItem}><CountList title="Pending Assignments" total={stats.totalOpen} rows={byAssignee} onPress={(v) => { setTab('register'); setFilter({ pendingWith: v }); }} /></View>

            <View style={colItem}><Card style={{ marginTop: 14 }}>
              <Small style={{ fontWeight: '700', textTransform: 'uppercase', marginBottom: 6 }}>Next 7 Days - Holidays</Small>
              {!upcomingHolidays.length ? <P dim>No holidays in the next 7 days.</P> : upcomingHolidays.map((h) => (
                <Row key={h.id} style={{ justifyContent: 'space-between', paddingVertical: 6 }}>
                  <Text style={{ color: t.text }}>{h.title}</Text>
                  <Small>{fmtDate(h.date)}</Small>
                </Row>
              ))}
            </Card></View>
            </View>
            <Btn style={{ marginTop: 14 }} kind="soft" title="📝 Daily Activity Report" onPress={() => goTab('report')} />
          </View>
        )}

        {tab === 'register' && (
          <View>
            <Row gap={8} style={{ alignItems: 'center', marginBottom: 10 }}>
              <View style={{ flex: 1 }}>
                <Field style={{ marginBottom: 0 }} value={filters.query} onChangeText={(v) => setFilter({ query: v })} placeholder={SEARCH_PLACEHOLDER} />
              </View>
              <Pressable
                onPress={() => setShowFilters((v) => !v)}
                accessibilityLabel="Filters"
                style={{ width: 46, height: 46, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: showFilters || isWdFilterActive(filters) ? t.accent + '33' : t.surfaceAlt }}
              >
                <Text style={{ fontSize: 20 }}>⚙️</Text>
                {isWdFilterActive(filters) && <View style={{ position: 'absolute', top: 7, right: 7, width: 9, height: 9, borderRadius: 5, backgroundColor: t.accent }} />}
              </Pressable>
              <Pressable
                onPress={() => (wd.cloudSyncUrl ? pullFromSheet(wd.cloudSyncUrl) : setTab('config'))}
                accessibilityLabel="Sync now"
                style={{ width: 46, height: 46, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: t.surfaceAlt }}
              >
                <Text style={{ fontSize: 20, opacity: pulling ? 0.4 : 1 }}>🔄</Text>
              </Pressable>
            </Row>
            {showFilters && (
              <Card style={{ marginBottom: 12 }}>
              <OptionPicker label="Category" source={SOURCES.wdCategory} value={filters.category === ANY ? null : filters.category} onChange={(v) => setFilter({ category: v || ANY })} allowAny anyLabel="All Categories" />
              <Row gap={10}>
                <View style={{ flex: 1 }}><OptionPicker label="Priority" source={SOURCES.wdPriority} value={filters.priority === ANY ? null : filters.priority} onChange={(v) => setFilter({ priority: v || ANY })} allowAny anyLabel="All Priorities" /></View>
                <View style={{ flex: 1 }}><OptionPicker label="Status" source={SOURCES.wdStatus} value={filters.status === ANY ? null : filters.status} onChange={(v) => setFilter({ status: v || ANY })} allowAny anyLabel="All Statuses" /></View>
              </Row>
              <OptionPicker label="Pending with" source={SOURCES.wdAssignee} value={filters.pendingWith === ANY ? null : filters.pendingWith} onChange={(v) => setFilter({ pendingWith: v || ANY })} allowAny anyLabel="All Pending With" />
              <Small style={{ marginBottom: 5 }}>Due date</Small>
              <Segmented options={DUE_WITHIN_OPTIONS} value={filters.dueWithin} onChange={(v) => setFilter({ dueWithin: v })} style={{ marginBottom: 12 }} />
              </Card>
            )}

            <Row style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <Text style={{ color: t.textDim, fontWeight: '700', fontSize: t.fs(15) }}>{filteredOpen.length} of {openEntries.length} entries shown{filters.bank ? `  ·  🏦 ${filters.bank === '-' ? 'Bank not named' : filters.bank}` : ''}</Text>
              {isWdFilterActive(filters) && <Pressable onPress={() => setFilter(EMPTY_WD_FILTER)}><Small style={{ color: t.accent, fontWeight: '700' }}>Reset</Small></Pressable>}
            </Row>
            {(Platform.OS !== 'web' || wide) && <Segmented options={[{ key: 'cards', label: '▦ Cards' }, { key: 'table', label: '☰ Table' }]} value={tableView ? 'table' : 'cards'} onChange={(k) => updateWd((w) => ({ ...w, tableView: k === 'table' }))} style={{ marginBottom: 10, alignSelf: 'flex-start', width: 220 }} />}
            <Segmented options={SORTS} value={sortBy} onChange={setSortBy} style={{ marginBottom: 10 }} />
            <Small style={{ marginBottom: 12, textAlign: 'center' }}>Tap a card to edit · ✓ completes it{WEB_DAR ? ' · DAR completes it into the daily report' : ''}{Platform.OS === 'web' && !phoneLayout ? ' · Keys: N new entry, / search, ⌘K finder, ? all shortcuts' : ''}</Small>
            {!filteredOpen.length && <P dim>Nothing matches.</P>}
            {phoneLayout && tableView && <EntryTable entries={visibleRegister} onOpen={(e) => openEditEntry(e)} />}
            {phoneLayout && !tableView && visibleRegister.map((entry) => (
              <OpenCard key={entry.id} entry={entry} ring={alertModeOf(entry, wd.alerts) === 'alarm'} onToggleAlert={() => toggleAlert(entry)}
                onEscalate={needsEscalationPrompt(entry) ? (yes) => answerEscalation(entry, yes) : undefined}
                onOpen={() => openEditEntry(entry)} onToggleDar={() => toggleDar(entry)} onComplete={(opts) => act(entry, 'complete', opts)} narration={narrationFor(entry, plists)}
                onFollowUp={isBankFollowUpCategory(entry.category) ? () => openFollowUp(entry) : undefined} />
            ))}
            {!phoneLayout && tableView && <EntryTable entries={visibleRegister} onOpen={(e) => openEditEntry(e)} />}
            {!phoneLayout && !tableView && <CardGrid>
            {visibleRegister.map((entry, i) => (
              <FadeInUp key={entry.id} delay={Math.min(i, 8) * 45} distance={22} style={GRID ? { flex: 1 } : undefined}>
                <EntryRow
                  entry={entry}
                  ring={alertModeOf(entry, wd.alerts) === 'alarm'}
                  onToggleAlert={() => toggleAlert(entry)}
                  onPress={() => openEditEntry(entry)}
                  onToggleDar={() => toggleDar(entry)}
                  onAct={(kind, opts) => act(entry, kind, opts)}
                  narration={narrationFor(entry, plists)}
                  onFollowUp={followUpHere && isBankFollowUpCategory(entry.category) ? () => openFollowUp(entry) : undefined}
                />
              </FadeInUp>
            ))}
            </CardGrid>}
            <ShowMore total={filteredOpen.length} visibleCount={shownCount} onPress={() => setVisibleCount((n) => n + 20)} />
          </View>
        )}

        {tab === 'done' && (
          <View>
            <Row gap={8} style={{ alignItems: 'center', marginBottom: 10 }}>
              <View style={{ flex: 1 }}>
                <Field style={{ marginBottom: 0 }} value={doneFilters.query} onChangeText={(v) => setDoneFilter({ query: v })} placeholder="🔍 Search completed tasks..." />
                {!!doneFilters.query && (
                  <Pressable onPress={() => setDoneFilter({ query: '' })} hitSlop={10} accessibilityLabel="Clear search"
                    style={{ position: 'absolute', right: 10, top: 0, bottom: 0, justifyContent: 'center' }}>
                    <Text style={{ color: t.textDim, fontSize: t.fs(18) }}>✕</Text>
                  </Pressable>
                )}
              </View>
              <Pressable
                onPress={() => setShowDoneFilters((v) => !v)}
                accessibilityLabel="Filters"
                style={{ width: 46, height: 46, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: showDoneFilters || isWdFilterActive({ ...doneFilters, query: '' }) ? t.accent + '33' : t.surfaceAlt }}
              >
                <Text style={{ fontSize: 20 }}>⚙️</Text>
                {isWdFilterActive({ ...doneFilters, query: '' }) && <View style={{ position: 'absolute', top: 7, right: 7, width: 9, height: 9, borderRadius: 5, backgroundColor: t.accent }} />}
              </Pressable>
            </Row>
            {showDoneFilters && (
              <Card style={{ marginBottom: 12 }}>
                <OptionPicker label="Category" source={SOURCES.wdCategory} value={doneFilters.category === ANY ? null : doneFilters.category} onChange={(v) => setDoneFilter({ category: v || ANY })} allowAny anyLabel="All Categories" />
                <Row gap={10}>
                  <View style={{ flex: 1 }}><OptionPicker label="Priority" source={SOURCES.wdPriority} value={doneFilters.priority === ANY ? null : doneFilters.priority} onChange={(v) => setDoneFilter({ priority: v || ANY })} allowAny anyLabel="All Priorities" /></View>
                  <View style={{ flex: 1 }}><OptionPicker label="Pending with" source={SOURCES.wdAssignee} value={doneFilters.pendingWith === ANY ? null : doneFilters.pendingWith} onChange={(v) => setDoneFilter({ pendingWith: v || ANY })} allowAny anyLabel="All Pending With" /></View>
                </Row>
              </Card>
            )}

            <Row style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <Text style={{ color: t.textDim, fontWeight: '700', fontSize: t.fs(15) }}>
                {isWdFilterActive(doneFilters) ? `${doneEntries.length} of ${allDone.length} completed` : `${allDone.length} completed`}
              </Text>
              {doneNarrowed && <Pressable onPress={clearDone} hitSlop={8}><Small style={{ color: t.accent, fontWeight: '700' }}>Clear</Small></Pressable>}
            </Row>
            {(Platform.OS !== 'web' || wide) && <Segmented options={[{ key: 'cards', label: '▦ Cards' }, { key: 'table', label: '☰ Table' }]} value={tableView ? 'table' : 'cards'} onChange={(k) => updateWd((w) => ({ ...w, tableView: k === 'table' }))} style={{ marginBottom: 10, alignSelf: 'flex-start', width: 220 }} />}
            <Small style={{ marginBottom: 5 }}>Shown first</Small>
            <Segmented options={[{ key: '1', label: 'Today' }, { key: '3', label: '3 days' }, { key: '5', label: '5 days' }, { key: '10', label: '10 days' }]} value={String(doneDays)}
              onChange={(k) => { updateWd((w) => ({ ...w, doneDays: Number(k) })); setShowOlderDone(false); }} style={{ marginBottom: 12 }} />
            {allDone.length > 1 && (
              <Row style={{ alignItems: 'center', marginBottom: 12 }}>
                <Small style={{ marginRight: 10, marginBottom: 0 }}>Sort by</Small>
                <PickerButton style={{ flex: 1 }} text={`${(DONE_SORTS.find((x) => x.key === doneSort) || DONE_SORTS[0]).label}  ▾`} onPress={() => setDoneSortOpen(true)} />
              </Row>
            )}
            {!allDone.length && <P dim>Nothing completed yet.</P>}
            {!!allDone.length && !doneEntries.length && <P dim>Nothing matches.</P>}
            {phoneLayout && tableView && <EntryTable mode="done" completedAt={completedTime} entries={visibleDone} onOpen={(e) => openEditEntry(e)} />}
            {phoneLayout && !tableView && visibleDone.map((entry) => (
              <DoneCard key={entry.id} entry={entry} narration={narrationFor(entry, plists)} onOpen={() => openEditEntry(entry)} onReopen={() => act(entry, 'reopen')} onBin={() => act(entry, 'bin')} />
            ))}
            {!phoneLayout && tableView && <EntryTable mode="done" completedAt={completedTime} entries={visibleDone} onOpen={(e) => openEditEntry(e)} />}
            {!phoneLayout && !tableView && <CardGrid>
            {visibleDone.map((entry) => (
              <EntryRow key={entry.id} entry={entry} mode="done" onPress={() => openEditEntry(entry)} onToggleDar={() => toggleDar(entry)} onAct={(kind, opts) => act(entry, kind, opts)} narration={narrationFor(entry, plists)} />
            ))}
            </CardGrid>}
            <ShowMore total={doneEntries.length} visibleCount={shownCount} onPress={() => setVisibleCount((n) => n + 20)} />
            {doneFolded && (
              <Pressable onPress={() => setShowOlderDone(true)} accessibilityRole="button" style={{ alignItems: 'center', paddingVertical: 14 }}>
                <Text style={{ color: t.accent, fontWeight: '700' }}>••• Show more ({doneEntries.length - doneRecent.length} older)</Text>
              </Pressable>
            )}
            {!!doneEntries.length && <Small style={{ textAlign: 'center' }}>Tap ↩ to reopen. Every change can be undone for a few seconds.</Small>}
            <Sheet visible={doneSortOpen} onClose={() => setDoneSortOpen(false)} title="Sort by">
              <Choices
                options={DONE_SORTS.map((x) => [x.key, x.label])}
                value={doneSort}
                onChange={(v) => { updateWd((w) => ({ ...w, doneSort: v })); setVisibleCount(5); setDoneSortOpen(false); }}
              />
            </Sheet>
          </View>
        )}

        {tab === 'narration' && Platform.OS === 'web' && (
          <View>
            <Card>
              <Text style={{ color: t.accent, fontWeight: '800', fontSize: t.fs(13), marginBottom: 2 }}>TALLY NARRATION</Text>
              <Small style={{ marginBottom: 10 }}>Pick a narration type to build the Tally entry text - for any task, whatever its status. The vendor leads the report line and never goes into Tally.</Small>
              {!plists.narrationTypes.length && <Small style={{ marginBottom: 8 }}>No narration types yet - they are set up in Config → Settings & Tools and arrive with Realtime Sync.</Small>}
              {/* web.app: the entry and mail chain lead the form's grid - three fields to a row on a wide screen, two otherwise. */}
              <NarrationForm lead={[
              // Optional: pick an entry - its mail chain and saved narration come in, and the result can be saved back to it.
              <View key="entry">
              <Small style={{ marginBottom: 5 }}>ENTRY (optional)</Small>
              {narrationEntry ? (
                <Row style={{ alignItems: 'center', gap: 8, marginBottom: 12 }}>
                  <Text style={{ flex: 1, color: t.text, fontWeight: '700' }} numberOfLines={2}>{narrationEntry.title}</Text>
                  <Btn kind="soft" title="Unpick" onPress={() => { setNarrationEntry(null); setNarrationPage({ typeName: '', includeMail: false }); setNarrationMail(''); }} />
                </Row>
              ) : (
                <View style={{ marginBottom: 12 }}>
                  <Field style={{ marginBottom: 6 }} value={narrationFind} onChangeText={setNarrationFind} placeholder="🔍 Search an entry by task or mail chain..." />
                  {!!narrationFind.trim() && entries.filter((x) => !x.binned && `${x.title} ${x.reference || ''}`.toLowerCase().includes(narrationFind.trim().toLowerCase())).slice(0, 6).map((x) => (
                    <Pressable key={x.id} onPress={() => { const d = withDrafts(x).narrationDraft; setNarrationEntry(x); setNarrationPage(d); setNarrationMail(x.reference || ''); setNarrationFind(''); }}
                      style={{ paddingVertical: 8, paddingHorizontal: 10, borderRadius: 10, backgroundColor: t.surfaceAlt, marginBottom: 4 }}>
                      <Text style={{ color: t.text }} numberOfLines={1}>{x.title}</Text>
                    </Pressable>
                  ))}
                </View>
              )}
              </View>,
              <Field key="mail" label="MAIL CHAIN (optional)" value={narrationMail} onChangeText={setNarrationMail} placeholder="Paste or type the mail subject" />
              ]} nd={narrationPage} setNd={(patch) => setNarrationPage((d) => ({ ...d, ...patch }))} lists={plists} mailChain={narrationMail} importDetails={narrationEntry ? narrationEntry.paymentDetails : {}} columns={narrationCols}
                subText={narrationEntry ? subCategoryText(findSubCategory(plists, narrationEntry.subCategory), narrationEntry.subCategoryFields) : ''} />
              <Row gap={10}>
                {!!narrationEntry && (
                  <Btn style={{ flex: 1 }} title="Save to this entry" onPress={() => {
                    const n = makeNarration(narrationPage, { ...narrationEntry, reference: narrationMail }, plists);
                    if (!n) return Alert.alert('Pick a narration type first');
                    updateWd((w) => ({ ...w, entries: w.entries.map((x) => (x.id === narrationEntry.id ? { ...x, narration: n, ...editedNow() } : x)) }));
                    Alert.alert('Saved', 'The narration is saved on the entry.');
                  }} />
                )}
                <Btn style={{ flex: 1 }} kind="soft" title="Clear" onPress={() => { setNarrationPage({ typeName: '', includeMail: false }); setNarrationMail(''); setNarrationEntry(null); }} />
              </Row>
            </Card>
          </View>
        )}

        {tab === 'links' && Platform.OS === 'web' && (
          <View>
            <Card>
              <Text style={{ color: t.accent, fontWeight: '800', fontSize: t.fs(13), marginBottom: 2 }}>USEFUL LINKS</Text>
              <Small style={{ marginBottom: 10 }}>Keep the links you use. A click opens the link in a new tab of your default browser.</Small>
              <Row gap={10} style={{ alignItems: 'flex-end', flexWrap: 'wrap' }}>
                <View style={{ flex: 1, minWidth: 180 }}><Field label="NAME" value={linkDraft.title} onChangeText={(v) => setLinkDraft((d) => ({ ...d, title: v }))} placeholder="e.g. ICEGATE" /></View>
                <View style={{ flex: 1, minWidth: 140 }}><Field label="FOLDER (optional)" value={linkDraft.folder} onChangeText={(v) => setLinkDraft((d) => ({ ...d, folder: v }))} placeholder="e.g. Bank portals" /></View>
                <View style={{ flex: 2, minWidth: 240 }}><Field label="LINK" value={linkDraft.url} onChangeText={(v) => setLinkDraft((d) => ({ ...d, url: v }))} placeholder="https://..." autoCapitalize="none" /></View>
                <Btn style={{ marginBottom: 12 }} title={linkDraft.id ? 'Save' : 'Add link'} onPress={() => {
                  const url = normalizeLink(linkDraft.url);
                  if (!url) return Alert.alert('Enter a link', 'Type a web address such as https://example.com');
                  const title = linkDraft.title.trim() || url.replace(/^https?:\/\/(www\.)?/i, '').replace(/\/.*$/, '');
                  const folder = linkDraft.folder.trim();
                  setTools((w) => {
                    const list = Array.isArray(w.links) ? w.links : [];
                    const row = { title, url, ...(folder ? { folder } : {}) };
                    return { ...w, links: linkDraft.id ? list.map((x) => (x.id === linkDraft.id ? { id: x.id, ...row } : x)) : [...list, { id: `lnk-${Date.now().toString(36)}`, ...row }] };
                  });
                  setLinkDraft({ id: '', title: '', url: '', folder: '' });
                }} />
                {!!linkDraft.id && <Btn style={{ marginBottom: 12 }} kind="soft" title="Cancel" onPress={() => setLinkDraft({ id: '', title: '', url: '', folder: '' })} />}
              </Row>
            </Card>
            <Row gap={8} style={{ marginTop: 10, flexWrap: 'wrap' }}>
              <Btn kind="soft" title="⬇ Import bookmarks" onPress={async () => {
                const text = await pickTextFile();
                if (!text) return;
                const found = parseBookmarks(text);
                if (!found.length) return Alert.alert('No links found', 'Pick a bookmarks file exported from your browser (HTML) or from this tab.');
                const res = addLinks(wd.links, found);
                setTools((w) => ({ ...w, links: addLinks(w.links, found).links }));
                Alert.alert('Imported', `${res.added} new link${res.added === 1 ? '' : 's'} added (${found.length - res.added} already here).`);
              }} />
              {!!(wd.links || []).length && <Btn kind="soft" title="⬆ Export" onPress={() => downloadText('working-dashboard-links.html', bookmarksHtml(wd.links))} />}
              {!!linkFolder && <Btn kind="soft" title={`Open all in ${linkFolder}`} onPress={() => (wd.links || []).filter((x) => x.folder === linkFolder).forEach((x) => Linking.openURL(x.url))} />}
            </Row>
            {linkFolders(wd.links).length > 0 && (
              <Row gap={6} style={{ marginTop: 10, flexWrap: 'wrap' }}>
                {['', ...linkFolders(wd.links)].map((f) => (
                  <Pressable key={f || 'all'} onPress={() => setLinkFolder(f)} style={{ paddingVertical: 5, paddingHorizontal: 12, borderRadius: 999, backgroundColor: linkFolder === f ? t.accent : t.surfaceAlt }}>
                    <Text style={{ color: linkFolder === f ? '#fff' : t.text, fontWeight: '700', fontSize: t.fs(12.5) }}>{f || 'All'}</Text>
                  </Pressable>
                ))}
              </Row>
            )}
            {(wd.links || []).length > 6 && <Field style={{ marginTop: 10 }} value={linkFind} onChangeText={setLinkFind} placeholder="🔍 Search links..." />}
            <CardGrid>
              {(wd.links || []).filter((x) => (!linkFolder || x.folder === linkFolder) && (!linkFind.trim() || `${x.title} ${x.url} ${x.folder || ''}`.toLowerCase().includes(linkFind.trim().toLowerCase()))).map((x) => (
                <Card key={x.id}>
                  <Pressable onPress={() => Linking.openURL(x.url)} accessibilityRole="link" accessibilityLabel={`Open ${x.title}`}>
                    <Text style={{ color: t.accent, fontWeight: '800', fontSize: t.fs(15) }} numberOfLines={1}>{x.title}</Text>
                    <Small numberOfLines={1}>{x.folder ? `${x.folder} · ` : ''}{x.url}</Small>
                  </Pressable>
                  <Row gap={8} style={{ marginTop: 8 }}>
                    <Btn kind="soft" title="Open" onPress={() => Linking.openURL(x.url)} />
                    <Btn kind="soft" title="Edit" onPress={() => setLinkDraft({ id: x.id, title: x.title, url: x.url, folder: x.folder || '' })} />
                    <Btn kind="soft" title="Delete" onPress={() => setTools((w) => ({ ...w, links: (w.links || []).filter((y) => y.id !== x.id) }))} />
                  </Row>
                </Card>
              ))}
            </CardGrid>
            {!(wd.links || []).length && <Small style={{ marginTop: 10 }}>No links yet - add the first one above.</Small>}
          </View>
        )}

        {tab === 'report' && (
          <View>
            <Card>
              <Row gap={10} style={{ alignItems: 'flex-end' }}>
                <View style={{ flex: 1 }}>
                  <DateTimeField label="Date" mode="date" value={new Date(`${reportDate}T12:00:00`).toISOString()} onChange={(v) => setReportDate(toDateKey(new Date(v)))} />
                </View>
                <Btn title="Generate" onPress={() => buildReport()} style={{ marginBottom: 12 }} />
              </Row>
              {/* Phone-width screens and the whole website: totals for the week (from Monday) or the month (from the 1st) up to the date above. */}
              {(phoneLayout || Platform.OS === 'web') && <Row gap={10} style={{ marginBottom: 8 }}>
                <Btn style={{ flex: 1 }} kind={reportKind === 'week' ? 'primary' : 'soft'} title="📅 This week" onPress={() => buildSummary('week')} />
                <Btn style={{ flex: 1 }} kind={reportKind === 'month' ? 'primary' : 'soft'} title="🗓 This month" onPress={() => buildSummary('month')} />
              </Row>}
              {!!reportModel && (
                <Small>
                  {reportModel.data.payments} payments · {reportModel.data.others} other completed · {reportModel.data.followed} followed up
                  {reportModel.data.excluded ? ` · ${reportModel.data.excluded} marked "Done" (not in report)` : ''}
                  {reportModel.data.skippedPayments ? ` · ${reportModel.data.skippedPayments} Domestic / Urgent payment${reportModel.data.skippedPayments === 1 ? '' : 's'} skipped` : ''}
                  {reportModel.dupes ? ` · ${reportModel.dupes} duplicate${reportModel.dupes === 1 ? '' : 's'} removed` : ''}
                </Small>
              )}
              {!!reportModel && reportModel.data.excluded > 0 && reportModel.data.payments + reportModel.data.others === 0 && (
                <Small style={{ marginTop: 6, color: t.warn }}>
                  Nothing is marked DAR on this phone, though {reportModel.data.excluded} entr{reportModel.data.excluded === 1 ? 'y was' : 'ies were'} completed that day.
                  The web app's DAR marks arrive through Realtime Sync - {googleUser ? 'wait a moment for it to finish, then tap Generate again.' : 'sign in under Config > Realtime Sync, then tap Generate again.'} You can also tap the DAR button on an entry in Register.
                  {(() => {
                    // What the phone can see, so a DAR mark stored under an unknown name can be found from a screenshot.
                    const day = entries.filter((e) => e.done && !e.binned && completedTime(e) && toDateKey(new Date(completedTime(e))) === reportDate);
                    const statuses = Object.entries(day.reduce((m, e) => ({ ...m, [e.status || '-']: (m[e.status || '-'] || 0) + 1 }), {})).map(([k, n]) => `${k} ×${n}`).join(', ');
                    const fields = [...seenWebFields].sort().join(', ');
                    return `\n\nFor support - statuses that day: ${statuses || 'none'}.${fields ? ` Web app fields: ${fields}.` : ''}`;
                  })()}
                </Small>
              )}
              {!!reportNote && <Small style={{ marginTop: 4 }}>{reportNote}</Small>}
            </Card>

            {!!reportText && (
              <Card style={{ marginTop: 14 }}>
                <Text style={{ color: t.text, fontSize: t.fs(13.5), lineHeight: t.fs(20) }}>{reportText}</Text>
              </Card>
            )}

            {!!reportText && (
              <Field style={{ marginTop: 12 }} label={`INSTRUCTIONS FOR AI (${reportKind === 'day' ? 'daily report' : 'this summary'})`} value={wd[aiKey] || ''} multiline
                onChangeText={(v) => setTools((w) => ({ ...w, [aiKey]: v }))}
                placeholder="e.g. Two lines for each task, in a formal, professional tone." />
            )}
            {!!reportText && (
              <Row gap={6} style={{ marginTop: 6, flexWrap: 'wrap' }}>
                {REPORT_PRESETS.map((p) => (
                  <Pressable key={p.label} onPress={() => setTools((w) => ({ ...w, [aiKey]: p.text }))} style={{ paddingVertical: 5, paddingHorizontal: 12, borderRadius: 999, backgroundColor: t.surfaceAlt }}>
                    <Text style={{ color: t.text, fontWeight: '700', fontSize: t.fs(12.5) }}>{p.label}</Text>
                  </Pressable>
                ))}
              </Row>
            )}
            {!!reportAlt && (
              <Btn style={{ marginTop: 10 }} kind="soft" title={reportAlt.showing === 'ai' ? 'Show the standard version' : '✨ Show the AI version'}
                onPress={() => { const next = reportAlt.showing === 'ai' ? 'standard' : 'ai'; setReportText(reportAlt[next]); setReportAlt({ ...reportAlt, showing: next }); }} />
            )}
            {!!reportText && (
              <Row gap={10} style={{ marginTop: 14 }}>
                <Btn style={{ flex: 1 }} kind="soft" title="📋 Copy" onPress={copyReport} />
                {(phoneLayout || Platform.OS === 'web') && <Btn style={{ flex: 1 }} kind="soft" title="✉️ Email" onPress={emailReport} />}
                {/* "Both" (phone-width screens): the report as a PDF, to send on WhatsApp or attach to a mail. */}
                <Btn style={{ flex: 1 }} kind="soft" title="📄 PDF" onPress={pdfReport} />
                <Btn style={{ flex: 1 }} kind="soft" title="⬇ Excel" onPress={csvReport} />
                {/* The person's own Apps Script if they added one, else the app's built-in AI (aiBuiltin.js). On a phone
                    it has a line of its own below: four buttons in a row were too narrow to read. */}
                {!phoneLayout && <Btn style={{ flex: 1 }} title={aiBusy ? 'Writing with AI...' : '✨ Rewrite with AI'} disabled={aiBusy} onPress={rewriteAny} />}
              </Row>
            )}
            {!!reportText && phoneLayout && (
              <Btn style={{ marginTop: 10 }} title={aiBusy ? 'Writing with AI...' : '✨ Rewrite with AI'} disabled={aiBusy} onPress={rewriteAny} />
            )}
            {/* "Both" (phone-width screens): the address Email fills in (saved; several can be separated by commas). */}
            {!!reportText && phoneLayout && (
              <Field style={{ marginTop: 12 }} label="SEND TO (Email fills this in)" value={wd.reportEmail || ''} keyboardType="email-address" autoCapitalize="none"
                onChangeText={(v) => updateWd((w) => ({ ...w, reportEmail: v }))} placeholder="manager@company.com" />
            )}

            {!reportText && <P dim style={{ marginTop: 10 }}>Pick a date and tap Generate - the report is built instantly from that day's completed entries (all but those marked "Done" only), entries whose status moved that day, routine activities and anything logged. Domestic and Urgent payments are left out, as on the web app.</P>}
          </View>
        )}

        {tab === 'holidays' && (() => {
          // "Both" (the APK and the website on a phone): the web app's Holidays tab in one column - search, a holiday
          // calendar filter and "Alerts-on only", the continuous holidays, then a card per holiday (upcoming first).
          const PALETTE = [t.accent, t.ok, t.warn, t.purple, t.accent2, t.pink, t.indigo, t.danger].filter(Boolean);     // one colour per holiday calendar
          const calendars = ['USD Holiday', 'Indian Bank Holiday', ...holidayList.map((h) => h.tag).filter(Boolean)].filter((x, i, a) => a.indexOf(x) === i);
          const colourOf = (tag) => PALETTE[Math.max(0, calendars.indexOf(tag)) % PALETTE.length];
          const todayK = toDateKey(new Date());
          const q = holQuery.trim().toLowerCase();
          const list = holidayList
            .filter((h) => (!q || h.title.toLowerCase().includes(q) || h.date.includes(q))
              && (holCalendar === 'All' || h.tag === holCalendar)
              && (!holAlertsOnly || h.alert !== false))
            .sort((a, b) => {
              const au = (a.endDate || a.date) >= todayK; const bu = (b.endDate || b.date) >= todayK;
              if (au !== bu) return au ? -1 : 1;
              return au ? a.date.localeCompare(b.date) : b.date.localeCompare(a.date);
            });
          const blocks = holidayBlocks(holidayList);
          const dayText = (k) => new Date(`${k}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
          const shortDay = (k) => new Date(`${k}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
          const weekend = (k) => [0, 6].includes(new Date(`${k}T12:00:00`).getDay());
          const pill = (text, color) => (
            <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: t.surfaceAlt }}>
              <Text style={{ color: color || t.textDim, fontSize: t.fs(12), fontWeight: color ? '700' : '500' }}>{text}</Text>
            </View>
          );
          return (
            <View>
              <Row gap={8} style={{ marginBottom: 8 }}>
                <View style={{ flex: 1 }}><Field style={{ marginBottom: 0 }} value={holQuery} onChangeText={setHolQuery} placeholder="🔍 Search holidays..." /></View>
                <Pressable onPress={openNewHoliday} accessibilityLabel="Add holiday" style={{ width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: t.accent }}>
                  <Text style={{ color: '#fff', fontSize: t.fs(22), fontWeight: '600' }}>+</Text>
                </Pressable>
              </Row>
              <Row gap={8} style={{ marginBottom: 12, alignItems: 'center' }}>
                <View style={{ flex: 1 }}><PickerButton text={holCalendar === 'All' ? 'All Holiday Calendars' : holCalendar} onPress={() => setHolCalendarOpen((v) => !v)} /></View>
                <Pressable onPress={() => setHolAlertsOnly((v) => !v)} accessibilityRole="checkbox" accessibilityState={{ checked: holAlertsOnly }} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <View style={{ width: 20, height: 20, borderRadius: 5, alignItems: 'center', justifyContent: 'center', backgroundColor: holAlertsOnly ? t.accent : 'transparent', borderWidth: holAlertsOnly ? 0 : 2, borderColor: t.border }}>
                    {holAlertsOnly && <Text style={{ color: '#fff', fontWeight: '900', fontSize: t.fs(11) }}>✓</Text>}
                  </View>
                  <Text style={{ color: t.text, fontSize: t.fs(13) }}>Alerts-on only</Text>
                </Pressable>
              </Row>
              {holCalendarOpen && (
                <View style={{ marginBottom: 12 }}>
                  <Choices options={[['All', 'All Holiday Calendars'], ...calendars.map((c) => [c, c])]} value={holCalendar} onChange={(v) => { setHolCalendar(v); setHolCalendarOpen(false); }} />
                </View>
              )}
              {blocks.map((b) => (
                <View key={b.start} style={{ marginBottom: 8, padding: 12, borderRadius: 14, backgroundColor: t.ok + '1F', borderWidth: 1, borderColor: t.ok + '55', opacity: b.end < todayK ? 0.6 : 1 }}>
                  <Text style={{ color: t.ok, fontSize: t.fs(13.5) }}>
                    <Text style={{ fontWeight: '800' }}>{b.days}-day continuous holiday</Text>
                    {` · ${shortDay(b.start)} – ${shortDay(b.end)}${b.names.length ? ` · ${b.names.join(' + ')}` : ''}`}
                  </Text>
                </View>
              ))}
              {!list.length && <P dim style={{ textAlign: 'center', marginVertical: 24 }}>{holidayList.length ? 'No holidays match.' : 'No holidays found - add one with the + button.'}</P>}
              {/* web.app: the holiday cards side by side (two a row); a phone-width screen keeps one a row. */}
              <CardGrid>{list.map((h) => {
                const past = (h.endDate || h.date) < todayK;
                const colour = colourOf(h.tag);
                const next = nextWorkingDay(h.endDate || h.date, holidayList, leaveList);
                return (
                  <View key={h.id} style={{ marginTop: 10, padding: 14, borderRadius: 16, backgroundColor: t.surface, borderWidth: 0.5, borderColor: t.border, ...t.shadow, opacity: past ? 0.6 : 1 }}>
                    <Row style={{ alignItems: 'flex-start', gap: 8 }}>
                      <Text style={{ flex: 1, color: t.text, fontWeight: '800', fontSize: t.fs(16) }} numberOfLines={2}>
                        {h.alert === false ? '🔕' : '🔔'}{isOfficeClosed(h) ? ' 🏢' : ''} {h.title}
                      </Text>
                      {!!h.tag && (
                        <View style={{ paddingHorizontal: 9, paddingVertical: 3, borderRadius: 999, backgroundColor: colour + '22', borderWidth: 1, borderColor: colour + '55', maxWidth: '45%' }}>
                          <Text style={{ color: colour, fontWeight: '700', fontSize: t.fs(11.5) }} numberOfLines={2}>{h.tag}</Text>
                        </View>
                      )}
                    </Row>
                    <Row style={{ flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                      {pill(h.endDate ? `${dayText(h.date)} – ${dayText(h.endDate)}` : dayText(h.date), weekend(h.date) ? t.danger : null)}
                      {pill(`Next working: ${dayText(next)}`)}
                    </Row>
                    <Row style={{ justifyContent: 'flex-end', gap: 8, marginTop: 10 }}>
                      <RoundBtn icon="✎" a11y="Edit holiday" onPress={() => setHolidaySheet(h)} />
                      <RoundBtn icon="🗑" a11y="Delete holiday" color={t.danger} onPress={() => Alert.alert('Delete this holiday?', h.title, [{ text: 'Cancel' }, { text: 'Delete', style: 'destructive', onPress: () => removeHoliday(h.id) }])} />
                    </Row>
                  </View>
                );
              })}</CardGrid>
              {!!holidayList.length && <Small style={{ textAlign: 'center', marginTop: 12 }}>{holidayList.length} holidays{leaveList.length ? ` · ${leaveList.length} leave days` : ''}</Small>}
            </View>
          );
        })()}

        {tab === 'config' && (() => {
          // The phone Config page, laid out like the web app's: counts, a button per section ("All" shows every one),
          // then each section open, one column.
          const fontNames = ['Small', 'Default', 'Large', 'X-Large'];
          const panels = [
            { key: 'appearance', icon: '🎨', title: 'Appearance', body: (
              <>
                <P dim>The look of the whole app. Tap a theme to use it.</P>
                <Small style={{ marginBottom: 6 }}>INTERFACE STYLE</Small>
                <Segmented options={[{ key: 'modern', label: Platform.OS === 'web' ? 'macOS style' : 'Modern' }, { key: 'classic', label: 'Classic' }]} value={data.settings?.uiMode === 'classic' ? 'classic' : 'modern'} onChange={(k) => update({ settings: { uiMode: k } })} style={{ marginBottom: 14 }} />
                <Small style={{ marginBottom: 6 }}>COLOURS</Small>
                <Choices options={Object.values(THEMES).map((th) => [th.key, th.label])} value={data.settings?.theme || 'pearl'} onChange={(k) => update({ settings: { theme: k } })} />
              </>
            ) },
            { key: 'quickadd', icon: '⚡', title: 'Quick Add', body: (() => {
              const q = { dateOrder: 'dmy', dateOnlyTime: '', bankWord: 'bank', speechLang: 'en-IN', ...(wd.quickAdd || {}) };
              const set = (patch) => updateWd((w) => ({ ...w, quickAdd: { ...q, ...(w.quickAdd || {}), ...patch } }));
              return (
                <>
                  <P dim>How the Dashboard's Quick add bar and the finder read a typed sentence, and the smart snooze tip.</P>
                  <Small style={{ marginTop: 12, marginBottom: 6 }}>DATES LIKE 05/10</Small>
                  <Segmented options={[{ key: 'dmy', label: 'Day first (5 Oct)' }, { key: 'mdy', label: 'Month first (May 10)' }]} value={q.dateOrder} onChange={(k) => set({ dateOrder: k })} />
                  <Small style={{ marginTop: 14, marginBottom: 6 }}>WHEN ONLY A DATE IS TYPED, THE TIME IS</Small>
                  <Choices options={[['', 'All day'], ['09:00', '9:00 AM'], ['10:00', '10:00 AM'], ['12:00', '12:00 PM'], ['17:00', '5:00 PM']]} value={q.dateOnlyTime} onChange={(k) => set({ dateOnlyTime: k })} />
                  <Field style={{ marginTop: 14 }} label="A PERSON'S NAME THAT MEANS 'THE BANK' CONTAINS" value={q.bankWord} onChangeText={(v) => set({ bankWord: v })} placeholder="bank" autoCapitalize="none" />
                  <Small style={{ marginBottom: 6 }}>SPEAKING (the website's microphone)</Small>
                  <Choices options={[['en-IN', 'English (India)'], ['hi-IN', 'Hindi'], ['te-IN', 'Telugu'], ['en-GB', 'English (UK)'], ['en-US', 'English (US)']]} value={q.speechLang} onChange={(k) => set({ speechLang: k })} />
                </>
              );
            })() },
            { key: 'history', icon: '↩️', title: 'Recent Changes', body: (
              <>
                <P dim>The last changes you made (done, moved, binned, reopened...). Restore puts the task back as it was before that change - any later edit to it is replaced.</P>
                {!(wd.undoHistory || []).length && <P dim style={{ marginTop: 8 }}>Nothing yet.</P>}
                {(wd.undoHistory || []).map((u) => (
                  <Row key={u.id} gap={8} style={{ alignItems: 'center', paddingVertical: 8, borderTopWidth: 0.5, borderTopColor: t.border }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: t.text, fontSize: t.fs(14), fontWeight: '600' }} numberOfLines={2}>{u.message}</Text>
                      <Small>{new Date(u.at).toLocaleString([], { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</Small>
                    </View>
                    <Btn kind="soft" title="Restore" onPress={() => runUndo(u)} />
                  </Row>
                ))}
              </>
            ) },
            { key: 'log', icon: '📝', title: 'Activity Log', body: configBodies.log },
            { key: 'fixed', icon: '📌', title: 'Fixed Daily Activities', body: configBodies.fixed },
            { key: 'leave', icon: '🌴', title: 'Leave Days', body: configBodies.leave },
            { key: 'reportSamples', icon: '📄', title: 'Report Style Samples', body: configBodies.reportSamples },
            { key: 'report', icon: '📊', title: 'Daily Activity Report', body: (
              <>
                <P dim>Built on this device from your entries: every entry completed on the date (unless marked "Done" only), entries moved forward that day, your Fixed Daily Activities and anything in the Activity Log. Domestic and Urgent payments are left out.</P>
                <Btn title="Open the Daily Report" onPress={() => goTab('report')} />
                <Text style={{ color: t.text, fontWeight: '700', marginTop: 16, marginBottom: 4 }}>Standard lines before payments</Text>
                {configBodies.paymentIntro}
              </>
            ) },
            { key: 'text', icon: '🔤', title: 'Text Size', body: (
              <>
                <P dim>Default text size for the whole app. Tap to switch - takes effect immediately.</P>
                <Segmented options={Object.keys(FONT_LEVELS).map((lvl) => ({ key: String(lvl), label: fontNames[Number(lvl) - 1] || String(lvl) }))} value={String(data.settings?.fontLevel || 2)} onChange={(k) => update({ settings: { fontLevel: Number(k) } })} />
              </>
            ) },
            { key: 'security', icon: '🔒', title: 'Security & PIN Lock', body: <AppLockSettings title="" footer="A PIN locks this app on this device. It lives only here and is never included in a backup." /> },
            { key: 'realtime', icon: '🔄', title: 'Realtime Sync', body: configBodies.realtime },
            { key: 'cloudSync', icon: '☁️', title: 'Cloud Sync', body: configBodies.cloudSync },
            { key: 'backup', icon: '💾', title: 'Data Backup', body: configBodies.backup },
            { key: 'alarm', icon: '🔔', title: 'Alarm Sound', body: configBodies.alarm },
            { key: 'walk', icon: '🚶', title: 'Walk Reminder', body: reminderBody('walk') },
            { key: 'water', icon: '💧', title: 'Water Reminder', body: reminderBody('water') },
            { key: 'slots', icon: '⏱️', title: 'Time Slots', body: configBodies.slots },
            { key: 'tools', icon: '🛠️', title: 'Settings & Tools', body: (
              <>
                <Row gap={10} style={{ marginBottom: 12 }}>
                  <Btn style={{ flex: 1 }} kind="soft" title="✉️ Fetch Mail" onPress={openMail} />
                  <Btn style={{ flex: 1 }} kind="soft" title={testingAlarm ? 'Playing...' : '🔔 Test Alarm'} disabled={testingAlarm} onPress={testAlarm} />
                </Row>
                <Text style={{ color: t.text, fontWeight: '700', marginBottom: 4 }}>Lists</Text>
                {configBodies.lists}
                <Text style={{ color: t.text, fontWeight: '700', marginTop: 12, marginBottom: 4 }}>Sub Categories & Narration Types</Text>
                {configBodies.paymentRules}
              </>
            ) },
            { key: 'system', icon: '🖥️', title: 'System', body: (
              <>
                <P dim>Alert permissions, battery, home-screen widgets and full backup / restore of the app.</P>
                <Btn kind="soft" title="Open app settings" onPress={() => navigation.navigate('Settings')} />
              </>
            ) },
          ];
          // The menu: sections in groups, each with a one-line description. Tablets and the website show the menu on the
          // left and the chosen section on the right; a phone shows the menu, then the section with a way back.
          const groups = [
            ['General', [['appearance', 'Theme and colours'], ['text', 'Size of the text'], ['security', 'PIN lock for this device']]],
            ['Daily work', [['history', 'Undo changes made earlier'], ['quickadd', 'Dates, language and the bank word'], ['log', 'Things done outside tasks'], ['fixed', 'Routine lines for every report'], ['slots', 'How long a time slot is held'], ['leave', 'Days you are away'], ['tools', 'Lists, Sub Categories, Narration, Fetch Mail']]],
            ['Reports', [['report', 'Standard lines before payments'], ['reportSamples', 'Past reports that teach the AI your style']]],
            ['Alerts', [['alarm', 'Sound for alarms'], ['walk', 'Nudge to walk'], ['water', 'Nudge to drink water']]],
            ['Data & sync', [['realtime', 'Share with the web app and other devices'], ['cloudSync', 'Google Sheet / Apps Script'], ['backup', 'Save and restore your data'], ['system', 'Permissions, battery, widgets']]],
          ];
          const byKey = Object.fromEntries(panels.map((x) => [x.key, x]));
          const split = !phoneLayout;
          const active = configFocus === 'all' ? (split ? 'appearance' : '') : configFocus;
          const pick = (k) => { setConfigFocus(k); if (k === 'reportSamples') loadSamples(true); };
          const counts = [['Active', openEntries.length, t.accent, 'register'], ['Done', allDone.length, t.ok, 'done'], ['In Bin', binnedEntries.length, t.danger, 'bin']];
          const menu = (
            <View style={split ? { width: 250 } : undefined}>
              {groups.map(([title, items]) => (
                <View key={title} style={{ marginBottom: 14 }}>
                  <Text style={{ color: t.textDim, fontWeight: '800', fontSize: t.fs(11.5), letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 6, marginLeft: 6 }}>{title}</Text>
                  <Card style={{ padding: 6 }}>
                    {items.map(([k, hint], i) => {
                      const x = byKey[k];
                      const on = split && active === k;
                      return (
                        <Pressable key={k} onPress={() => pick(k)} accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={x.title}
                          style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingHorizontal: 10, borderRadius: 12, backgroundColor: on ? t.accent : 'transparent', marginTop: i ? 2 : 0 }}>
                          <View style={{ width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? 'rgba(255,255,255,0.22)' : t.surfaceAlt }}>
                            <Text style={{ fontSize: t.fs(17) }}>{x.icon}</Text>
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={{ color: on ? '#fff' : t.text, fontWeight: '700', fontSize: t.fs(14.5) }} numberOfLines={1}>{x.title}</Text>
                            {!split && <Small numberOfLines={1}>{hint}</Small>}
                          </View>
                          {!split && <Text style={{ color: t.textDim, fontSize: t.fs(20) }}>›</Text>}
                        </Pressable>
                      );
                    })}
                  </Card>
                </View>
              ))}
            </View>
          );
          const cur = active ? byKey[active] : null;
          const curHint = cur ? (groups.flatMap(([, it]) => it).find(([k]) => k === active) || [])[1] : '';
          const panel = cur && (
            <View style={{ flex: 1, minWidth: 0 }}>
              {!split && (
                <Pressable onPress={() => setConfigFocus('all')} accessibilityRole="button" accessibilityLabel="Back to Config" style={{ alignSelf: 'flex-start', paddingVertical: 6, paddingRight: 12, marginBottom: 6 }}>
                  <Text style={{ color: t.accent, fontWeight: '800', fontSize: t.fs(14) }}>‹ Config</Text>
                </Pressable>
              )}
              <Card style={{ padding: 18 }}>
                <Row gap={12} style={{ alignItems: 'center', marginBottom: 4 }}>
                  <View style={{ width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: t.surfaceAlt }}>
                    <Text style={{ fontSize: t.fs(22) }}>{cur.icon}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: t.text, fontWeight: '800', fontSize: t.fs(19) }}>{cur.title}</Text>
                    {!!curHint && <Small>{curHint}</Small>}
                  </View>
                </Row>
                <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: t.border, marginVertical: 14 }} />
                {cur.body}
              </Card>
            </View>
          );
          return (
            <View>
              <Row gap={10} style={{ marginBottom: 16 }}>
                {counts.map(([label, n, color, to]) => (
                  <Pressable key={label} onPress={() => goTab(to)} style={{ flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: 16, backgroundColor: t.surface, borderWidth: 0.5, borderColor: t.border }}>
                    <Text style={{ color, fontWeight: '800', fontSize: t.fs(20) }}>{n}</Text>
                    <Small style={{ fontWeight: '700', textTransform: 'uppercase' }}>{label}</Small>
                  </Pressable>
                ))}
              </Row>
              {split ? (
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 18 }}>
                  {menu}
                  {panel}
                </View>
              ) : (panel || menu)}
            </View>
          );
        })()}

        </FadeInUp>
      </SwipeTabs>

      {/* Gmail, with the person's own sign-in (or their own Apps Script). */}
      {(tab === 'dashboard' || tab === 'register' || tab === 'done') && mailAvailable && (
        <Btn style={{ marginTop: 16 }} kind="soft" title="✉️ Fetch Mail" onPress={openMail} />
      )}
      <View style={{ height: 110 }} />

      {/* --- New/edit entry --- */}
      <Sheet visible={!!entrySheet} onClose={closeEntrySheet} title={entries.some((x) => x.id === entrySheet?.id) ? 'Edit Entry' : 'New Entry'} full fillDesktop footer={entrySheet && pinSave ? entryButtons : null}>
        {!!entrySheet && renderEntryForm()}
      </Sheet>

      {/* web.app: DAR asks for the notes that go into the daily report, then completes the task into it. */}
      <Sheet visible={shortcutsOpen} onClose={() => setShortcutsOpen(false)} title="Keyboard shortcuts">
        {[['⌘K  /  Ctrl+K', 'Search anything, jump to a tab, or create a task from a sentence'], ['N', 'New entry'], ['/', 'Search the Register'], ['Esc', 'Close the open form or dialog'], ['?', 'This list']].map(([k, d]) => (
          <Row key={k} gap={12} style={{ alignItems: 'center', paddingVertical: 8, borderBottomWidth: 0.5, borderBottomColor: t.border }}>
            <View style={{ minWidth: 120 }}><Text style={{ color: t.text, fontWeight: '800', fontSize: t.fs(13.5) }}>{k}</Text></View>
            <Text style={{ flex: 1, color: t.textDim, fontSize: t.fs(13.5) }}>{d}</Text>
          </Row>
        ))}
      </Sheet>

      <Sheet visible={meetingOpen} onClose={() => setMeetingOpen(false)} title="Meeting mode">
        <P dim style={{ marginBottom: 10 }}>Hold every alert - task alarms and walk / water nudges - for a while. Whatever fell in that time rings once when it ends. A phone with the app closed follows within about 15 minutes (at once with instant sync set up).</P>
        <Row style={{ flexWrap: 'wrap', gap: 8 }}>
          {[['30 minutes', 30], ['1 hour', 60], ['2 hours', 120], ['4 hours', 240]].map(([label, min]) => <Btn key={label} kind="soft" title={label} onPress={() => holdFor(min)} />)}
          <Btn kind="soft" title="Until tomorrow 9:00" onPress={holdTomorrow} />
        </Row>
        {meetingOn && <Btn style={{ marginTop: 12 }} title="End meeting mode now" onPress={() => setHold(0)} />}
      </Sheet>

      <Sheet visible={!!darNote} onClose={() => setDarNote(null)} title="Notes for the daily report">
        {!!darNote && (
          <View>
            <Small style={{ marginBottom: 8 }}>{darNote.entry.title}</Small>
            <Field label="Notes (optional)" value={darNote.text} onChangeText={(v) => setDarNote({ ...darNote, text: v })} multiline placeholder="What was done - it goes into the Daily Activity Report" />
            <Row gap={10}>
              <Btn style={{ flex: 1 }} title="Complete with DAR" onPress={() => { const d = darNote; setDarNote(null); act(d.entry, 'complete', { dar: true, notes: d.text }); }} />
              <Btn style={{ flex: 1 }} kind="soft" title="Cancel" onPress={() => setDarNote(null)} />
            </Row>
          </View>
        )}
      </Sheet>

      <Sheet visible={recurrenceOpen} onClose={() => setRecurrenceOpen(false)} title="Recurrence">
        <Choices
          options={RECURRENCES.map((r) => [r, RECURRENCE_LABELS[r]])}
          value={entrySheet?.recurrence || 'none'}
          onChange={(r) => { setEntrySheet((d) => ({ ...d, recurrence: r, recurrenceEveryMin: r === 'custom' ? (d.recurrenceEveryMin || 15) : null })); setRecurrenceOpen(false); }}
        />
      </Sheet>

      {/* --- Bank follow-up (a card's 📞) --- */}
      {/* web.app: the task's checklist, opened by ✓ / DAR before the task is completed. */}
      <Sheet visible={!!checklistSheet} onClose={() => setChecklistSheet(null)} title="Checklist">
        {!!checklistSheet && (() => {
          const ce = entries.find((x) => x.id === checklistSheet.id);
          if (!ce) return null;
          const steps = checklistOf(ce);
          const open = steps.filter((c) => !c.done).length;
          const dar = checklistSheet.opts?.dar === true;
          const tick = (id) => updateWd((w) => ({ ...w, entries: w.entries.map((x) => (x.id === ce.id ? { ...x, checklist: toggleStep(x.checklist, id), ...editedNow() } : x)) }));
          return (
            <View>
              <Text style={{ color: t.text, fontWeight: '800', fontSize: t.fs(16), marginBottom: 4 }}>{ce.title}</Text>
              <Small style={{ marginBottom: 10 }}>{open ? `${open} of ${steps.length} steps still open - tick them, then complete.` : `All ${steps.length} steps done.`}</Small>
              {steps.map((c) => (
                <Pressable key={c.id} onPress={() => tick(c.id)} accessibilityRole="checkbox" accessibilityState={{ checked: !!c.done }} accessibilityLabel={c.text}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: t.border }}>
                  <View style={{ width: 22, height: 22, borderRadius: 6, alignItems: 'center', justifyContent: 'center', backgroundColor: c.done ? t.ok : 'transparent', borderWidth: c.done ? 0 : 2, borderColor: t.border }}>
                    {!!c.done && <Text style={{ color: '#fff', fontWeight: '900', fontSize: t.fs(12) }}>✓</Text>}
                  </View>
                  <Text style={{ flex: 1, color: c.done ? t.textDim : t.text, fontSize: t.fs(14), textDecorationLine: c.done ? 'line-through' : 'none' }}>{c.text}</Text>
                </Pressable>
              ))}
              <Row gap={10} style={{ marginTop: 14 }}>
                <Btn style={{ flex: 1 }} kind="soft" title="Cancel" onPress={() => setChecklistSheet(null)} />
                <Btn style={{ flex: 2 }} kind={open ? 'soft' : 'primary'}
                  title={`${dar ? 'Done + DAR' : 'Mark done'}${open ? ` anyway (${open} open)` : ''}`}
                  onPress={() => { const o = checklistSheet.opts || {}; setChecklistSheet(null); act(ce, 'complete', { ...o, checklistOk: true }); }} />
              </Row>
            </View>
          );
        })()}
      </Sheet>

      <Sheet visible={!!followSheet} onClose={() => setFollowSheet(null)} title="Bank follow-up">
        {!!followSheet && (() => {
          const fe = entries.find((x) => x.id === followSheet.id);
          return fe ? (
            <View>
              <Text style={{ color: t.text, fontWeight: '700', fontSize: t.fs(15), marginBottom: 10 }}>{fe.title}</Text>
              <BankFollowUpForm quickRemarks={wd.followUpRemarks} onQuickRemarks={(list) => updateWd((w) => ({ ...w, followUpRemarks: list }))} entry={fe} draft={followSheet} onChange={(patch) => setFollowSheet((s) => ({ ...s, ...patch }))} />
              <Btn title="Save follow-up" onPress={saveFollowUp} />
            </View>
          ) : null;
        })()}
      </Sheet>

      {/* --- Holiday editor --- */}
      <Sheet visible={!!holidaySheet} onClose={() => setHolidaySheet(null)} title="Holiday">
        {!!holidaySheet && (
          <View>
            <Field label="Name" value={holidaySheet.title} onChangeText={(v) => setHolidaySheet({ ...holidaySheet, title: v })} placeholder="e.g. Gandhi Jayanti" />
            <Row gap={10}>
              <View style={{ flex: 1 }}><DateTimeField label="Date" mode="date" value={holidaySheet.date ? new Date(`${holidayDateKey(holidaySheet.date)}T12:00:00`).toISOString() : null} onChange={(v) => setHolidaySheet({ ...holidaySheet, date: holidayDateKey(new Date(v)) })} /></View>
              <View style={{ flex: 1 }}><DateTimeField label="End date (optional)" mode="date" value={holidaySheet.endDate ? new Date(`${holidayDateKey(holidaySheet.endDate)}T12:00:00`).toISOString() : null} onChange={(v) => setHolidaySheet({ ...holidaySheet, endDate: holidayDateKey(new Date(v)) })} /></View>
            </Row>
            <Field label="Holiday calendar (optional)" value={holidaySheet.tag} onChangeText={(v) => setHolidaySheet({ ...holidaySheet, tag: v })} placeholder="e.g. Indian Bank Holiday, USD Holiday" />
            {/* The web app's "Office closed" tick: a closed day moves Daily tasks on and is offered "Postpone"; a market-only (USD) holiday is a working day. */}
            <Pressable onPress={() => setHolidaySheet({ ...holidaySheet, officeClosed: !isOfficeClosed(holidaySheet) })} accessibilityRole="checkbox" accessibilityState={{ checked: isOfficeClosed(holidaySheet) }}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <View style={{ width: 24, height: 24, borderRadius: 6, alignItems: 'center', justifyContent: 'center', backgroundColor: isOfficeClosed(holidaySheet) ? t.accent : 'transparent', borderWidth: isOfficeClosed(holidaySheet) ? 0 : 2, borderColor: t.accent }}>
                {isOfficeClosed(holidaySheet) && <Text style={{ color: '#fff', fontWeight: '900' }}>✓</Text>}
              </View>
              <Text style={{ flex: 1, color: t.text, fontSize: t.fs(14) }}><Text style={{ fontWeight: '800' }}>Office closed</Text> - untick for a market-only holiday (a working day here)</Text>
            </Pressable>
            <Btn title="Save" onPress={saveHoliday} />
            {holidayList.some((x) => x.id === holidaySheet.id) && (
              <Btn style={{ marginTop: 8 }} kind="danger" title="Delete" onPress={() => { removeHoliday(holidaySheet.id); setHolidaySheet(null); }} />
            )}
          </View>
        )}
      </Sheet>

      {/* --- Config sub-screens (tablets and desktop browsers; a phone shows them on the Config page) --- */}
      {!phoneLayout && CONFIG_SHEETS.map(([key, title]) => (
        <Sheet key={key} visible={configSection === key} onClose={() => setConfigSection(null)} title={title} full>
          {configBodies[key]}
        </Sheet>
      ))}
      {!phoneLayout && ['walk', 'water'].map((kind) => (
        <Sheet key={kind} visible={configSection === kind} onClose={() => setConfigSection(null)} title={kind === 'walk' ? 'Walk Reminder' : 'Water Reminder'} full>
          {reminderBody(kind)}
        </Sheet>
      ))}

      <CommandPalette visible={paletteOpen} onClose={() => setPaletteOpen(false)} tabs={BAR_TABS} entries={entries}
        onGoTab={goTab} onOpenEntry={(e) => openEditEntry(e)} onQuickAdd={(text) => quickAdd(text)} />

      {/* --- Fetch Mail --- */}
      <Sheet visible={mailSheet} onClose={closeMail} title="Fetch Mail" full>
        {!mailAvailable ? (
          <P dim>Sign in with Google (Config &gt; Realtime Sync) to fetch your unread mail.</P>
        ) : (
          <View>
            <Row gap={8}>
              <Field style={{ flex: 1 }} value={mailQuery} onChangeText={setMailQuery} placeholder="🔍 Search fetched mail..." />
              <Btn title={mailBusy ? 'Fetching...' : 'Refresh'} disabled={mailBusy} onPress={openMail} style={{ paddingHorizontal: 14 }} />
            </Row>
            {mailBusy && <P dim style={{ marginTop: 10 }}>Fetching your unread mail...</P>}
            {!mailBusy && !visibleEmails.length && <P dim style={{ marginTop: 10 }}>{emails.length ? 'Nothing matches your search.' : 'No unread mail.'}</P>}
            {visibleEmails.map((email) => (
              <Card key={email.id} style={{ marginBottom: 10 }}>
                <Text style={{ color: t.text, fontWeight: '700' }} numberOfLines={2}>{email.subject || '(No subject)'}</Text>
                <Small numberOfLines={1} style={{ marginTop: 2 }}>{email.sender}</Small>
                <Row gap={8} style={{ marginTop: 10 }}>
                  <Btn style={{ flex: 1 }} kind="danger" title="Ignore" onPress={() => ignoreEmail(email)} />
                  <Btn style={{ flex: 1 }} kind="soft" title="Open" onPress={() => openEmailInGmail(email)} />
                  <Btn style={{ flex: 1 }} title="+ Add task" onPress={() => addTaskFromEmail(email)} />
                </Row>
              </Card>
            ))}
          </View>
        )}
      </Sheet>
    </Screen>

    {(tab === 'dashboard' || tab === 'register') && (
      <Pressable
        onPress={openNewEntry}
        accessibilityLabel="New entry"
        style={{ position: 'absolute', right: wide ? 32 : 18, bottom: fabBottom, width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', backgroundColor: t.accent, elevation: 10, shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } }}
      >
        <Text style={{ color: '#fff', fontSize: 30, lineHeight: 34, fontWeight: '300' }}>+</Text>
      </Pressable>
    )}
    <UndoBar undo={undo} onUndo={runUndo} onHide={() => setUndo(null)} bottom={wide ? 24 : Math.max(insets.bottom, 8) + 84} left={sideBar + 16} />
    <BottomTabs
      tabs={BAR_TABS}
      value={tab}
      badges={{ dashboard: stats.pendingAsOnToday, register: openEntries.length, done: doneEntries.length, bin: binnedEntries.length }}
      onChange={goTab}
    />
    </View>
  );
}
