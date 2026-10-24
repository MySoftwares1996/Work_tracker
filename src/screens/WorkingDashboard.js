import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, Alert, Pressable, ScrollView, Linking, Platform, AppState, Vibration } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import AnimatedLogo from '../AnimatedLogo';
import * as Clipboard from 'expo-clipboard';
import { EmptyState, BottomTabs, SearchField, Toggle, Group, useLayout, useAboveBottomBar, FadeInUp, Screen, Card, P, Small, Label, Btn, Row, Field, Sheet, Segmented, Chip, DateTimeField, OptionPicker, PickerButton, Choices, RingtonePicker, SwipeTabs } from '../ui';
import Icon from '../icons';
import { display } from '../fonts';
import { SOURCES } from '../optionSources';
import { useTheme, blend, THEME_SWATCHES, themeKeyOf } from '../theme';
import { useStore, uid } from '../store';
import { applyDraft, clearEntryDraft, loadEntryDraft, saveEntryDraft } from '../entryDraft';
import { shareCsv } from '../csv';

import { scheduleEntryAlert, cancelEntryAlert } from '../workingDashboardNotify';
import { newId } from '../ids';
import { refreshWdAlerts } from '../workingDashboardActions';
import { checkForPhoneUpdate } from '../updateStatus';
import WdAlarmIntro from './WdAlarmIntro';
import { warnQuiet } from '../quietCatch';
import { seenWebFields } from '../cloudSync';
import { useRealtimeStatus, setRealtimeStatus } from '../realtimeStatus';
import { signInWithGoogle, signOutOfGoogle } from '../firebaseSync';
import { fetchUnreadEmails, markEmailRead, fetchEmailBody, filterEmails, emailToEntryDraft } from '../workingDashboardMail';
import CommandPalette from '../CommandPalette';
import { parseQuickAdd, describeQuickAdd } from '../quickAdd';
import { addAudit, auditDiff, ACTION_AUDIT } from '../audit';
import { WHATS_NEW } from '../whatsNew';
import { checklistText, checklistOpen, checklistOf, addStep, toggleStep, removeStep } from '../checklist';
import { setNarrationSink, addHistory } from '../narrationHistory';

import { templateFrom, applyTemplate, saveTemplate } from '../templates';
import { trackerAvailable, canDrawOverlays, requestOverlayPermission, isFullScreenIntentAllowed, requestFullScreenIntentPermission } from '../tracker';
import EntryTable from '../EntryTable';
import { monthEndOptions } from '../monthEnd';
import { effectiveFormats, finalNarration } from '../reportFormats';
import { applyFormats, applyMoves, addSubFields, REPORT_GROUPS } from '../reportExtras';
import { stampChanges, toolsValue } from '../links';
import { paymentsByVendor, fmtRupees, reportCsvRows, buildReportModel, reportModelToText, verifyAiRewrite, mergeAiReport, buildPeriodSummary, reportMailUrl } from '../workingDashboardReport';
import { paymentLists, makeNarration, findSubCategory, subCategoryText, validatePaymentDetails, subCategoryComplete, paymentSections, normalizeKeyPoints, noteWork, normStatus, isUnstartedStatus, narrationFor, withWebNarrationTypes } from '../workingDashboardPayments';
import { PaymentFields, NarrationForm } from './WdPaymentFields';
import { PrioritySegment, DetailChip } from './WdFormBits';
import WdAlertSettings from './WdAlertSettings';
import WdReportFormats from './WdReportFormats';
import { ListsEditor, SubCategories, ReminderCategories, ReportPoints } from './WdLists';
import WdGeminiKey from './WdGeminiKey';
import WdCalendar from './WdCalendar';
import WdBinTab from './WdBinTab';
import WdLinksTab from './WdLinksTab';
import WdMoreTab from './WdMoreTab';
import WdHolidaysTab from './WdHolidaysTab';
import WdHolidaySheet from './WdHolidaySheet';
import { BankFollowUpForm } from './WdBankFollowUp';
import { isBankFollowUpCategory, addBankFollowUp, defaultNextFollowUp, followUpAgeText, followUpsDueToday, fmtFollowDate, followUpWho, followUpsByBank } from '../bankFollowUp';
import { buildStylePrompt, buildSummaryPrompt, summaryNumbersLost, checkFacts } from '../reportStyle';
import { shareReportPdf } from '../reportPdf';

// The app's built-in Gemini (aiBuiltin.js), loaded only when the button is pressed.
const rewriteReportWithAi = async (prompt) => (await (await import('../aiBuiltin')).rewriteWithGemini(prompt)).text;
import { isNonWorkingDay, blankEntry, toggleEntryDar, RECURRENCES, RECURRENCE_LABELS, RECURRENCE_PRESETS, recurrenceLabel, nextRecurringEntry, dashboardStats, groupCounts, toDateKey, quickDueOptions, EMPTY_WD_FILTER, ANY, DUE_WITHIN_OPTIONS, isDueInNext7Days, DUE_TILL_TODAY, isDueThisMonth, isDueNextMonth, isWdFilterActive, filterEntries, SORTS, sortEntries, completeEntry, reopenEntry, binEntry, restoreEntry, isOpen, isOverdue, editedNow, completedTime, DONE_SORTS, holidaysWithinDays, normalizeHolidays, normalizeLeaveDays, nextFreeSlot, ALERT_MODES, alertModeOf, autoSkipDailyOnNonWorking } from '../workingDashboard';
import { useTabHistory } from '../useStepBack';
import WdWeeklyReview from './WdWeeklyReview';
import { fmtDate, fmtDateTime, StatTile, PRIORITY_COLOR, fmtDue, GRID, SEARCH_PLACEHOLDER, WEB_DAR, gridCount, CardGrid, EntryRow, UndoBar, ShowMore, CountList, PhoneKpi, PhoneRow, PhoneDoneRow, PhoneHeader, Fab, SectionHead } from './wdCards';

// Shared empties: a fresh [] / {} on each render made the memos below recompute every time.
const NO_LIST = [];

// One-tap wording for Rewrite with AI (Daily Report); the text lands in the instructions box and can be edited.
const REPORT_PRESETS = [
  { label: 'Formal', text: 'Write in a formal, professional tone suitable for senior management.' },
  { label: 'Two lines per task', text: 'Write two lines for each task, in a formal, professional way: what was done, then the outcome or next step.' },
  { label: 'Short', text: 'Keep each bullet to one short line.' },
  { label: 'Detailed', text: 'Give each task a fuller description of what was done, with the people and banks involved, in a formal tone.' },
];

// web.app only, and not on phone-width screens: a Narration tab after the Bin - the Tally narration builder, whatever an entry's status.
const makeTabKeys = (narration) => ['dashboard', 'register', 'done', 'holidays', 'config', 'bin', 'more', ...(narration ? ['narration'] : []), 'links', 'report'];
// Bottom bar, same order as the web app (Report is reached from the Dashboard).
const makeBarTabs = (narration) => [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'register', label: 'Register' },
  { key: 'done', label: 'Completed' },
  { key: 'holidays', label: 'Holidays' },
  { key: 'config', label: 'Config' },
  { key: 'bin', label: 'Bin' },
  ...(narration ? [{ key: 'narration', label: 'Narration', icon: 'list' }] : []),
  { key: 'links', label: 'Links', icon: 'links' },
];
// The phone's bottom bar: five tabs; Holidays, Bin and Config are reached from More.
const PHONE_TABS = [
  { key: 'dashboard', label: 'Home' },
  { key: 'register', label: 'Tasks' },
  { key: 'report', label: 'Report' },
  { key: 'done', label: 'Done' },
  { key: 'more', label: 'More' },
];
const MORE_PAGES = ['holidays', 'bin', 'config', 'links'];      // pages opened from More: the header shows a back arrow to it
const TAB_TITLES = { more: 'More', dashboard: 'Dashboard', register: 'Register', done: 'Completed', holidays: 'Holidays', config: 'Config', bin: 'Bin', narration: 'Tally Narration', links: 'Links', report: 'Daily Report' };
// The phone's own screen titles (Ledger): the serif title at the top of each screen.
const PHONE_TITLES = { more: 'More', register: 'Tasks', done: 'Completed', holidays: 'Holidays & leave', config: 'Config', bin: 'Bin', links: 'Links', report: 'Daily report' };
export default function WorkingDashboard() {
  const insets = useSafeAreaInsets();
  const { wide, tablet: tabletWidth, sideBar } = useLayout();
  // "Both" (the APK and the website on a phone): Config, Register, Completed and Holidays use their phone layouts -
  // one column, laid out like the web app's (Config as one page with every section open, not a list of sheets).
  const phoneLayout = !tabletWidth;
  // "Both" (phone-width screens): no New / Edit Entry form and no Narration tab - the owner removed them there.
  const formOn = true;      // the New / Edit Entry form opens on a phone too: the owner wants every card to open
  const TAB_KEYS = makeTabKeys(Platform.OS === 'web' && !phoneLayout);
  const BAR_TABS = phoneLayout ? PHONE_TABS : makeBarTabs(Platform.OS === 'web' && !phoneLayout);
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
  const plists = useMemo(() => { const l = paymentLists(wd, wd.categories); return withWebNarrationTypes(l); }, [wd.subCategories, wd.subCategoryCategories, wd.narrationTypes, wd.categories]); // eslint-disable-line react-hooks/exhaustive-deps
  const entries = wd.entries || NO_LIST;
  const followToday = useMemo(() => followUpsDueToday(entries), [entries]);
  const byBank = useMemo(() => followUpsByBank(entries), [entries]);
  // The newest stored copy of each entry, for handlers whose card may have drawn an older one.
  const entriesRef = useRef(entries);
  entriesRef.current = entries;
  const openEntries = useMemo(() => entries.filter(isOpen), [entries]);

  // Back steps through the tabs you visited (a card opens Register; Back returns to Dashboard).
  // Back to the Dashboard also drops the filter a card applied, so Register opens unfiltered next time.
  const [tab, setTab] = useTabHistory('dashboard', (to) => { setVisibleCount(5); if (to === 'dashboard') { setFilters(EMPTY_WD_FILTER); setQuickView(''); } });
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
  const [accOpen, setAccOpen] = useState({});           // phone form: which folded rows (checklist, mail chain, notes...) the person opened
  const [recurrenceOpen, setRecurrenceOpen] = useState(false);
  const [holidaySheet, setHolidaySheet] = useState(null);
  const [checklistSheet, setChecklistSheet] = useState(null);  // web.app: { id, opts } - the checklist shown before ✓ / DAR completes a task
  const [followSheet, setFollowSheet] = useState(null);     // a bank follow-up from a card's 📞: { id, remarks, next }
  const [narrationPage, setNarrationPage] = useState({ typeName: '', includeMail: false });      // web.app's Narration tab
  const [narrationMail, setNarrationMail] = useState('');
  const [narrationEntry, setNarrationEntry] = useState(null);      // an entry picked on the Narration tab, or null
  const [narrationFind, setNarrationFind] = useState('');
  const [linkDraft, setLinkDraft] = useState({ id: '', title: '', url: '', folder: '' });      // web.app's Links tab
  const colItem = Platform.OS === 'web' && wide ? { breakInside: 'avoid' } : undefined;      // a dashboard panel inside the CSS columns
  const tableView = (Platform.OS !== 'web' || wide) && !!wd.tableView;      // web.app: Register / Completed as a table
  // APK: without "Open over other apps" (or full-screen alarms) Android shows an alarm only as a stacked notification to tap.
  // A banner on the dashboard says so and fixes it in one tap; it checks again whenever the app comes back to the front.
  const [alarmBlock, setAlarmBlock] = useState('');
  const [alarmChecked, setAlarmChecked] = useState(false);      // '' = fine; 'overlay' | 'fullscreen' = what to allow
  useEffect(() => {
    if (Platform.OS === 'web' || !trackerAvailable()) return undefined;
    const look = async () => {
      const [overlay, fsi] = await Promise.all([canDrawOverlays(), isFullScreenIntentAllowed()]);
      setAlarmBlock(!overlay ? 'overlay' : !fsi ? 'fullscreen' : '');
      setAlarmChecked(true);
    };
    look();
    const sub = AppState.addEventListener('change', (st) => { if (st === 'active') look(); });
    return () => sub.remove();
  }, []);
  // First run on the phone: one screen about the alarm permission (see WdAlarmIntro); nothing when it is already allowed.
  const introNeeded = Platform.OS !== 'web' && !wd.alarmIntroSeen && !!alarmBlock;
  useEffect(() => {
    if (Platform.OS !== 'web' && !wd.alarmIntroSeen && alarmChecked && !alarmBlock) updateWd((w) => ({ ...w, alarmIntroSeen: true }));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- when the permission check has answered.
  }, [alarmChecked, alarmBlock, wd.alarmIntroSeen]);
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

  // Cloud Sync / Gmail / AI Daily Report
  const [mailBusy, setMailBusy] = useState(false);
  const [mailQuery, setMailQuery] = useState('');
  const [emails, setEmails] = useState([]);
  const [moreCounts, setMoreCounts] = useState(false);
  const [reportDate, setReportDate] = useState(toDateKey(new Date()));
  const [shareOpen, setShareOpen] = useState(false);     // phone Report: the Email / PDF / Excel sheet
  const [aiOpen, setAiOpen] = useState(false);       // phone Report: the AI instructions row, folded until opened
  const [reportText, setReportText] = useState('');
  const [reportKind, setReportKind] = useState('day');      // 'day' (the Daily Activity Report), 'week' or 'month' (a summary)
  const [reportModel, setReportModel] = useState(null);
  const [narrOpen, setNarrOpen] = useState(false);       // the form's Final Narration popup
  const [stepsOpen, setStepsOpen] = useState(false);       // the form's Checklist popup
  const [detailSheet, setDetailSheet] = useState(null);      // the form's MORE DETAILS popup: 'alert' | 'deadline' | 'reminder' | 'mail' | 'history'
  const [monthEndOpen, setMonthEndOpen] = useState(false);   // the form's Month end -1 ... -5 drop-down
  const [subPop, setSubPop] = useState(null);       // Home: a category's Sub Categories ({ category, due, list })
  const [groupOpen, setGroupOpen] = useState('');   // the Report box whose tasks are shown (oth / pay / fol / out)
  const [reportNote, setReportNote] = useState('');
  const [aiBusy, setAiBusy] = useState(false);
  const [mailSheet, setMailSheet] = useState(false);

  // Realtime Sync (Firestore + Google Sign-In)
  const { user: googleUser, listenError, pushError } = useRealtimeStatus();      // the sync itself runs app-wide (RealtimeSync.js)
  // Fetch Mail reads Gmail with the person's own Google sign-in.
  const mailAvailable = !!googleUser;
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
  const userLabel = String(googleUser?.displayName || googleUser?.email || 'Local').trim().split(/[\s@]/)[0] || 'Local';
  const waiting = !!googleUser && (browserOffline || !!pushError);
  const wdRef = useRef(wd);
  wdRef.current = wd;

  /* ---------- derived ---------- */
  const stats = useMemo(() => dashboardStats(entries), [entries]);
  const thisMonthEntries = useMemo(() => openEntries.filter((e) => isDueThisMonth(e)), [openEntries]);
  const nextMonthEntries = useMemo(() => openEntries.filter((e) => isDueNextMonth(e)), [openEntries]);
  // Whatever shape the web app stored (names, date formats) is read into one clean shape here.
  const holidayList = useMemo(() => normalizeHolidays(wd.holidays), [wd.holidays]);
  const leaveList = useMemo(() => normalizeLeaveDays(wd.leaveDays), [wd.leaveDays]);
  const offDays = useMemo(() => ({ holidays: holidayList, leaveDays: leaveList }), [holidayList, leaveList]);
  const upcomingHolidays = useMemo(() => holidaysWithinDays(holidayList, new Date(), 7), [holidayList]);

  // "Both" (phone-width screens): search also finds banker remarks and the narration.
  const filteredOpen = useMemo(() => sortEntries(filterEntries(openEntries, filters, new Date(), { deep: phoneLayout }), sortBy), [openEntries, filters, sortBy, phoneLayout]);
  const doneSort = wd.doneSort || 'completedDesc';
  const allDone = useMemo(() => entries.filter((e) => e.done && !e.binned), [entries]);
  const doneEntries = useMemo(() => sortEntries(filterEntries(allDone, doneFilters, new Date(), { deep: phoneLayout }), doneSort), [allDone, doneFilters, doneSort, phoneLayout]);
  const doneNarrowed = isWdFilterActive(doneFilters) || doneSort !== 'completedDesc';
  const clearDone = () => { setDoneFilters(EMPTY_WD_FILTER); setVisibleCount(5); if (wd.doneSort && wd.doneSort !== 'completedDesc') updateWd((w) => ({ ...w, doneSort: 'completedDesc' })); };
  // Home (phone): what needs doing now, and what comes next.
  const attention = useMemo(() => sortEntries(openEntries.filter((e) => isOverdue(e) || (e.dueAt && toDateKey(new Date(e.dueAt)) === toDateKey(new Date()))), 'dueAsc').slice(0, 5), [openEntries]);
  const comingUp = useMemo(() => {
    const now = new Date(); const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 8).getTime(); const from = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime();
    return sortEntries(openEntries.filter((e) => { const d = e.dueAt ? new Date(e.dueAt).getTime() : 0; return d >= from && d < end; }), 'dueAsc').slice(0, 4);
  }, [openEntries]);
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
  const shownCount = Platform.OS === 'web' ? webBatch : tabletWidth ? gridCount(visibleCount) : visibleCount;      // the Bin's grid card layout, where the web shows a grid
  const doneTodayCount = useMemo(() => entries.filter((e) => e.done && !e.binned && completedTime(e) && toDateKey(new Date(completedTime(e))) === toDateKey(new Date())).length, [entries]);
  const darTodayCount = useMemo(() => entries.filter((e) => e.done && !e.binned && e.dar !== false && completedTime(e) && toDateKey(new Date(completedTime(e))) === toDateKey(new Date())).length, [entries]);
  // The phone's Register chips: All / Overdue / Today / Week.
  const [quickView, setQuickView] = useState('');
  const todayKey = toDateKey(new Date());
  const quickCounts = useMemo(() => ({ late: filteredOpen.filter((e) => isOverdue(e)).length, today: filteredOpen.filter((e) => e.dueAt && toDateKey(new Date(e.dueAt)) === todayKey).length, week: filteredOpen.filter((e) => isDueInNext7Days(e)).length }), [filteredOpen, todayKey]);
  const boardRows = quickView && phoneLayout ? filteredOpen.filter((e) => (quickView === 'late' ? isOverdue(e) : quickView === 'week' ? isDueInNext7Days(e) : e.dueAt && toDateKey(new Date(e.dueAt)) === todayKey)) : filteredOpen;
  const visibleRegister = boardRows.slice(0, shownCount);
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

  // The Category / Priority / Status / Pending with lists and the Sub Category / reminder lists: stamped, so they are sent to the account.
  const saveLists = (patch) => updateWd((w) => ({ ...w, ...patch, listsUpdatedAt: Date.now() }));

  const pushLog = (w, title, details = '', auto = true) => ({
    ...w,
    activityLog: [{ id: uid(), at: new Date().toISOString(), title, details, auto }, ...(w.activityLog || [])].slice(0, 500),
  });

  /* ---------- entry CRUD ---------- */
  /** A Home tile: the Tasks list with ONLY that filter (no leftover filter or chip). */
  const openRegister = (patch = {}) => { setFilters({ ...EMPTY_WD_FILTER, ...patch }); setQuickView(''); setVisibleCount(5); setTab('register'); };
  // Pull down on any tab: read the website's edits now and rebook the alerts (the same job the background refresh does).
  const pullRefresh = () => refreshWdAlerts({ pull: true, wd });
  // The Refresh button in the app bar: the same read as pulling down, plus a look for a new version of the app.
  const [headerBusy, setHeaderBusy] = useState(false);
  const headerRefresh = async () => {
    setHeaderBusy(true);
    let msg = 'Latest data loaded.';
    try { await pullRefresh(); } catch (e) { msg = `Could not reach the server: ${e && e.message ? e.message : 'no connection?'}`; }
    if (Platform.OS !== 'web') { try { msg += ` ${await checkForPhoneUpdate()}`; } catch { /* the update check is optional */ } }
    setHeaderBusy(false);
    Alert.alert('Refresh', msg);
  };
  const goTab = (k) => { setTab(k); setVisibleCount(5); if (k === 'report' && (!reportModel || reportKind === 'day')) buildReport(); };
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
  // A New entry opens with what was typed last time (closed form, killed app); Reset or Save clears it.
  const draftId = useRef(null);
  const draftBlank = useRef(null);
  const openNewEntry = async () => {
    if (!formOn) return;
    setAccOpen({});
    const blank = blankEntry();
    draftBlank.current = blank; draftId.current = blank.id;
    setEntrySheet(withDrafts(applyDraft(blank, await loadEntryDraft())));
  };
  const resetNewEntry = () => { const blank = blankEntry(); draftBlank.current = blank; draftId.current = blank.id; clearEntryDraft(); setEntrySheet(withDrafts(blank)); };
  useEffect(() => { if (entrySheet && draftId.current === entrySheet.id && draftBlank.current) saveEntryDraft(entrySheet, draftBlank.current); }, [entrySheet]);
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
  const [showAudit, setShowAudit] = useState(false);      // the task's history, opened in the entry form
  const [stepDraft, setStepDraft] = useState('');      // the checklist step being typed in the entry form
  const payMonthKey = (() => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - payMonth); return toDateKey(d).slice(0, 7); })();
  const payTotals = useMemo(() => paymentsByVendor(entries, plists, payMonthKey), [entries, plists, payMonthKey]);
  const qa = { dateOrder: (wd.quickAdd || {}).dateOrder || 'dmy', dateOnlyTime: (wd.quickAdd || {}).dateOnlyTime || '' };
  const quickParsed = useMemo(() => (quickText.trim() ? parseQuickAdd(quickText, { categories: wd.categories || [], assignees: wd.assignees || [], ...qa }) : null), [quickText, wd.categories, wd.assignees, qa.dateOrder, qa.dateOnlyTime]);
  const quickAdd = (text = quickText) => {
    const p = parseQuickAdd(text, { categories: wd.categories || [], assignees: wd.assignees || [], ...qa });
    if (!formOn || (!p.title && !p.dueAt)) return;
    const base = blankEntry();
    setEntrySheet(withDrafts({ ...base, title: p.title || String(text).trim(), ...(p.priority ? { priority: p.priority } : null), ...(p.category ? { category: p.category } : null), ...(p.pendingWith ? { pendingWith: p.pendingWith } : null), ...(p.dueAt ? { dueAt: p.dueAt } : null), ...(p.reference ? { reference: p.reference } : null) }));
    setQuickText('');
  };
  const formBase = useRef(null);      // the entry as the form opened it, so Save writes only what the person changed
  const openEditEntry = (entry, patch = {}) => { if (!formOn) return; setAccOpen({}); const opened = { ...withDrafts(entry), ...patch }; formBase.current = opened; setEntrySheet(opened); };
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
      row = addBankFollowUp(row, { statuses: wd.statuses, remarks: followUpDraft.remarks, bank: followUpDraft.bank ?? was.bank, banker: followUpDraft.banker ?? was.banker, next: row.done ? null : (followUpDraft.next || defaultNextFollowUp(prev || row, now, offDays)) }, now);
    }
    // Audit trail: what this save changed, and from which device.
    row = { ...row, audit: addAudit(prev ? prev.audit : [], auditDiff(prev || null, row), Platform.OS === 'web' ? 'web' : 'phone', now.getTime()) };
    return row;
  };

  const saveEntry = (patch) => {
    // A button may complete the task from the form: { status: 'Completed', dar } (a Save button passes a press event, ignored).
    const d = patch && patch.status ? { ...entrySheet, ...patch } : entrySheet;
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
    if (draftId.current === d.id) { draftId.current = null; clearEntryDraft(); }
    let row = { ...finalizeDraft(d), ...editedNow() };
    const isNew = !entries.some((x) => x.id === row.id);
    const prev = entries.find((x) => x.id === row.id);
    // Only the fields the person changed in the form are written onto the newest copy, so an edit made on the website
    // (or an alert action) while the form was open is not wiped by Save.
    if (prev && formBase.current && formBase.current.id === row.id) {
      try {
        const was = finalizeDraft(formBase.current);
        const changed = {};
        Object.keys(row).forEach((k) => { if (k !== 'updatedAt' && JSON.stringify(row[k]) !== JSON.stringify(was[k])) changed[k] = row[k]; });
        row = { ...prev, ...changed, ...editedNow() };
      } catch { /* keep the whole draft */ }
    }
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
    scheduleEntryAlert(row, wd.alarmRingtone, wd.alerts).catch(warnQuiet('scheduleEntryAlert'));
    if (rolled) scheduleEntryAlert(rolled, wd.alarmRingtone, wd.alerts).catch(warnQuiet('scheduleEntryAlert'));
    if (row.emailId && isNew) markEmailRead(row.emailId).catch(warnQuiet('markEmailRead'));      // the mail the task came from is marked read once the task exists
    closeEntrySheet();
  };

  /* ---------- undo ---------- */
  const [undo, setUndo] = useState(null);       // { message, before: [entries as they were], addedIds }
  // Every undoable change is also kept (the last 25, with the task as it was) for Config > Recent Changes.
  const offerUndo = (message, before, addedIds = []) => {
    const item = { id: newId('u-'), message, before, addedIds, at: Date.now() };
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
    u.addedIds.forEach((id) => cancelEntryAlert(id).catch(warnQuiet('WorkingDashboard')));
    u.before.forEach((e) => { if (isOpen(e)) scheduleEntryAlert(e, wd.alarmRingtone, wd.alerts).catch(warnQuiet('scheduleEntryAlert')); else cancelEntryAlert(e.id).catch(warnQuiet('WorkingDashboard')); });
  };

  const act = (shown, kind, opts = {}) => {
    // A short tap-buzz on the phone when a task is completed (the built-in vibrator: no extra library).
    if (Platform.OS !== 'web' && kind === 'complete') { try { Vibration.vibrate(12); } catch { /* no vibrator */ } }
    // web.app: ✓ or DAR on a task with a checklist opens the checklist first, to tick the steps before it is completed.
    if (Platform.OS === 'web' && kind === 'complete' && !opts.checklistOk) {
      const live = entriesRef.current.find((x) => x.id === shown.id) || shown;
      if (checklistOf(live).length) { setChecklistSheet({ id: live.id, opts }); return; }
    }
    // web.app: DAR on a card first asks for the notes that go into the daily report.
    if (Platform.OS === 'web' && kind === 'complete' && opts.dar === true && opts.notes === undefined) {
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
      if (!formOn) { Alert.alert('Sub Category needed', 'This task needs a Sub Category, which is filled in on a tablet or the website on a computer.'); return; }
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
    if (kind === 'complete' || kind === 'bin') cancelEntryAlert(entry.id).catch(warnQuiet('WorkingDashboard'));
    if (rolled) scheduleEntryAlert(rolled, wd.alarmRingtone, wd.alerts).catch(warnQuiet('scheduleEntryAlert'));
    else if (kind === 'reopen') scheduleEntryAlert(applied, wd.alarmRingtone, wd.alerts).catch(warnQuiet('scheduleEntryAlert'));
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
    const item = { remarks: f.remarks, next: f.next, bank: f.bank, banker: f.banker, statuses: wd.statuses };
    const applied = addBankFollowUp(entry, item, new Date());
    updateWd((w) => pushLog({ ...w, entries: w.entries.map((x) => (x.id === entry.id ? addBankFollowUp(x, item, new Date()) : x)) }, 'Followed up', entry.title));
    scheduleEntryAlert(applied, wd.alarmRingtone, wd.alerts).catch(warnQuiet('scheduleEntryAlert'));
    setFollowSheet(null);
  };

  /** 🔔 / 🔕 on a card: this task rings as an alarm, or is a plain reminder - its alerts are booked again at once. */

  const toggleAlert = (shown) => {
    const entry = entriesRef.current.find((x) => x.id === shown.id) || shown;
    const next = { ...entry, alertMode: alertModeOf(entry, wd.alerts) === 'alarm' ? 'gentle' : 'alarm', ...editedNow() };
    updateWd((w) => ({ ...w, entries: w.entries.map((x) => (x.id === entry.id ? { ...x, alertMode: next.alertMode, ...editedNow() } : x)) }));
    scheduleEntryAlert(next, wd.alarmRingtone, wd.alerts).catch(warnQuiet('scheduleEntryAlert'));
  };

  const toggleDar = (shown) => {
    const entry = entriesRef.current.find((x) => x.id === shown.id) || shown;
    updateWd((w) => ({ ...w, entries: w.entries.map((x) => (x.id === entry.id ? toggleEntryDar(x) : x)) }));
    offerUndo(`${entry.dar !== false ? 'Removed from' : 'Added to'} the daily report`, [entry]);
  };

  // The phone Config page shows Report Style Samples open: load them when it is opened.

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
    if (!entry || !isOpen(entry) || !formOn) return;
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
    res.moved.forEach((m) => scheduleEntryAlert(m.entry, wd.alarmRingtone, wd.alerts).catch(warnQuiet('scheduleEntryAlert')));
    const m = res.moved[0];
    offerUndo(res.moved.length === 1 ? `“${m.entry.title}” (daily) skipped for ${fmtDate(m.off)} - next on ${fmtDate(m.next)}` : `${res.moved.length} daily tasks skipped for ${fmtDate(m.off)} - next on ${fmtDate(m.next)}`, before);
  }, [holidayList, leaveList]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---------- holidays ---------- */
  const openNewHoliday = () => setHolidaySheet({ id: uid(), title: '', date: toDateKey(new Date()), endDate: '', tag: '', officeClosed: true });
  const saveHoliday = () => {
    const h = holidaySheet;
    if (!h.title.trim() || !h.date) return Alert.alert('A name and date are needed');
    if (h.endDate && h.endDate < h.date) return Alert.alert('The end date is before the start date');
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

  /* ---------- reminders / time slots / alarm ---------- */

  /* ---------- data backup ---------- */

  /* ---------- Cloud Sync ---------- */

  /* ---------- Gmail Fetch Mail ---------- */
  const closeMail = () => { setMailSheet(false); setMailQuery(''); };
  const openMail = async () => {
    setMailSheet(true);
    if (!mailAvailable) return;
    setMailBusy(true);
    try { setEmails(await fetchUnreadEmails()); }
    catch (e) { Alert.alert('Could not fetch mail', e.message); }
    finally { setMailBusy(false); }
  };
  const ignoreEmail = (email) => {
    setEmails((list) => list.filter((e) => e.id !== email.id));
    markEmailRead(email.id).catch(warnQuiet('markEmailRead'));
  };
  const addTaskFromEmail = async (email) => {
    closeMail();
    if (!formOn) return;
    const draft = emailToEntryDraft(email);
    // The web app keeps the mail's id on the task (emailId), so it can open the original mail.
    setEntrySheet({ ...withDrafts(draft), emailId: email.id });
    setEmails((list) => list.filter((e) => e.id !== email.id));      // marked read in Gmail only when the task is saved (commitEntry)
    if (!email.body) {
      try {
        const body = (await fetchEmailBody(email.id)).slice(0, 500);
        setEntrySheet((s) => (s && s.emailId === email.id && !String(s.notes || '').trim() ? { ...s, notes: `From: ${email.sender || ''}\n\n${body}` } : s));
      } catch { /* keep the placeholder note */ }
    }
  };
  const visibleEmails = useMemo(() => filterEmails(emails, mailQuery), [emails, mailQuery]);
  const openEmailInGmail = (email) => Linking.openURL(`https://mail.google.com/mail/u/0/#all/${encodeURIComponent(email.id)}`).catch(warnQuiet('WorkingDashboard'));

  /* ---------- AI Daily Report ---------- */
  const buildReport = (date = reportDate) => {
    const model = buildReportModel({ entries, fixedActivities: wd.fixedActivities, activityLog: wd.activityLog, date, reportPoints: wd.paymentIntro, leaveDays: leaveList, holidays: holidayList, lists: plists,
      // Every line is written from the entry's notes and Tally narration too - the same report as the website (the owner's choice).
      details: true });
    const formats = effectiveFormats(wd.reportFormats);
    applyFormats(model, formats, { darPaymentIntro: wd.paymentIntro });
    applyMoves(model, (wd.reportMoves || {})[date] || {}, { lists: { darPaymentIntro: wd.paymentIntro }, payLists: plists, formats, date, details: true });
    if (reportOpts.subFields) addSubFields(model);
    setReportModel(model);
    // The AI rewrite is kept when this is the same date and the report's facts did not change (compared on the full-heading draft the AI was given).
    const draftNow = reportModelToText(model, { headings: true });
    const keepAi = !!reportAlt && reportAlt.date === date && reportAlt.draft === draftNow;
    if (!keepAi) setReportAlt(null);
    // The pending list ("Pending:" - open tasks due by this day, by priority) is added when switched on, as on the website.
    const pend = reportOpts.pending ? entries.filter((e) => isOpen(e) && e.dueAt && toDateKey(new Date(e.dueAt)) <= date).sort((a, b) => ({ High: 0, Medium: 1, Low: 2 }[a.priority] ?? 3) - ({ High: 0, Medium: 1, Low: 2 }[b.priority] ?? 3)) : [];
    const standardText = reportModelToText(model, { headings: reportOpts.headings }) + (pend.length ? `\n\nPending:\n${pend.map((e) => `* ${e.title}${e.priority ? ` [${e.priority}]` : ''}`).join('\n')}` : '');
    if (keepAi) {
      setReportAlt({ ...reportAlt, standard: standardText });      // only a display switch changed: the AI text stays
      setReportText(reportAlt.showing === 'ai' ? reportAlt.ai : standardText);
    } else {
      setReportText(standardText);
      setReportNote(reportAlt ? 'The report changed - rewrite with AI again' : '');
    }
    setReportKind('day');
    return model;
  };
  const reportOpts = { headings: true, subFields: true, pending: false, ...(wd.reportOpts || {}) };      // the Report's three switches (the website's), this device only
  const setReportOpt = (k) => updateWd((w) => ({ ...w, reportOpts: { ...reportOpts, [k]: !reportOpts[k] } }));
  const dayMoves = (wd.reportMoves || {})[reportDate] || {};
  const moveTask = (id, group) => updateWd((w) => ({ ...w, reportMoves: { ...(w.reportMoves || {}), [reportDate]: { ...((w.reportMoves || {})[reportDate] || {}), [id]: group } } }));
  const undoMoves = () => updateWd((w) => { const all = { ...(w.reportMoves || {}) }; delete all[reportDate]; return { ...w, reportMoves: all }; });
  useEffect(() => { if (tab === 'report' && reportKind === 'day' && reportModel) buildReport(); }, [wd.reportMoves, wd.reportOpts]); // eslint-disable-line react-hooks/exhaustive-deps
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
      const ai = await rewriteReportWithAi(prompt);
      const lost = summaryNumbersLost(draft, ai);
      if (!ai.trim() || lost.length) { setReportNote(`AI version was not used${lost.length ? ` - it lost ${lost.length} number(s) such as ${lost[0]}` : ''}. Showing the standard summary.`); return; }
      setReportAlt({ standard: draft, ai: ai.trim(), showing: 'ai' });
      setReportText(ai.trim());
      setReportNote('Rewritten with AI - every number is kept. Use "Show the standard version" to compare.');
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
      const prompt = buildStylePrompt(model, draft, wd.reportAiNotes || '');
      let ai = await rewriteReportWithAi(prompt);
      // As on the web app: merged section by section - payments, duty and import lines stay word for word, and a
      // section the AI shortened keeps the standard wording. Mail chains it copied in are taken out.
      const mails = entries.map((x) => String(x.reference || '').trim()).filter((x) => x.length > 6);
      const merged = mergeAiReport(model, ai, mails);
      if (merged && merged.ai) ai = merged.text;
      const verdict = verifyAiRewrite(model, ai);
      if (!verdict.ok) { setReportNote(`AI version was not used (it ${merged ? 'shortened every section' : verdict.reason}) — showing the complete standard report.`); return; }
      const facts = checkFacts(model, ai);
      if (!facts.ok) { setReportNote(`AI version was not used — it lost ${facts.missing.length} fact(s) such as "${facts.missing[0].fact}". Showing the complete standard report.`); return; }
      setReportAlt({ standard: reportModelToText(model), ai, showing: 'ai', date: model.date, draft });
      setReportText(ai);
      setReportNote(`Rewritten with AI — every item, amount, name and reference checked present.`);
    } catch (e) {
      setReportNote(`AI not available right now (${e.message}) — showing the complete standard report.`);
    } finally { setAiBusy(false); }
  };
  const copyReport = async () => { await Clipboard.setStringAsync(reportText); Alert.alert('Copied', 'Report copied to the clipboard.'); };

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
  // A saved, open task: Done / DAR / Save in one bar (the phone's way); a new or finished one: Cancel / Save.
  const completableForm = !!entrySheet && phoneLayout && entries.some((x) => x.id === entrySheet.id && isOpen(x));
  const entryButtons = completableForm ? (
    <Row gap={8}>
      <Btn style={{ flex: 1 }} kind="neutral" title="Done" onPress={() => saveEntry({ status: 'Completed', dar: false })} />
      <Btn style={{ flex: 1 }} kind="soft" title="DAR" onPress={() => saveEntry({ status: 'Completed', dar: true })} />
      <Btn style={{ flex: 1.4 }} title="Save" onPress={() => saveEntry()} />
    </Row>
  ) : (
    <Row gap={10}>
      {draftId.current === entrySheet?.id && <Btn style={{ flex: 1 }} kind="soft" title="Reset" onPress={resetNewEntry} />}
      <Btn style={{ flex: 1 }} kind="neutral" title="Cancel" onPress={closeEntrySheet} />
      <Btn style={{ flex: 2 }} title="Save entry" onPress={() => saveEntry()} />
    </Row>
  );
  const renderEntryForm = () => {
    // Each field as the form has always drawn it; the Row-pair children keep their { flex: 1 } wrapper.
    const isNew = !entries.some((x) => x.id === entrySheet.id);
    const f = {
      // A new task can start from a saved template; any task can be saved as one.
      templates: isNew && (wd.templates || []).length ? (
        <View style={{ marginBottom: 12 }}>
          <Label>START FROM A TEMPLATE</Label>
          <Row style={{ flexWrap: 'wrap', gap: 6 }}>
            {(wd.templates || []).map((tp) => (
              <View key={tp.id} style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: t.tint, borderRadius: 999 }}>
                <Pressable onPress={() => setEntrySheet((d) => withDrafts(applyTemplate(d, tp)))} accessibilityRole="button" accessibilityLabel={`Use template ${tp.name}`} style={{ paddingHorizontal: 12, paddingVertical: 8 }}>
                  <Text style={{ color: t.tintText, fontWeight: '700', fontSize: t.fs(12.5) }} numberOfLines={1}>{tp.name}</Text>
                </Pressable>
                <Pressable onPress={() => setTools((w) => ({ ...w, templates: (w.templates || []).filter((x) => x.id !== tp.id) }))} hitSlop={6} accessibilityLabel={`Delete template ${tp.name}`} style={{ paddingRight: 10 }}>
                  <Icon name="close" size={13} color={t.tintText} stroke={2.4} />
                </Pressable>
              </View>
            ))}
          </Row>
        </View>
      ) : null,
      saveTemplate: String(entrySheet.title || '').trim() ? (
        <Pressable onPress={() => { setTools((w) => ({ ...w, templates: saveTemplate(w.templates || [], templateFrom(entrySheet)) })); Alert.alert('Template saved', `"${String(entrySheet.title).trim()}" is now a template - start a new task from it in the New Entry form.`); }} hitSlop={6} style={{ alignSelf: 'flex-start', marginTop: -6, marginBottom: 12 }}>
          <Small style={{ color: t.primary, fontWeight: '800' }}>Save as template</Small>
        </Pressable>
      ) : null,
      title: (
            <Field label="TASK DESCRIPTION" multiline compact value={entrySheet.title} onChangeText={(v) => setEntrySheet({ ...entrySheet, title: v })} placeholder={phoneLayout ? 'What needs doing?' : 'e.g. Follow up on LC opening'} />
      ),
      category: (
              <View style={{ flex: 1 }}><OptionPicker editChip={!phoneLayout} label="CATEGORY" source={SOURCES.wdCategory} value={entrySheet.category} onChange={(v) => setEntrySheet({ ...entrySheet, category: v })} placeholder={phoneLayout ? 'Select' : 'Select category'} /></View>
      ),
      priority: (
              phoneLayout
        ? <PrioritySegment options={SOURCES.wdPriority.read(data).map((o) => o.value)} value={entrySheet.priority} onChange={(v) => setEntrySheet({ ...entrySheet, priority: v })} />
        : <View style={{ flex: 1 }}><OptionPicker editChip label="PRIORITY" source={SOURCES.wdPriority} value={entrySheet.priority} onChange={(v) => setEntrySheet({ ...entrySheet, priority: v })} /></View>
      ),
      status: (
              phoneLayout
        // Phone: Status is a pill under MORE DETAILS that opens the list straight away.
        ? <OptionPicker source={SOURCES.wdStatus} value={entrySheet.status} onChange={(v) => setEntrySheet({ ...entrySheet, status: v })} trigger={({ open, text }) => <DetailChip icon="refresh" label={text ? `Status · ${text}` : 'Status'} filled={!!text} onPress={open} />} />
        : <View style={{ flex: 1 }}><OptionPicker editChip label="STATUS" source={SOURCES.wdStatus} value={entrySheet.status} onChange={(v) => setEntrySheet({ ...entrySheet, status: v })} /></View>
      ),
      pendingWith: (
              <View style={{ flex: 1 }}><OptionPicker editChip={!phoneLayout} label="PENDING WITH" source={SOURCES.wdAssignee} value={entrySheet.pendingWith} onChange={(v) => setEntrySheet({ ...entrySheet, pendingWith: v })} placeholder={phoneLayout ? 'Select' : 'Select person'} /></View>
      ),
      mail: (
              <View style={{ flex: 1 }}>
                <Label>MAIL CHAIN / REFERENCE</Label>
                <Row gap={6} style={{ alignItems: 'flex-start' }}>
                  <View style={{ flex: 1 }}><Field style={{ marginBottom: 0 }} value={entrySheet.reference} onChangeText={(v) => setEntrySheet({ ...entrySheet, reference: v })} placeholder="e.g. Ticket #1234" /></View>
                  <Pressable
                    accessibilityLabel="Copy mail chain"
                    disabled={!entrySheet.reference}
                    onPress={async () => { await Clipboard.setStringAsync(entrySheet.reference); Alert.alert('Copied', 'Mail chain copied.'); }}
                    style={{ width: 46, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: t.tint, opacity: entrySheet.reference ? 1 : 0.4 }}
                  ><Icon name="copy" size={19} color={t.tintText} stroke={1.9} /></Pressable>
                </Row>
              </View>
      ),
      recurrence: (
              <View style={{ flex: 1 }}>
                <Label>RECURRENCE</Label>
                <PickerButton text={recurrenceLabel(entrySheet)} onPress={() => setRecurrenceOpen(true)} />
              </View>
      ),
      payment: (
            <>
            {/* The web app's payment sections: Import details, Sub Category, Tally Narration - each only when it applies. */}
            {/* "Both" (phone-width screens): the narration type used last time for this category starts picked. */}
            <PaymentFields draft={entrySheet} setDraft={setEntrySheet} lists={plists} rememberedType={phoneLayout ? (wd.narrationByCategory || {})[entrySheet.category] || '' : ''} />
            {(() => {
              // "Final Narration": the narration of this task's report line (a Payments category whose Sub Category has a report format), in a popup.
              const n = finalNarration(entrySheet, effectiveFormats(wd.reportFormats));
              if (!n) return null;
              return (
                <>
                  <Pressable onPress={() => setNarrOpen(true)} accessibilityRole="button" style={{ alignSelf: 'flex-start', backgroundColor: t.surfaceAlt, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 14, marginBottom: 12 }}>
                    <Text style={{ color: t.text, fontWeight: '800', fontSize: t.fs(13.5) }}>Final Narration{n.missing.length ? ` · ${n.missing.length} to fill` : ''}</Text>
                  </Pressable>
                  <Sheet visible={narrOpen} onClose={() => setNarrOpen(false)} title="Final Narration">
                    <Text selectable style={{ color: t.text, fontSize: t.fs(14.5), marginBottom: 8 }}>{n.text}</Text>
                    {n.missing.length > 0 && <Small style={{ marginBottom: 8 }}>Still to fill: {n.missing.join(', ')}</Small>}
                    <Row gap={8}>
                      <Btn kind="soft" title="Copy" onPress={async () => { await Clipboard.setStringAsync(n.text); Alert.alert('Copied', 'Narration copied.'); }} />
                      <Btn title="Done" onPress={() => setNarrOpen(false)} />
                    </Row>
                  </Sheet>
                </>
              );
            })()}
            {followUpHere && isBankFollowUpCategory(entrySheet.category) && entries.some((x) => x.id === entrySheet.id) && (
              <BankFollowUpForm holidays={holidayList} leaveDays={leaveList} quickRemarks={wd.followUpRemarks} onQuickRemarks={(list) => updateWd((w) => ({ ...w, followUpRemarks: list }))} entry={entrySheet} draft={{ ...lastWho(entrySheet), ...(entrySheet.followUpDraft || {}), next: entrySheet.followUpDraft?.next || defaultNextFollowUp(entrySheet, new Date(), offDays) }}
                onChange={(patch) => setEntrySheet((d) => ({ ...d, followUpDraft: { ...(d.followUpDraft || {}), ...patch } }))} />
            )}
            </>
      ),
      custom: (
            <>
            {entrySheet.recurrence === 'custom' && (
              <View style={{ marginBottom: 12 }}>
                <Label>REPEAT EVERY (MINUTES)</Label>
                <Row style={{ flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
                  {RECURRENCE_PRESETS.map((m) => {
                    const on = Number(entrySheet.recurrenceEveryMin) === m;
                    return (
                      <Pressable key={m} onPress={() => setEntrySheet({ ...entrySheet, recurrenceEveryMin: m })} style={{ paddingHorizontal: 13, paddingVertical: 8, borderRadius: 999, backgroundColor: on ? t.accent : t.surfaceAlt, borderWidth: 1, borderColor: on ? t.accent : t.border }}>
                        <Text style={{ color: on ? t.onAccent : t.text, fontSize: t.fs(13) }}>{m >= 60 && m % 60 === 0 ? `${m / 60} h` : `${m} min`}</Text>
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
            {phoneLayout ? (
              // Phone: Due date, Month end, Due time and Repeats on ONE line.
              (() => {
                const opts = monthEndOptions(new Date(), (k) => isNonWorkingDay(k, holidayList, leaveList), 5);
                const cur = entrySheet.dueAt ? opts.find((m) => m.key === toDateKey(new Date(entrySheet.dueAt))) : null;
                return (
                  <Row gap={6} style={{ alignItems: 'flex-start' }}>
                    <View style={{ flex: 1.5 }}><DateTimeField dense mode="date" label="DUE DATE" value={entrySheet.dueAt} onChange={(v) => setEntrySheet({ ...entrySheet, dueAt: v })} /></View>
                    <View style={{ flex: 1 }}>
                      <Label dense numberOfLines={1}>MONTH END</Label>
                      <PickerButton dense text={cur ? `-${cur.n}` : '-'} dim={!cur} onPress={() => setMonthEndOpen(true)} />
                    </View>
                    <View style={{ flex: 1 }}><DateTimeField dense mode="time" label="TIME" value={entrySheet.dueAt} onChange={(v) => v && setEntrySheet({ ...entrySheet, dueAt: v })} /></View>
                    <View style={{ flex: 1 }}>
                      <Label dense numberOfLines={1}>REPEATS</Label>
                      <PickerButton dense noChevron text={entrySheet.recurrence && entrySheet.recurrence !== 'none' ? recurrenceLabel(entrySheet) : 'None'} dim={!entrySheet.recurrence || entrySheet.recurrence === 'none'} onPress={() => setRecurrenceOpen(true)} />
                    </View>
                  </Row>
                );
              })()
            ) : <DateTimeField label="DUE DATE & TIME" clearable value={entrySheet.dueAt} onChange={(v) => setEntrySheet({ ...entrySheet, dueAt: v })} />}
            {/* "Both" (phone-width screens): one tap for the usual due times instead of the two pickers. */}
            {phoneLayout && (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 2, marginBottom: 14 }}>
                {quickDueOptions(new Date(), holidayList, leaveList).map(([label, iso]) => {
                  const on = entrySheet.dueAt && Math.abs(new Date(entrySheet.dueAt) - new Date(iso)) < 60000;
                  return (
                    <Pressable key={label} onPress={() => setEntrySheet({ ...entrySheet, dueAt: iso })} accessibilityRole="button" accessibilityLabel={`Due ${label}`}
                      style={{ paddingHorizontal: 11, paddingVertical: 7, borderRadius: 999, backgroundColor: on ? t.primaryDark : t.tint }}>
                      <Text style={{ color: on ? '#fff' : t.tintText, fontSize: t.fs(12.5), fontWeight: '700' }}>{label}</Text>
                    </Pressable>
                  );
                })}
                {!!entrySheet.dueAt && (
                  <Pressable onPress={() => setEntrySheet({ ...entrySheet, dueAt: null })} accessibilityRole="button" accessibilityLabel="Clear the due date" style={{ paddingHorizontal: 11, paddingVertical: 7, borderRadius: 999, backgroundColor: t.surfaceAlt }}>
                    <Text style={{ color: t.text, fontSize: t.fs(12.5), fontWeight: '700' }}>No date</Text>
                  </Pressable>
                )}
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
      reminder: (Array.isArray(wd.reminderCategories) && wd.reminderCategories.includes(entrySheet.category)) ? (
            <DateTimeField label="NEXT REMINDER (date and time)" clearable value={entrySheet.nextReminderAt} onChange={(v) => setEntrySheet({ ...entrySheet, nextReminderAt: v })} />
      ) : null,
      alert: (
            <>
            {/* This task's own alert: a ringing alarm for urgent work, a plain notification for the rest. */}
            <Label>ALERT</Label>
            <Segmented options={ALERT_MODES.map((m) => ({ key: m.key, label: m.label }))} value={alertModeOf(entrySheet, wd.alerts)}
              onChange={(v) => setEntrySheet({ ...entrySheet, alertMode: v })} style={{ marginBottom: 4 }} />
            <Small style={{ marginBottom: 12 }}>{(ALERT_MODES.find((m) => m.key === alertModeOf(entrySheet, wd.alerts)) || ALERT_MODES[0]).hint}.</Small>
            </>
      ),
      checklist: (
        <View style={{ marginBottom: 12 }}>
          <Label>CHECKLIST (optional){checklistText(entrySheet) ? ` · ${checklistText(entrySheet)} done` : ''}</Label>
          {(entrySheet.checklist || []).map((c) => (
            <Row key={c.id} gap={8} style={{ alignItems: 'center', marginBottom: 6 }}>
              <Pressable onPress={() => setEntrySheet((d) => ({ ...d, checklist: toggleStep(d.checklist, c.id) }))} accessibilityRole="checkbox" accessibilityState={{ checked: !!c.done }} accessibilityLabel={c.text}
                style={{ width: 24, height: 24, borderRadius: 7, alignItems: 'center', justifyContent: 'center', backgroundColor: c.done ? t.primary : 'transparent', borderWidth: c.done ? 0 : 1.5, borderColor: t.textDim }}>
                {!!c.done && <Icon name="check" size={15} color={t.onAccent} stroke={2.8} />}
              </Pressable>
              <Text style={{ flex: 1, color: c.done ? t.textDim : t.text, textDecorationLine: c.done ? 'line-through' : 'none', fontSize: t.fs(14.5) }}>{c.text}</Text>
              <Pressable onPress={() => setEntrySheet((d) => ({ ...d, checklist: removeStep(d.checklist, c.id) }))} hitSlop={8} accessibilityLabel="Remove step"><Icon name="close" size={16} color={t.textDim} stroke={2.2} /></Pressable>
            </Row>
          ))}
          <Row gap={8}>
            <View style={{ flex: 1 }}><Field style={{ marginBottom: 0 }} value={stepDraft} onChangeText={setStepDraft} placeholder="Add a step..." onSubmitEditing={() => { setEntrySheet((d) => ({ ...d, checklist: addStep(d.checklist, stepDraft) })); setStepDraft(''); }} /></View>
            <Btn kind="soft" title="Add" onPress={() => { setEntrySheet((d) => ({ ...d, checklist: addStep(d.checklist, stepDraft) })); setStepDraft(''); }} />
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
              <Small style={{ width: 44, fontWeight: '700' }}>{a.by === 'web' ? 'web' : 'phone'}</Small>
              <Text style={{ flex: 1, color: t.text, fontSize: t.fs(12.5) }}>{a.what}</Text>
            </Row>
          ))}
        </View>
      ) : null,
      notes: (
            <Field label="NOTES" multiline compact value={entrySheet.notes} onChangeText={(v) => setEntrySheet({ ...entrySheet, notes: v })} placeholder="Additional notes or context..." />
      ),
      dar: (
            <Pressable
              onPress={() => setEntrySheet({ ...entrySheet, dar: entrySheet.dar === false })}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: entrySheet.dar !== false }}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 16, marginBottom: 14, backgroundColor: t.tint }}
            >
              <View style={{ width: 26, height: 26, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: entrySheet.dar !== false ? t.primary : t.surface, borderWidth: entrySheet.dar !== false ? 0 : 2, borderColor: t.primary }}>
                {entrySheet.dar !== false && <Icon name="check" size={16} color={t.onAccent} stroke={2.8} />}
              </View>
              <Text style={{ flex: 1, color: t.tintText, fontSize: t.fs(13.5), fontWeight: '500', lineHeight: t.fs(19) }}>
                <Text style={{ fontWeight: '800' }}>Include in Daily Activity Report</Text> ("Done + DAR") - untick for "Done" only (completed, but left out of the report)
              </Text>
            </Pressable>
      ),
    };
    const isSaved = entries.some((x) => x.id === entrySheet.id);
    const binBtn = isSaved && <Btn kind="danger" title="Bin" onPress={() => { act(entries.find((x) => x.id === entrySheet.id) || entrySheet, 'bin'); closeEntrySheet(); }} />;
    if (!deskForm) {
      // Phone (the APK, and the website below 900px): one column, laid out like the Ledger artboard - description, category and
      // person side by side, priority as three buttons, the due row, notes, then the MORE DETAILS pills that open popups.
      const steps = checklistOf(entrySheet);
      const stepsDone = steps.filter((c) => c.done).length;
      const showReminder = Array.isArray(wd.reminderCategories) && wd.reminderCategories.includes(entrySheet.category);
      const alertMode = ALERT_MODES.find((m) => m.key === alertModeOf(entrySheet, wd.alerts)) || ALERT_MODES[0];
      const dateShort = (iso) => new Date(iso).toLocaleDateString([], { day: 'numeric', month: 'short' });
      const detailTitle = { alert: 'Alert', deadline: 'Deadline', reminder: 'Next reminder', mail: 'Mail chain', history: 'History' }[detailSheet] || '';
      return (
        <View>
          {f.templates}
          {f.title}
          {f.saveTemplate}
          <Row gap={10} style={{ alignItems: 'flex-start' }}>{f.category}{f.pendingWith}</Row>
          {f.priority}
          {f.due}
          {f.slot}
          {f.custom}
          {f.notes}
          <Label>MORE DETAILS</Label>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
            {f.status}
            <DetailChip icon="bell" label={`Alert · ${alertMode.key === 'alarm' ? 'Alarm' : 'Reminder'}`} filled={alertModeOf(entrySheet, wd.alerts) === 'alarm'} onPress={() => setDetailSheet('alert')} />
            <DetailChip icon="calendar" label={entrySheet.deadlineAt ? `Deadline · ${dateShort(entrySheet.deadlineAt)}` : 'Deadline'} filled={!!entrySheet.deadlineAt} onPress={() => setDetailSheet('deadline')} />
            {showReminder && <DetailChip icon="clock" label={entrySheet.nextReminderAt ? `Next reminder · ${dateShort(entrySheet.nextReminderAt)}` : 'Next reminder'} filled={!!entrySheet.nextReminderAt} onPress={() => setDetailSheet('reminder')} />}
            <DetailChip icon="checklist" label={steps.length ? `Checklist · ${stepsDone} of ${steps.length}` : 'Checklist'} filled={!!steps.length} onPress={() => setStepsOpen(true)} />
            <DetailChip icon="mail" label="Mail chain" filled={!!String(entrySheet.reference || '').trim()} onPress={() => setDetailSheet('mail')} />
            {!!f.history && <DetailChip icon="list" label={`History · ${(entrySheet.audit || []).length}`} onPress={() => setDetailSheet('history')} />}
          </View>
          {f.payment}
          {f.dar}
          {!pinSave && entryButtons}
          {!!binBtn && <View style={{ marginTop: 8 }}>{binBtn}</View>}
          <Sheet visible={stepsOpen} onClose={() => setStepsOpen(false)} title="Checklist">
            {f.checklist}
            <Btn style={{ marginTop: 14 }} title="Done" onPress={() => setStepsOpen(false)} />
          </Sheet>
          <Sheet visible={!!detailSheet} onClose={() => setDetailSheet(null)} title={detailTitle}>
            {detailSheet === 'alert' && f.alert}
            {detailSheet === 'deadline' && f.deadline}
            {detailSheet === 'reminder' && f.reminder}
            {detailSheet === 'mail' && f.mail}
            {detailSheet === 'history' && f.history}
            <Btn style={{ marginTop: 14 }} title="Done" onPress={() => setDetailSheet(null)} />
          </Sheet>
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
          {!!f.reminder && gridRow(cell(1, f.reminder, 'n'))}
          {gridRow(cell(1, f.recurrence, 'r'), cell(2, f.mail, 'm'))}
          {f.custom}
          {f.payment}
          {f.checklist}
          {f.notes}
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

  const phoneSubtitle = tab === 'dashboard' || tab === 'report' ? new Date().toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' }) : tab === 'register' ? `${openEntries.length} open` : tab === 'done' ? `${allDone.length} done` : '';

  return (
    <View style={{ flex: 1, paddingLeft: sideBar, backgroundColor: t.bg }}>
    <Screen headerless bottomBar onRefresh={Platform.OS !== 'web' ? pullRefresh : undefined}>
      {/* The phone's app bar: the search and meeting-mode buttons, the signed-in name chip, then the serif title. */}
      {phoneLayout && (
        <PhoneHeader
          title={tab === 'dashboard' ? (new Date().getHours() < 12 ? 'Good morning' : new Date().getHours() < 17 ? 'Good afternoon' : 'Good evening') : PHONE_TITLES[tab] || TAB_TITLES[tab]}
          subtitle={phoneSubtitle}
          userLabel={userLabel}
          onRefresh={headerRefresh}
          onNew={formOn && (tab === 'dashboard' || tab === 'register') ? openNewEntry : undefined}
          refreshing={headerBusy}
          onSearch={() => setPaletteOpen(true)}
          onBell={() => setMeetingOpen(true)}
          bellOn={meetingOn}
          onUser={() => setTab('more')}
          onBack={MORE_PAGES.includes(tab) ? () => setTab('more') : undefined}
        />
      )}
      {!phoneLayout && (
      <>
      {/* web.app: a top bar that stays at the top while the page scrolls. */}
      <Row style={[{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
        Platform.OS === 'web' ? { position: 'sticky', top: 0, zIndex: 20, backgroundColor: t.bar, backdropFilter: 'blur(24px) saturate(180%)', WebkitBackdropFilter: 'blur(24px) saturate(180%)', marginHorizontal: wide ? -28 : tabletWidth ? -20 : -16, paddingHorizontal: wide ? 28 : tabletWidth ? 20 : 16, paddingVertical: 10, marginTop: wide ? -20 : -8, borderBottomWidth: 0.5, borderBottomColor: t.sideEdge } : null]}>
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
              <Text numberOfLines={1} style={{ color: t.text, fontWeight: '800', fontSize: t.fs(26), letterSpacing: -0.6 }}>{TAB_TITLES[tab]}</Text>
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
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: waiting ? t.warn : googleUser && realtimeError ? t.danger : googleUser ? t.ok : t.textDim }} />
          <Text style={{ color: t.textDim, fontWeight: '700', fontSize: t.fs(12) }}>{waiting ? 'offline · edits waiting' : googleUser && realtimeError ? 'sync error' : googleUser ? 'live' : 'local'}</Text>
        </Pressable>
      </Row>
      </>
      )}

      {wd.whatsNewSeen !== WHATS_NEW.id && tab === 'dashboard' && !phoneLayout && (
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
              <Text style={{ color: t.text, fontWeight: '800' }}>Meeting mode until {new Date(holdUntil).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' })}</Text>
              <Small>Alerts are held and ring once when it ends.</Small>
            </View>
            <Btn kind="soft" title="End now" onPress={() => setHold(0)} />
          </Row>
        </Card>
      )}
      {!!alarmBlock && (
        <Card style={{ marginBottom: 12, backgroundColor: blend(t.danger, 0.1, t.surface), borderWidth: 1, borderColor: blend(t.danger, 0.45, t.surface) }}>
          <Text style={{ color: t.danger, fontWeight: '800', fontSize: t.fs(14.5) }}>Alarms cannot open full screen yet</Text>
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
            {phoneLayout ? null : Platform.OS === 'web' ? (
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
            {/* Quick add: type a sentence - "Pay Bank B invoice tomorrow 5pm high" - and the form opens filled in. */}
            {formOn && !phoneLayout && <Card style={{ marginBottom: 12, paddingVertical: 10 }}>
              <Row gap={8} style={{ alignItems: 'center' }}>
                <View style={{ flex: 1 }}>
                  <Field style={{ marginBottom: 0 }} value={quickText} onChangeText={setQuickText} placeholder={phoneLayout ? 'Quick add a task…' : '➕ Quick add: "Pay vendor tomorrow 5pm high"'} onSubmitEditing={() => quickAdd()} returnKeyType="done" />
                </View>
                {!!SpeechApi && <Btn kind={listening ? 'danger' : 'soft'} title={listening ? '● Listening' : '🎤'} onPress={listenOnce} />}
                <Btn title="Add" onPress={() => quickAdd()} disabled={!quickText.trim()} />
              </Row>
              {Platform.OS !== 'web' && !phoneLayout && !quickText && <Small style={{ marginTop: 6 }}>Tip: tap the 🎤 on your keyboard and say it - "Call the bank tomorrow 11am high".</Small>}
              {!!quickParsed && !!describeQuickAdd(quickParsed) && <Small style={{ marginTop: 6 }}>→ {describeQuickAdd(quickParsed)}</Small>}
            </Card>}
            {phoneLayout ? (
              <View style={{ gap: 14 }}>
                {/* The hero panel: how many tasks need you today, and how the day is going. */}
                {(() => {
                  const need = stats.pendingAsOnToday;
                  const total = doneTodayCount + need;
                  const pct = total ? Math.round((doneTodayCount / total) * 100) : 0;
                  return (
                    <Pressable onPress={() => { openRegister({ dueWithin: DUE_TILL_TODAY }); }} accessibilityRole="button" accessibilityLabel={`Today: ${need} ${need === 1 ? 'task needs' : 'tasks need'} you. Open them in Tasks`}
                      style={({ pressed }) => ({ backgroundColor: t.primaryDark, borderRadius: t.heroRadius, paddingTop: 20, paddingHorizontal: 20, paddingBottom: 18, gap: 14, opacity: pressed ? 0.94 : 1 })}>
                      <Text style={{ color: t.mint, fontWeight: '800', fontSize: t.fs(11), letterSpacing: 1.4 }}>TODAY</Text>
                      <Row gap={10} style={{ alignItems: 'baseline' }}>
                        <Text style={{ color: '#fff', fontFamily: display(), fontWeight: '600', fontSize: t.fs(64), lineHeight: t.fs(62), letterSpacing: -2 }}>{need}</Text>
                        <Text style={{ color: t.heroDim, fontWeight: '600', fontSize: t.fs(15) }}>{need === 1 ? 'task needs you' : 'tasks need you'}</Text>
                      </Row>
                      <View style={{ height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.18)', overflow: 'hidden' }}>
                        <View style={{ height: 8, borderRadius: 4, backgroundColor: t.mint, width: `${pct}%` }} />
                      </View>
                      <Row style={{ justifyContent: 'space-between' }}>
                        <Text style={{ color: t.heroDim, fontWeight: '700', fontSize: t.fs(12) }}>{doneTodayCount} of {total} done today</Text>
                        <Text style={{ color: t.heroDim, fontWeight: '700', fontSize: t.fs(12) }}>{darTodayCount} in the daily report</Text>
                      </Row>
                    </Pressable>
                  );
                })()}
                <Row gap={10}>
                  <PhoneKpi tone="red" label="Pending as on Today" value={stats.pendingAsOnToday} onPress={() => { openRegister({ dueWithin: DUE_TILL_TODAY }); }} />
                </Row>
                <Row gap={10}>
                  <PhoneKpi tone="red" label="Overdue" value={stats.overdue} onPress={() => { openRegister({ dueWithin: 'Overdue' }); }} />
                  <PhoneKpi tone="amber" label="Due today" value={stats.dueToday} onPress={() => { openRegister({ dueWithin: 'Today' }); }} />
                  <PhoneKpi tone="slate" label="Next 7 days" value={stats.next7Days} onPress={() => { openRegister({ dueWithin: 'Next 7 Days' }); }} />
                </Row>
                <View>
                  <Pressable onPress={() => setMoreCounts((v) => !v)} hitSlop={8} accessibilityRole="button" accessibilityState={{ expanded: moreCounts }} style={{ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Text style={{ color: t.primary, fontWeight: '700', fontSize: t.fs(13) }}>{moreCounts ? 'Fewer counts' : 'More counts'}</Text>
                    <Icon name={moreCounts ? 'chevronUp' : 'chevronDown'} size={16} color={t.primary} stroke={2.2} />
                  </Pressable>
                  {moreCounts && (
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
                      <PhoneKpi wide label="This Month" value={stats.thisMonth} onPress={() => { openRegister({ dueWithin: 'This Month' }); }} />
                      <PhoneKpi wide label="Next Month" value={stats.nextMonth} onPress={() => { openRegister({ dueWithin: 'Next Month' }); }} />
                      <PhoneKpi wide label="No Due Date" value={stats.noDueDate} onPress={() => { openRegister({ dueWithin: 'No Due Date' }); }} />
                      <PhoneKpi wide label="Pending" value={stats.pending} onPress={() => { openRegister({ status: 'Pending' }); }} />
                      <PhoneKpi wide label="High priority" value={openEntries.filter((e) => e.priority === 'High').length} onPress={() => { openRegister({ priority: 'High' }); }} />
                      <PhoneKpi wide label="Open tasks" value={openEntries.length} onPress={() => { openRegister({}); }} />
                      <PhoneKpi wide label="Done today" value={doneTodayCount} onPress={() => goTab('done')} />
                    </View>
                  )}
                </View>
                <WdWeeklyReview entries={entries} holidays={holidayList} leaveDays={leaveList} onOpen={openEditEntry} />
                {!!attention.length && (
                  <View>
                    <SectionHead title="Needs attention" action="See all" onAction={() => { openRegister({ dueWithin: DUE_TILL_TODAY }); }} />
                    {attention.map((e) => <PhoneRow key={e.id} entry={e} onPress={() => openEditEntry(e)} onDone={() => act(e, 'complete', { dar: false })} onDar={() => act(e, 'complete', { dar: true })} onFollowUp={isBankFollowUpCategory(e.category) ? () => openFollowUp(e) : undefined} />)}
                  </View>
                )}
                {!!comingUp.length && (
                  <View>
                    <SectionHead title="Coming up" />
                    {comingUp.map((e) => <PhoneRow key={e.id} entry={e} onPress={() => openEditEntry(e)} onDone={() => act(e, 'complete', { dar: false })} onDar={() => act(e, 'complete', { dar: true })} onFollowUp={isBankFollowUpCategory(e.category) ? () => openFollowUp(e) : undefined} />)}
                  </View>
                )}
              </View>
            ) : (
            <Row style={{ flexWrap: 'wrap', gap: 10 }}>
              <StatTile index={0} label="Pending as on Today" value={stats.pendingAsOnToday} sub="Overdue + due today" color={t.danger} onPress={() => { openRegister({ dueWithin: DUE_TILL_TODAY }); }} />
              <StatTile index={1} label="Due Today" value={stats.dueToday} sub="Still on the clock" color={t.accent} onPress={() => { openRegister({ dueWithin: 'Today' }); }} />
              <StatTile index={2} label="Overdue" value={stats.overdue} sub="Past the due time" color={t.danger} onPress={() => { openRegister({ dueWithin: 'Overdue' }); }} />
              <StatTile index={3} label="Next 7 Days" value={stats.next7Days} sub="Coming up" color={t.warn} onPress={() => { openRegister({ dueWithin: 'Next 7 Days' }); }} />
              <StatTile index={5} label="Next Month" value={stats.nextMonth} sub={`Due in ${new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1).toLocaleString([], { month: 'long' })}`} color={t.pink || t.accent} onPress={() => { openRegister({ dueWithin: 'Next Month' }); }} />
              <StatTile index={4} label="This Month" value={stats.thisMonth} sub={`Due in ${new Date().toLocaleString([], { month: 'long' })}`} color={t.accent2} onPress={() => { openRegister({ dueWithin: 'This Month' }); }} />
              <StatTile index={5} label="No Due Date" value={stats.noDueDate} sub="Needs a deadline" color={t.textDim} onPress={() => { openRegister({ dueWithin: 'No Due Date' }); }} />
              <StatTile index={6} label="Pending" value={stats.pending} sub="As of now" color={t.warn} onPress={() => { openRegister({ status: 'Pending' }); }} />
            </Row>
            )}

            {/* web.app, wide: the panels flow in two columns (CSS columns), so no column is left with empty space under it. */}
            <View style={Platform.OS === 'web' && wide ? { display: 'block', columnCount: 2, columnGap: 16 } : undefined}>
            {/* Phone-width screens and the whole website: the bank follow-ups to make today, with the banker's last word on each. */}
            {(phoneLayout || Platform.OS === 'web') && !!followToday.length && (
              <View style={colItem}><Card style={{ marginTop: 14 }}>
                <Small style={{ fontWeight: '700', textTransform: 'uppercase', marginBottom: 6 }}>Follow-ups today ({followToday.length})</Small>
                {followToday.map(({ entry, overdue, last, long }, i) => (
                  <Pressable key={entry.id} onPress={() => openFollowUp(entry)} accessibilityRole="button" accessibilityLabel={`Follow up: ${entry.title}`}
                    style={{ paddingVertical: 8, borderTopWidth: i ? 1 : 0, borderTopColor: t.border }}>
                    <Row style={{ alignItems: 'center', gap: 8 }}>
                      <Text style={{ flex: 1, color: t.text, fontWeight: '700', fontSize: t.fs(14) }} numberOfLines={1}>{entry.title}</Text>
                      {/* "Both" (phone-width screens): a long pending follow-up is marked (it is listed first everywhere). */}
                      {phoneLayout && long && <Text style={{ color: t.danger, fontWeight: '800', fontSize: t.fs(12) }}>Long pending</Text>}
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
            {!!byBank.length && (
              <View style={colItem}><Card style={{ marginTop: 14 }}>
                <Small style={{ fontWeight: '700', textTransform: 'uppercase', marginBottom: 8 }}>Bank follow-ups by bank</Small>
                <Row style={{ paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: t.border }}>
                  {['Bank', 'Open', 'Overdue', 'Oldest', 'Long pending'].map((h, i) => (
                    <Text key={h} style={{ flex: i ? 1 : 2, color: t.textDim, fontWeight: '700', fontSize: t.fs(12), textAlign: i ? 'center' : 'left' }}>{h}</Text>
                  ))}
                </Row>
                {byBank.map((g) => (
                  <Pressable key={g.bank} onPress={() => { openRegister({ ...EMPTY_WD_FILTER, bank: g.bank === 'Bank not named' ? '-' : g.bank }); }} accessibilityRole="button"
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
            {<View style={colItem}><WdCalendar entries={entries} holidays={holidayList} leaveDays={leaveList} onOpen={(e) => openEditEntry(e)} /></View>}
            {payTotals.count > 0 && (
              <View style={colItem}>
                <Card style={{ marginTop: 14 }}>
                  <Row style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <Small style={{ fontWeight: '700', textTransform: 'uppercase' }}>Payments by vendor</Small>
                    <Row gap={6}>
                      {[['This month', 0], ['Last month', 1]].map(([label, n]) => (
                        <Pressable key={n} onPress={() => setPayMonth(n)} style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: payMonth === n ? t.accent : t.surfaceAlt }}>
                          <Text style={{ color: payMonth === n ? t.onAccent : t.text, fontWeight: '700', fontSize: t.fs(11.5) }}>{label}</Text>
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
            {[['This Month', thisMonthEntries, 'This month', ['category', 'status', 'priority', 'pendingWith']], ['Next Month', nextMonthEntries, 'Next month', ['category', 'priority']]].map(([due, list, name, fields]) => (
              <View key={due}>
                <Small style={{ fontWeight: '800', textTransform: 'uppercase', marginTop: 14 }}>{name} - {new Date(new Date().getFullYear(), new Date().getMonth() + (due === 'Next Month' ? 1 : 0), 1).toLocaleString([], { month: 'long' })} ({list.length} open)</Small>
                {[['category', 'By Category', (e) => e.category], ['status', 'By Status', (e) => e.status], ['priority', 'By Priority', (e) => e.priority], ['pendingWith', 'Pending Assignments', (e) => e.pendingWith]].filter(([k]) => fields.includes(k)).map(([k, title, keyOf]) => (
                  <View key={k} style={colItem}><CountList title={`${name} - ${title}`} total={list.length} rows={groupCounts(list, keyOf, k === 'pendingWith' ? 'Unassigned' : undefined)} onPress={(v) => { if (k === 'category' && list.some((e) => e.category === v && e.subCategory)) { setSubPop({ category: v, due, list: list.filter((e) => e.category === v) }); return; } openRegister({ [k]: v, dueWithin: due }); }} /></View>
                ))}
              </View>
            ))}

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
            <Btn style={{ marginTop: 14 }} kind="soft" title="Daily Activity Report" onPress={() => goTab('report')} />
          </View>
        )}

        {tab === 'register' && (
          <View>
            <Row gap={10} style={{ alignItems: 'center', marginBottom: 12 }}>
              <SearchField style={{ flex: 1 }} value={filters.query} onChangeText={(v) => setFilter({ query: v })} placeholder="Search tasks" />
              <Pressable
                onPress={() => setShowFilters((v) => !v)}
                accessibilityRole="button"
                accessibilityLabel="Filters"
                style={{ width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: showFilters || isWdFilterActive(filters) ? t.tint : t.surface, borderWidth: 1, borderColor: showFilters || isWdFilterActive(filters) ? t.primary : t.border }}
              >
                <Icon name="sliders" size={20} color={showFilters || isWdFilterActive(filters) ? t.tintText : t.text} stroke={1.9} />
              </Pressable>
            </Row>
            {phoneLayout && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -20, marginBottom: 14 }} contentContainerStyle={{ paddingHorizontal: 20, gap: 8 }}>
                {[['', 'All', filteredOpen.length], ['late', 'Overdue', quickCounts.late], ['today', 'Today', quickCounts.today], ['week', 'Week', quickCounts.week]].map(([k, label, n]) => (
                  <Chip key={k || 'all'} label={label} count={n} on={quickView === k} onPress={() => setQuickView(k)} accessibilityLabel={`${label}, ${n}`} />
                ))}
              </ScrollView>
            )}
            {showFilters && (
              <Card style={{ marginBottom: 12 }}>
              <OptionPicker label="Category" source={SOURCES.wdCategory} value={filters.category === ANY ? null : filters.category} onChange={(v) => setFilter({ category: v || ANY })} allowAny anyLabel="All Categories" />
              <Row gap={10}>
                <View style={{ flex: 1 }}><OptionPicker label="Priority" source={SOURCES.wdPriority} value={filters.priority === ANY ? null : filters.priority} onChange={(v) => setFilter({ priority: v || ANY })} allowAny anyLabel="All Priorities" /></View>
                <View style={{ flex: 1 }}><OptionPicker label="Status" source={SOURCES.wdStatus} value={filters.status === ANY ? null : filters.status} onChange={(v) => setFilter({ status: v || ANY })} allowAny anyLabel="All Statuses" /></View>
              </Row>
              <OptionPicker label="Pending with" source={SOURCES.wdAssignee} value={filters.pendingWith === ANY ? null : filters.pendingWith} onChange={(v) => setFilter({ pendingWith: v || ANY })} allowAny anyLabel="All Pending With" />
              {(() => {
                const used = [...new Set(openEntries.map((e) => e.subCategory).filter(Boolean))].sort();
                if (!used.length && !filters.subCategory) return null;
                return (
                  <View style={{ marginBottom: 10 }}>
                    <Label>Sub category</Label>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                      {[['', 'All'], ...used.map((x) => [x, x]), ['__none', 'None chosen']].map(([v, label]) => (
                        <Pressable key={v || 'all'} onPress={() => setFilter({ subCategory: v })} accessibilityRole="button" accessibilityState={{ selected: filters.subCategory === v }} style={{ paddingVertical: 5, paddingHorizontal: 12, borderRadius: 999, backgroundColor: (filters.subCategory || '') === v ? t.accent : t.surfaceAlt }}>
                          <Text style={{ color: (filters.subCategory || '') === v ? t.onAccent : t.text, fontWeight: '700', fontSize: t.fs(12.5) }}>{label}</Text>
                        </Pressable>
                      ))}
                    </View>
                  </View>
                );
              })()}
              <Label>Due date</Label>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 6 }}>
                {DUE_WITHIN_OPTIONS.map((o) => <Chip key={o} label={o} on={filters.dueWithin === o} onPress={() => setFilter({ dueWithin: o })} />)}
              </View>
              </Card>
            )}

            <Row style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              {(!phoneLayout || isWdFilterActive(filters)) && <Text style={{ color: t.textDim, fontWeight: '700', fontSize: t.fs(15) }}>{filteredOpen.length} of {openEntries.length} entries shown{filters.bank ? `  ·  🏦 ${filters.bank === '-' ? 'Bank not named' : filters.bank}` : ''}</Text>}
              {isWdFilterActive(filters) && <Pressable onPress={() => setFilter(EMPTY_WD_FILTER)}><Small style={{ color: t.accent, fontWeight: '700' }}>Reset</Small></Pressable>}
            </Row>
            {(Platform.OS !== 'web' || wide) && (!phoneLayout || showFilters) && <Segmented options={[{ key: 'cards', label: 'Cards' }, { key: 'table', label: 'Table' }]} value={tableView ? 'table' : 'cards'} onChange={(k) => updateWd((w) => ({ ...w, tableView: k === 'table' }))} style={{ marginBottom: 10, alignSelf: 'flex-start', width: 220 }} />}
            {(!phoneLayout || showFilters) && <Segmented options={SORTS} value={sortBy} onChange={setSortBy} style={{ marginBottom: 10 }} />}
            {!phoneLayout && <Small style={{ marginBottom: 12, textAlign: 'center' }}>{formOn ? 'Tap a card to edit · ' : ''}✓ completes it{WEB_DAR ? ' · DAR completes it into the daily report' : ''}{Platform.OS === 'web' && !phoneLayout ? ' · Keys: N new entry, / search, ⌘K finder, ? all shortcuts' : ''}</Small>}
            {!boardRows.length && (openEntries.length
              ? <EmptyState icon="search" title="Nothing matches" text="No task fits this filter or search." action="Show all tasks" onAction={() => { setFilters(EMPTY_WD_FILTER); setQuickView(''); }} />
              : <EmptyState icon="done" title="All clear" text="No open tasks. Enjoy the quiet, or add the next one." action={formOn ? 'New task' : undefined} onAction={openNewEntry} />)}
            {phoneLayout && tableView && <EntryTable entries={visibleRegister} onOpen={(e) => openEditEntry(e)} />}
            {phoneLayout && !tableView && visibleRegister.map((entry) => (
              <PhoneRow card key={entry.id} entry={entry} onPress={() => openEditEntry(entry)} onDone={() => act(entry, 'complete', { dar: false })} onDar={() => act(entry, 'complete', { dar: true })}
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
            <ShowMore total={boardRows.length} visibleCount={shownCount} onPress={() => setVisibleCount((n) => n + 20)} />
          </View>
        )}

        {tab === 'done' && (
          <View>
            {phoneLayout && (() => {
              // Completed this week: tasks completed since this Monday (local time).
              const mon = new Date(); mon.setHours(0, 0, 0, 0); mon.setDate(mon.getDate() - ((mon.getDay() + 6) % 7));
              const n = allDone.filter((e) => (completedTime(e) || 0) >= mon.getTime()).length;
              return (
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: t.tint, borderRadius: 18, paddingVertical: 14, paddingHorizontal: 16, marginBottom: 12 }}>
                  <Text style={{ color: t.tintText, fontWeight: '700', fontSize: t.fs(13) }}>Completed this week</Text>
                  <Text style={{ color: t.tintText, fontFamily: display(), fontWeight: '600', fontSize: t.fs(30), lineHeight: t.fs(32) }}>{n}</Text>
                </View>
              );
            })()}
            <Row gap={10} style={{ alignItems: 'center', marginBottom: 12 }}>
              <SearchField height={phoneLayout ? 46 : 48} style={{ flex: 1 }} value={doneFilters.query} onChangeText={(v) => setDoneFilter({ query: v })} placeholder="Search completed tasks" />
              <Pressable
                onPress={() => setShowDoneFilters((v) => !v)}
                accessibilityRole="button"
                accessibilityLabel="Filters"
                style={{ width: phoneLayout ? 46 : 48, height: phoneLayout ? 46 : 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: showDoneFilters || isWdFilterActive({ ...doneFilters, query: '' }) ? t.tint : t.surface, borderWidth: 1, borderColor: showDoneFilters || isWdFilterActive({ ...doneFilters, query: '' }) ? t.primary : t.border }}
              >
                <Icon name="sliders" size={20} color={showDoneFilters || isWdFilterActive({ ...doneFilters, query: '' }) ? t.tintText : t.text} stroke={1.9} />
              </Pressable>
            </Row>
            {showDoneFilters && (
              <Card style={{ marginBottom: 12 }}>
                <OptionPicker label="Category" source={SOURCES.wdCategory} value={doneFilters.category === ANY ? null : doneFilters.category} onChange={(v) => setDoneFilter({ category: v || ANY })} allowAny anyLabel="All Categories" />
                <Row gap={10}>
                  <View style={{ flex: 1 }}><OptionPicker label="Priority" source={SOURCES.wdPriority} value={doneFilters.priority === ANY ? null : doneFilters.priority} onChange={(v) => setDoneFilter({ priority: v || ANY })} allowAny anyLabel="All Priorities" /></View>
                  <View style={{ flex: 1 }}><OptionPicker label="Pending with" source={SOURCES.wdAssignee} value={doneFilters.pendingWith === ANY ? null : doneFilters.pendingWith} onChange={(v) => setDoneFilter({ pendingWith: v || ANY })} allowAny anyLabel="All Pending With" /></View>
                </Row>
                {phoneLayout && (Platform.OS !== 'web' || wide) && <Segmented options={[{ key: 'cards', label: 'Cards' }, { key: 'table', label: 'Table' }]} value={tableView ? 'table' : 'cards'} onChange={(k) => updateWd((w) => ({ ...w, tableView: k === 'table' }))} style={{ marginBottom: 12 }} />}
                {phoneLayout && <Label>Shown first</Label>}
                {phoneLayout && (
                  <Segmented options={[{ key: '1', label: 'Today' }, { key: '3', label: '3 days' }, { key: '5', label: '5 days' }, { key: '10', label: '10 days' }]} value={String(doneDays)}
                    onChange={(k) => { updateWd((w) => ({ ...w, doneDays: Number(k) })); setShowOlderDone(false); }} style={{ marginBottom: 12 }} />
                )}
                {phoneLayout && allDone.length > 1 && (
                  <View>
                    <Label>Sort by</Label>
                    <PickerButton text={(DONE_SORTS.find((x) => x.key === doneSort) || DONE_SORTS[0]).label} onPress={() => setDoneSortOpen(true)} />
                  </View>
                )}
              </Card>
            )}

            {(!phoneLayout || isWdFilterActive(doneFilters) || doneNarrowed) && (
              <Row style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <Text style={{ color: t.textDim, fontWeight: '700', fontSize: t.fs(14) }}>
                  {isWdFilterActive(doneFilters) ? `${doneEntries.length} of ${allDone.length} completed` : `${allDone.length} completed`}
                </Text>
                {doneNarrowed && <Pressable onPress={clearDone} hitSlop={8}><Small style={{ color: t.primary, fontWeight: '800' }}>Clear</Small></Pressable>}
              </Row>
            )}
            {(Platform.OS !== 'web' || wide) && !phoneLayout && <Segmented options={[{ key: 'cards', label: 'Cards' }, { key: 'table', label: 'Table' }]} value={tableView ? 'table' : 'cards'} onChange={(k) => updateWd((w) => ({ ...w, tableView: k === 'table' }))} style={{ marginBottom: 10, alignSelf: 'flex-start', width: 220 }} />}
            {!phoneLayout && <Label>Shown first</Label>}
            {!phoneLayout && <Segmented options={[{ key: '1', label: 'Today' }, { key: '3', label: '3 days' }, { key: '5', label: '5 days' }, { key: '10', label: '10 days' }]} value={String(doneDays)}
              onChange={(k) => { updateWd((w) => ({ ...w, doneDays: Number(k) })); setShowOlderDone(false); }} style={{ marginBottom: 12 }} />}
            {!phoneLayout && allDone.length > 1 && (
              <Row style={{ alignItems: 'center', marginBottom: 12 }}>
                <Small style={{ marginRight: 10, marginBottom: 0 }}>Sort by</Small>
                <PickerButton style={{ flex: 1 }} text={(DONE_SORTS.find((x) => x.key === doneSort) || DONE_SORTS[0]).label} onPress={() => setDoneSortOpen(true)} />
              </Row>
            )}
            {!allDone.length && <EmptyState icon="done" title="Nothing completed yet" text="Tasks you tick off with Done or DAR show up here, grouped by day." />}
            {!!allDone.length && !doneEntries.length && <EmptyState icon="search" title="Nothing matches" text="No completed task fits this search." />}
            {phoneLayout && tableView && <EntryTable mode="done" completedAt={completedTime} entries={visibleDone} onOpen={(e) => openEditEntry(e)} />}
            {phoneLayout && !tableView && visibleDone.map((entry, i) => {
              // Grouped by the day it was completed: Today, Yesterday, then the date.
              const ms = completedTime(entry);
              const dayOf = (m) => (m ? toDateKey(new Date(m)) : '');
              const label = (m) => { if (!m) return 'Earlier'; const k = dayOf(m); const y = new Date(); y.setDate(y.getDate() - 1); return k === toDateKey(new Date()) ? 'Today' : k === toDateKey(y) ? 'Yesterday' : new Date(m).toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' }); };
              const first = i === 0 || dayOf(completedTime(visibleDone[i - 1])) !== dayOf(ms);
              return (
                <View key={entry.id}>
                  {first && <Text style={{ color: t.textDim, fontWeight: '800', fontSize: t.fs(11), letterSpacing: 1.1, textTransform: 'uppercase', marginTop: i ? 10 : 2, marginBottom: 10 }}>{label(ms)}</Text>}
                  <PhoneDoneRow entry={entry} onPress={() => openEditEntry(entry)} onReopen={() => act(entry, 'reopen')} />
                </View>
              );
            })}
            {!phoneLayout && tableView && <EntryTable mode="done" completedAt={completedTime} entries={visibleDone} onOpen={(e) => openEditEntry(e)} />}
            {!phoneLayout && !tableView && <CardGrid>
            {visibleDone.map((entry) => (
              <EntryRow key={entry.id} entry={entry} mode="done" onPress={() => openEditEntry(entry)} onToggleDar={() => toggleDar(entry)} onAct={(kind, opts) => act(entry, kind, opts)} narration={narrationFor(entry, plists)} />
            ))}
            </CardGrid>}
            <ShowMore total={(showOlderDone ? doneEntries : doneRecent).length} visibleCount={shownCount} onPress={() => setVisibleCount((n) => n + 20)} />
            {doneFolded && (
              <Pressable onPress={() => setShowOlderDone(true)} accessibilityRole="button" style={{ alignItems: 'center', paddingVertical: 14 }}>
                <Text style={{ color: t.accent, fontWeight: '700' }}>••• Show more ({doneEntries.length - doneRecent.length} older)</Text>
              </Pressable>
            )}
            {!!doneEntries.length && <Small style={{ textAlign: 'center' }}>Tap Reopen to bring one back. Every change can be undone for a few seconds.</Small>}
            <Sheet visible={doneSortOpen} onClose={() => setDoneSortOpen(false)} title="Sort by">
              <Choices
                options={DONE_SORTS.map((x) => [x.key, x.label])}
                value={doneSort}
                onChange={(v) => { updateWd((w) => ({ ...w, doneSort: v })); setVisibleCount(5); setDoneSortOpen(false); }}
              />
            </Sheet>
          </View>
        )}

        {tab === 'narration' && Platform.OS === 'web' && !phoneLayout && (
          <View>
            <Card>
              <Text style={{ color: t.accent, fontWeight: '800', fontSize: t.fs(13), marginBottom: 2 }}>TALLY NARRATION</Text>
              <Small style={{ marginBottom: 10 }}>Pick a narration type to build the Tally entry text - for any task, whatever its status. The vendor leads the report line and never goes into Tally.</Small>
              {!plists.narrationTypes.length && <Small style={{ marginBottom: 8 }}>No narration types yet - they are set up in Config → Settings & Tools and arrive with Realtime Sync.</Small>}
              {/* web.app: the entry and mail chain lead the form's grid - three fields to a row on a wide screen, two otherwise. */}
              <NarrationForm lead={[
              // Optional: pick an entry - its mail chain and saved narration come in, and the result can be saved back to it.
              <View key="entry">
              <Label>ENTRY (optional)</Label>
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

        {tab === 'bin' && <WdBinTab binnedEntries={binnedEntries} act={act} />}

        {tab === 'links' && <WdLinksTab wd={wd} setTools={setTools} linkDraft={linkDraft} setLinkDraft={setLinkDraft} linkFolder={linkFolder} setLinkFolder={setLinkFolder} linkFind={linkFind} setLinkFind={setLinkFind} />}

        {tab === 'report' && (
          <View>
            {phoneLayout && (() => {
              // A strip of seven days (five before today, tomorrow); a date outside it re-centres the strip on that day.
              const todayK = toDateKey(new Date());
              const at = (k, n) => { const d = new Date(`${k}T12:00:00`); d.setDate(d.getDate() + n); return d; };
              const inWindow = reportDate >= toDateKey(at(todayK, -5)) && reportDate <= toDateKey(at(todayK, 1));
              const first = inWindow ? at(todayK, -5) : at(reportDate, -5);
              const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(first); d.setDate(d.getDate() + i); return d; });
              const dayOn = (k) => reportKind === 'day' && reportDate === k;
              return (
                <View style={{ marginBottom: 14, gap: 12 }}>
                  <Row gap={6}>
                    {days.map((d) => {
                      const k = toDateKey(d);
                      const on = dayOn(k);
                      return (
                        <Pressable key={k} onPress={() => { setReportDate(k); buildReport(k); }} accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={d.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' })}
                          style={{ flex: 1, alignItems: 'center', gap: 2, paddingVertical: 8, borderRadius: 14, backgroundColor: on ? t.primaryDark : t.surface, borderWidth: 1, borderColor: on ? t.primaryDark : t.border }}>
                          <Text style={{ color: on ? t.heroDim : t.text, fontWeight: '700', fontSize: t.fs(11) }}>{d.toLocaleDateString([], { weekday: 'short' })}</Text>
                          <Text style={{ color: on ? '#fff' : t.text, fontFamily: display(), fontWeight: '600', fontSize: t.fs(16) }}>{d.getDate()}</Text>
                        </Pressable>
                      );
                    })}
                  </Row>
                  <Row gap={8} style={{ alignItems: 'center' }}>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }} contentContainerStyle={{ gap: 8 }}>
                      {[['Today', () => { setReportDate(todayK); buildReport(todayK); }, reportKind === 'day' && reportDate === todayK], ['This week', () => buildSummary('week'), reportKind === 'week'], ['This month', () => buildSummary('month'), reportKind === 'month']].map(([label, fn, on]) => (
                        <Chip key={label} label={label} on={!!on} onPress={fn} />
                      ))}
                    </ScrollView>
                    <DateTimeField iconOnly mode="date" label="Pick another date" value={new Date(`${reportDate}T12:00:00`).toISOString()} onChange={(v) => { const k = toDateKey(new Date(v)); setReportDate(k); buildReport(k); }} />
                  </Row>
                </View>
              );
            })()}
            {reportKind === 'day' && !!reportModel && (
              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14 }}>
                {[['oth', 'Other work', reportModel.data.others], ['pay', 'Payments', reportModel.data.payments], ['fol', 'Followed up', reportModel.data.followed], ['out', 'Left out', reportModel.data.excluded]].map(([key, label, n]) => (
                  <Pressable key={key} onPress={() => setGroupOpen(key)} accessibilityRole="button" accessibilityLabel={`${n} ${label} - show the tasks`} style={({ pressed }) => ({ flex: 1, borderRadius: 16, paddingVertical: 10, paddingHorizontal: 4, alignItems: 'center', backgroundColor: t.surface, borderWidth: 1, borderColor: t.border, opacity: pressed ? 0.85 : 1 })}>
                    <Text style={{ color: t.text, fontFamily: display(), fontWeight: '600', fontSize: t.fs(24), lineHeight: t.fs(27) }}>{n}</Text>
                    <Text style={{ color: t.textDim, fontWeight: '700', fontSize: t.fs(10.5) }} numberOfLines={1}>{label}</Text>
                  </Pressable>
                ))}
              </View>
            )}
            {reportKind === 'day' && (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
                {[['headings', 'Section headings'], ['subFields', 'Sub category fields'], ['pending', 'Pending list']].map(([k, label]) => (
                  <Chip key={k} label={label} on={!!reportOpts[k]} onPress={() => setReportOpt(k)} accessibilityLabel={`${label}: ${reportOpts[k] ? 'on' : 'off'}`} />
                ))}
              </View>
            )}
            {!phoneLayout && (
            <Card>
              <Row gap={10} style={{ alignItems: 'flex-end' }}>
                <View style={{ flex: 1 }}>
                  <DateTimeField label="Date" mode="date" value={new Date(`${reportDate}T12:00:00`).toISOString()} onChange={(v) => setReportDate(toDateKey(new Date(v)))} />
                </View>
                <Btn title="Generate" onPress={() => buildReport()} style={{ marginBottom: 12 }} />
              </Row>
              {/* Phone-width screens and the whole website: totals for the week (from Monday) or the month (from the 1st) up to the date above. */}
              {(phoneLayout || Platform.OS === 'web') && <Row gap={10} style={{ marginBottom: 8 }}>
                <Btn style={{ flex: 1 }} kind={reportKind === 'week' ? 'primary' : 'soft'} title="This week" onPress={() => buildSummary('week')} />
                <Btn style={{ flex: 1 }} kind={reportKind === 'month' ? 'primary' : 'soft'} title="This month" onPress={() => buildSummary('month')} />
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
            )}
            {phoneLayout && !!reportNote && <Small style={{ marginBottom: 8 }}>{reportNote}</Small>}

            {!!reportText && phoneLayout && reportKind === 'day' && !!reportModel && !(reportAlt && reportAlt.showing === 'ai') ? (
              <Card style={{ paddingVertical: 16, paddingHorizontal: 18, gap: 10 }}>
                {reportModel.sections.filter((sec) => sec.rows.length || (sec.intro && sec.intro.length)).map((sec) => (
                  <View key={sec.key} style={{ gap: 6 }}>
                    <Text style={{ color: t.primary, fontWeight: '800', fontSize: t.fs(12), letterSpacing: 0.9, textTransform: 'uppercase', marginTop: 4 }}>{sec.title}{sec.key === 'pay' ? ` (${sec.rows.length})` : ''}</Text>
                    {[...(sec.intro || []), ...sec.rows.map((r) => r.line)].map((line, i) => (
                      <Row key={i} gap={8} style={{ alignItems: 'flex-start' }}>
                        <Text style={{ color: t.textDim, fontSize: t.fs(13.5), lineHeight: t.fs(21) }}>•</Text>
                        <Text style={{ flex: 1, color: t.text, fontSize: t.fs(13.5), lineHeight: t.fs(21), fontWeight: '500' }}>{line}</Text>
                      </Row>
                    ))}
                  </View>
                ))}
              </Card>
            ) : !!reportText && (
              <Card style={{ marginTop: phoneLayout ? 0 : 14 }}>
                <Text style={{ color: t.text, fontSize: t.fs(13.5), lineHeight: t.fs(21), fontWeight: '500' }}>{reportText}</Text>
              </Card>
            )}

            {!!reportText && phoneLayout && (
              <Pressable onPress={() => setAiOpen((v) => !v)} accessibilityRole="button" accessibilityState={{ expanded: aiOpen }} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: t.surface, borderWidth: 1, borderColor: t.border, borderRadius: 16, paddingVertical: 13, paddingHorizontal: 14, marginTop: 12 }}>
                <Icon name="sparkle" size={18} color={t.primary} stroke={1.9} />
                <Text style={{ color: t.text, fontWeight: '800', fontSize: t.fs(14.5) }}>Instructions for AI</Text>
                <Text numberOfLines={1} style={{ flex: 1, textAlign: 'right', color: t.textDim, fontSize: t.fs(12.5), fontWeight: '600' }}>{(wd[aiKey] || '').trim() ? 'Set' : 'Optional'}</Text>
                <Icon name={aiOpen ? 'chevronUp' : 'chevronDown'} size={16} color={t.textDim} stroke={2} />
              </Pressable>
            )}
            {!!reportText && (!phoneLayout || aiOpen) && (
              <Field style={{ marginTop: 12 }} label={`INSTRUCTIONS FOR AI (${reportKind === 'day' ? 'daily report' : 'this summary'})`} value={wd[aiKey] || ''} multiline
                onChangeText={(v) => setTools((w) => ({ ...w, [aiKey]: v }))}
                placeholder="e.g. Two lines for each task, in a formal, professional tone." />
            )}
            {!!reportText && (!phoneLayout || aiOpen) && (
              <Row gap={6} style={{ marginTop: 6, flexWrap: 'wrap' }}>
                {REPORT_PRESETS.map((p) => (
                  <Pressable key={p.label} onPress={() => setTools((w) => ({ ...w, [aiKey]: p.text }))} style={{ paddingVertical: 7, paddingHorizontal: 12, borderRadius: 999, backgroundColor: t.tint }}>
                    <Text style={{ color: t.tintText, fontWeight: '700', fontSize: t.fs(12.5) }}>{p.label}</Text>
                  </Pressable>
                ))}
              </Row>
            )}
            {!!reportAlt && (
              <Btn style={{ marginTop: 10 }} kind="soft" title={reportAlt.showing === 'ai' ? 'Show the standard version' : 'Show the AI version'}
                onPress={() => { const next = reportAlt.showing === 'ai' ? 'standard' : 'ai'; setReportText(reportAlt[next]); setReportAlt({ ...reportAlt, showing: next }); }} />
            )}
            {!!reportText && !phoneLayout && (
              <Row gap={10} style={{ marginTop: 14, flexWrap: 'wrap' }}>
                <Btn style={{ flex: 1, minWidth: '45%' }} kind="soft" title="Copy" onPress={copyReport} />
                {(phoneLayout || Platform.OS === 'web') && <Btn style={{ flex: 1, minWidth: '45%' }} kind="soft" title="Email" onPress={emailReport} />}
                {/* "Both" (phone-width screens): the report as a PDF, to send on WhatsApp or attach to a mail. */}
                <Btn style={{ flex: 1, minWidth: '45%' }} kind="soft" title="PDF" onPress={pdfReport} />
                <Btn style={{ flex: 1, minWidth: '45%' }} kind="soft" title="Excel" onPress={csvReport} />
                {/* The app's built-in AI (aiBuiltin.js). On a phone
                    it has a line of its own below: four buttons in a row were too narrow to read. */}
                {!phoneLayout && <Btn style={{ flex: 1 }} title={aiBusy ? 'Writing with AI...' : 'Rewrite with AI'} disabled={aiBusy} onPress={rewriteAny} />}
              </Row>
            )}

            {!reportText && <P dim style={{ marginTop: 10 }}>Pick a date and tap Generate - the report is built instantly from that day's completed entries (all but those marked "Done" only), entries whose status moved that day, routine activities and anything logged. Domestic and Urgent payments are left out, as on the web app.</P>}
          </View>
        )}

        {tab === 'more' && <WdMoreTab googleUser={googleUser} waiting={waiting} realtimeError={realtimeError} binnedEntries={binnedEntries} setTab={setTab} wd={wd} data={data} update={update} />}

        {tab === 'holidays' && <WdHolidaysTab entries={entries} holidayList={holidayList} leaveList={leaveList} openEditEntry={openEditEntry} openNewHoliday={openNewHoliday} setHolidaySheet={setHolidaySheet} removeHoliday={removeHoliday} holQuery={holQuery} setHolQuery={setHolQuery} holCalendar={holCalendar} setHolCalendar={setHolCalendar} holCalendarOpen={holCalendarOpen} setHolCalendarOpen={setHolCalendarOpen} holAlertsOnly={holAlertsOnly} setHolAlertsOnly={setHolAlertsOnly} />}

        {tab === 'config' && (() => {
          // Appearance (Ledger): the colour theme swatches, the dark-mode switch and the text size.
          const themeNow = themeKeyOf(data.settings?.theme);
          const appearanceBody = (
            <View style={{ gap: 16 }}>
              <View>
                <Text style={{ color: t.text, fontWeight: '800', fontSize: t.fs(15), marginBottom: 12 }}>Colour theme</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                  {THEME_SWATCHES.map((sw) => {
                    const on = themeNow === sw.key;
                    return (
                      <Pressable key={sw.key} onPress={() => update({ settings: { theme: sw.key } })} accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={`${sw.label} theme`}
                        style={{ width: '31%', flexGrow: 1, gap: 7, borderRadius: 16, padding: 8, borderWidth: 2, borderColor: on ? t.primary : t.border }}>
                        <View style={{ height: 34, borderRadius: 10, backgroundColor: sw.color }} />
                        <Text style={{ color: t.text, fontWeight: '700', fontSize: t.fs(12) }}>{sw.label}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
              <Row style={{ justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                <Text style={{ flex: 1, color: t.text, fontWeight: '700', fontSize: t.fs(14) }}>Follow the phone's dark mode</Text>
                <Toggle label="Follow the phone's dark mode" value={data.settings?.followDark !== false} onChange={(v) => update({ settings: { followDark: v } })} />
              </Row>
              <View>
                <Text style={{ color: t.text, fontWeight: '700', fontSize: t.fs(14), marginBottom: 8 }}>Text size</Text>
                <Segmented tone="light" options={[{ key: '1', label: 'Small' }, { key: '2', label: 'Normal' }, { key: '3', label: 'Large' }, { key: '4', label: 'XL' }]} value={String(data.settings?.fontLevel || 2)} onChange={(k) => update({ settings: { fontLevel: Number(k) } })} />
              </View>
            </View>
          );
          const panels = [
            { key: 'alerts', icon: 'bell', title: 'Alerts', body: (
              <>
                <WdAlertSettings alerts={wd.alerts} priorities={wd.priorities || []} onChange={(v) => updateWd((w) => ({ ...w, alerts: v }))} />
                <Text style={{ color: t.text, fontWeight: '700', marginTop: 16, marginBottom: 4 }}>Alarm sound</Text>
                <P dim>Plays for every Working Dashboard alert. Tap a name to use it.</P>
                <RingtonePicker value={wd.alarmRingtone} onChange={(v) => updateWd((w) => ({ ...w, alarmRingtone: v }))} />
              </>
            ) },
            { key: 'appearance', icon: 'moon', title: 'Appearance', body: appearanceBody },
            { key: 'lists', icon: 'list', title: 'Entry form options', body: <ListsEditor wd={wd} save={saveLists} /> },
            { key: 'subs', icon: 'folder', title: 'Sub categories', body: <SubCategories wd={wd} lists={plists} save={saveLists} /> },
            { key: 'reminder', icon: 'clock', title: 'Next reminder', body: <ReminderCategories wd={wd} save={saveLists} /> },
            { key: 'points', icon: 'checklist', title: 'Report points', body: <ReportPoints wd={wd} save={saveLists} /> },
            { key: 'formats', icon: 'report', title: 'Report formats', body: <WdReportFormats wd={wd} entries={entries} setTools={setTools} setLists={saveLists} /> },
            { key: 'gemini', icon: 'sparkle', title: 'Gemini (AI) key', body: <WdGeminiKey /> },
          ];
          const groups = [
            ['General', [['alerts', 'When and how a due task alerts you'], ['appearance', 'Theme and colours']]],
            ['Entry form', [['lists', 'Categories, priorities, statuses, pending with'], ['subs', 'Sub categories and their fields'], ['reminder', 'Which categories ask for a next reminder']]],
            ['Reports', [['formats', 'The sentence each sub category writes'], ['gemini', 'Your own key, used only when the free route is busy']]],
          ];
          const byKey = Object.fromEntries(panels.map((x) => [x.key, x]));
          const split = !phoneLayout;
          const active = configFocus === 'all' ? (split ? 'appearance' : '') : configFocus;
          const pick = (k) => setConfigFocus(k);
          const counts = [['Active', openEntries.length, t.primary, 'register'], ['Done', allDone.length, t.ok, 'done'], ['In Bin', binnedEntries.length, t.danger, 'bin']];
          // Wide screens: grouped menu on the left, the chosen topic on the right.
          const menu = (
            <View style={split ? { width: 250 } : undefined}>
              {groups.map(([title, items]) => (
                <View key={title} style={{ marginBottom: 14 }}>
                  <Text style={{ color: t.textDim, fontWeight: '800', fontSize: t.fs(11), letterSpacing: 1.1, textTransform: 'uppercase', marginBottom: 8, marginLeft: 4 }}>{title}</Text>
                  <Card style={{ padding: 6 }}>
                    {items.map(([k]) => {
                      const x = byKey[k];
                      const on = active === k;
                      return (
                        <Pressable key={k} onPress={() => pick(k)} accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={x.title}
                          style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingHorizontal: 10, borderRadius: 12, backgroundColor: on ? t.tint : 'transparent' }}>
                          <Icon name={x.icon} size={19} color={on ? t.tintText : t.textDim} stroke={1.9} />
                          <Text style={{ flex: 1, color: on ? t.tintText : t.text, fontWeight: '700', fontSize: t.fs(14.5) }} numberOfLines={1}>{x.title}</Text>
                        </Pressable>
                      );
                    })}
                  </Card>
                </View>
              ))}
            </View>
          );
          // Phone: one list of topics (the Appearance row is highlighted - its card is open right below).
          const topicList = (
            <View style={{ backgroundColor: t.surface, borderRadius: t.radius, borderWidth: 1, borderColor: t.border, overflow: 'hidden' }}>
              {panels.map((x, i) => {
                const on = x.key === 'appearance';
                return (
                  <Pressable key={x.key} onPress={() => pick(x.key)} accessibilityRole="button" accessibilityLabel={x.title}
                    style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, minHeight: 52, borderTopWidth: i ? 1 : 0, borderTopColor: t.surfaceAlt, backgroundColor: on ? t.tint : pressed ? t.surfaceAlt : t.surface })}>
                    <Text style={{ color: on ? t.tintText : t.text, fontWeight: '700', fontSize: t.fs(15) }}>{x.title}</Text>
                    <Icon name="chevronRight" size={16} color={on ? t.tintText : t.chevron} stroke={2} />
                  </Pressable>
                );
              })}
            </View>
          );
          const cur = active ? byKey[active] : null;
          const curHint = cur ? (groups.flatMap(([, it]) => it).find(([k]) => k === active) || [])[1] : '';
          const panel = cur && (
            <View style={{ flex: 1, minWidth: 0 }}>
              {!split && (
                <Pressable onPress={() => setConfigFocus('all')} accessibilityRole="button" accessibilityLabel="Back to Config" style={{ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 6, paddingRight: 12, marginBottom: 6 }}>
                  <Icon name="back" size={16} color={t.primary} stroke={2.2} />
                  <Text style={{ color: t.primary, fontWeight: '800', fontSize: t.fs(14) }}>Config</Text>
                </Pressable>
              )}
              <Card style={{ padding: 18 }}>
                <Row gap={12} style={{ alignItems: 'center', marginBottom: 4 }}>
                  <View style={{ width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: t.tint }}>
                    <Icon name={cur.icon} size={22} color={t.tintText} stroke={1.9} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: t.text, fontWeight: '800', fontSize: t.fs(19) }}>{cur.title}</Text>
                    {!!curHint && <Small>{curHint}</Small>}
                  </View>
                </Row>
                <View style={{ height: 1, backgroundColor: t.border, marginVertical: 14 }} />
                {cur.body}
              </Card>
            </View>
          );
          const accountCard = (
            <Card>
              <Row gap={12} style={{ alignItems: 'center' }}>
                <View style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: t.primary, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ color: t.onAccent, fontFamily: display(), fontWeight: '600', fontSize: t.fs(20) }}>{String(googleUser?.displayName || googleUser?.email || 'W').trim().charAt(0).toUpperCase()}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text numberOfLines={1} style={{ color: t.text, fontWeight: '800', fontSize: t.fs(16) }}>{googleUser?.displayName || (googleUser ? 'Signed in' : 'This device only')}</Text>
                  <Small numberOfLines={1}>{googleUser?.email || 'Sign in with Google to sync with the website'}</Small>
                </View>
                <Btn kind="soft" title={googleUser ? 'Sign out' : 'Sign in'} disabled={realtimeBusy} onPress={googleUser ? doGoogleSignOut : doGoogleSignIn} />
              </Row>
            </Card>
          );
          if (phoneLayout) {
            // Phone: a panel on its own page, or the topic list with the Appearance card open under it and the account at the foot.
            return panel ? <View>{panel}</View> : (
              <View style={{ gap: 14 }}>
                {topicList}
                <Text style={{ color: t.textDim, fontWeight: '800', fontSize: t.fs(11), letterSpacing: 1.1, textTransform: 'uppercase', marginLeft: 4, marginBottom: -6 }}>APPEARANCE</Text>
                <Card style={{ padding: 16 }}>{appearanceBody}</Card>
                <Text style={{ color: t.textDim, fontWeight: '800', fontSize: t.fs(11), letterSpacing: 1.1, textTransform: 'uppercase', marginLeft: 4, marginBottom: -6 }}>ACCOUNT</Text>
                {accountCard}
              </View>
            );
          }
          return (
            <View>
              <View style={{ marginBottom: 14 }}>{accountCard}</View>
              <Row gap={10} style={{ marginBottom: 16 }}>
                {counts.map(([label, n, color, to]) => (
                  <Pressable key={label} onPress={() => goTab(to)} style={{ flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: 16, backgroundColor: t.surface, borderWidth: 1, borderColor: t.border }}>
                    <Text style={{ color, fontFamily: display(), fontWeight: '600', fontSize: t.fs(22) }}>{n}</Text>
                    <Small style={{ fontWeight: '700', textTransform: 'uppercase' }}>{label}</Small>
                  </Pressable>
                ))}
              </Row>
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 18 }}>
                {menu}
                {panel}
              </View>
            </View>
          );
        })()}

        </FadeInUp>
      </SwipeTabs>

      {/* Gmail, with the person's own sign-in. */}
      {(tab === 'dashboard' || tab === 'register' || tab === 'done') && mailAvailable && (
        <Btn style={{ marginTop: 16 }} kind="soft" title="Fetch Mail" onPress={openMail} />
      )}
      <View style={{ height: 110 }} />

      {/* --- New/edit entry --- */}
      <Sheet visible={!!entrySheet && formOn} onClose={closeEntrySheet} title={entries.some((x) => x.id === entrySheet?.id) ? 'Edit entry' : 'New entry'} full bigTitle fillDesktop footer={entrySheet && pinSave ? entryButtons : null}>
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
                  <View style={{ width: 22, height: 22, borderRadius: 6, alignItems: 'center', justifyContent: 'center', backgroundColor: c.done ? t.primary : 'transparent', borderWidth: c.done ? 0 : 2, borderColor: t.textDim }}>
                    {!!c.done && <Icon name="check" size={14} color={t.onAccent} stroke={3} />}
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
              <BankFollowUpForm holidays={holidayList} leaveDays={leaveList} quickRemarks={wd.followUpRemarks} onQuickRemarks={(list) => updateWd((w) => ({ ...w, followUpRemarks: list }))} entry={fe} draft={followSheet} onChange={(patch) => setFollowSheet((s) => ({ ...s, ...patch }))} />
              <Btn title="Save follow-up" onPress={saveFollowUp} />
            </View>
          ) : null;
        })()}
      </Sheet>

      {/* --- Holiday editor --- */}
      <WdHolidaySheet holidaySheet={holidaySheet} setHolidaySheet={setHolidaySheet} holidayList={holidayList} saveHoliday={saveHoliday} removeHoliday={removeHoliday} />

      <CommandPalette visible={paletteOpen} onClose={() => setPaletteOpen(false)} tabs={BAR_TABS} entries={entries}
        onGoTab={goTab} onOpenEntry={(e) => openEditEntry(e)} onQuickAdd={(text) => quickAdd(text)} />

      {/* --- Fetch Mail --- */}
      <Sheet visible={mailSheet} onClose={closeMail} title="Fetch Mail" full>
        {!mailAvailable ? (
          <P dim>Sign in with Google (Config) to fetch your unread mail.</P>
        ) : (
          <View>
            <Row gap={8}>
              <Field style={{ flex: 1 }} value={mailQuery} onChangeText={setMailQuery} placeholder="Search fetched mail" />
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

    {/* Phone Report: Copy, the AI rewrite and the send options stay at the foot of the screen, above the tab bar. */}
    {phoneLayout && tab === 'report' && !!reportText && (
      <View style={{ position: 'absolute', left: 0, right: 0, bottom: aboveBar - 10, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 12, backgroundColor: t.bg }}>
        <Btn style={{ flex: 2 }} title="Copy report" onPress={copyReport} />
        <Btn style={{ flex: 1.5 }} kind="soft" title={aiBusy ? 'Writing…' : 'Rewrite with AI'} disabled={aiBusy} onPress={rewriteAny} />
        <Pressable onPress={() => setShareOpen(true)} accessibilityRole="button" accessibilityLabel="Send the report" style={({ pressed }) => ({ width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: t.surfaceAlt, opacity: pressed ? 0.85 : 1 })}>
          <Icon name="share" size={20} color={t.text} stroke={1.9} />
        </Pressable>
      </View>
    )}
    <Sheet visible={!!groupOpen && !!reportModel && !!reportModel.groups} onClose={() => setGroupOpen('')} title={({ oth: 'Other work', pay: 'Payments', fol: 'Followed up', out: 'Left out (Done, not DAR)' })[groupOpen] || ''}>
      {((reportModel && reportModel.groups && reportModel.groups[groupOpen]) || []).map((it) => (
        <View key={it.id} style={{ backgroundColor: t.surface, borderRadius: 16, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: t.border }}>
          <Text style={{ color: t.text, fontWeight: '800', fontSize: t.fs(14) }}>{it.title}</Text>
          {!!it.line && it.line !== it.title && <Text style={{ color: t.textDim, fontSize: t.fs(13), marginTop: 3 }}>{it.line}</Text>}
          <Text style={{ color: t.textDim, fontSize: t.fs(11), fontWeight: '800', marginTop: 8 }}>MOVE TO</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
            {REPORT_GROUPS.map((g) => (
              <Pressable key={g.key} onPress={() => moveTask(it.id, g.key)} accessibilityRole="button" accessibilityState={{ selected: g.key === groupOpen }} style={{ borderRadius: 12, paddingHorizontal: 10, paddingVertical: 5, backgroundColor: g.key === groupOpen ? t.primaryDark : t.surfaceAlt }}>
                <Text style={{ color: g.key === groupOpen ? '#fff' : t.text, fontWeight: '800', fontSize: t.fs(12) }}>{g.label}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      ))}
      {!((reportModel && reportModel.groups && reportModel.groups[groupOpen]) || []).length && <Text style={{ color: t.textDim }}>Nothing here.</Text>}
      {Object.keys(dayMoves).length > 0 && <Btn title={`Undo my moves (${Object.keys(dayMoves).length})`} kind="ghost" onPress={undoMoves} />}
    </Sheet>
    <Sheet visible={monthEndOpen} onClose={() => setMonthEndOpen(false)} title="Month end (last working days)">
      {monthEndOptions(new Date(), (k) => isNonWorkingDay(k, holidayList, leaveList), 5).map((m) => (
        <Pressable key={m.key} onPress={() => { setEntrySheet((d) => ({ ...d, dueAt: new Date(`${m.key}T00:00:00`).toISOString() })); setMonthEndOpen(false); }} accessibilityRole="button" style={{ backgroundColor: t.surface, borderRadius: 16, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: t.border }}>
          <Text style={{ color: t.text, fontWeight: '700' }}>{m.label}</Text>
        </Pressable>
      ))}
    </Sheet>
    <Sheet visible={!!subPop} onClose={() => setSubPop(null)} title={subPop ? `${subPop.category} - Sub categories` : ''}>
      {subPop && groupCounts(subPop.list, (e) => e.subCategory, 'None chosen').map((r) => (
        <Pressable key={r.label} onPress={() => { const sp = subPop; setSubPop(null); openRegister({ category: sp.category, subCategory: r.label === 'None chosen' ? '__none' : r.label, dueWithin: sp.due }); }} accessibilityRole="button" style={{ flexDirection: 'row', justifyContent: 'space-between', backgroundColor: t.surface, borderRadius: 16, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: t.border }}>
          <Text style={{ color: t.text, fontWeight: '700', flex: 1 }}>{r.label}</Text>
          <Text style={{ color: t.accent, fontWeight: '800' }}>{r.count}</Text>
        </Pressable>
      ))}
      {!!subPop && <Btn kind="soft" title={`All ${subPop.category} tasks`} onPress={() => { const sp = subPop; setSubPop(null); openRegister({ category: sp.category, dueWithin: sp.due }); }} />}
    </Sheet>
    <Sheet visible={shareOpen} onClose={() => setShareOpen(false)} title="Send the report">
      <Field label="SEND TO (Email fills this in)" value={wd.reportEmail || ''} keyboardType="email-address" autoCapitalize="none" onChangeText={(v) => updateWd((w) => ({ ...w, reportEmail: v }))} placeholder="manager@company.com" />
      <Btn style={{ marginBottom: 8 }} title="Email" onPress={() => { setShareOpen(false); emailReport(); }} />
      <Btn style={{ marginBottom: 8 }} kind="soft" title="PDF" onPress={() => { setShareOpen(false); pdfReport(); }} />
      <Btn kind="soft" title="Excel" onPress={() => { setShareOpen(false); csvReport(); }} />
    </Sheet>

    {formOn && !phoneLayout && (tab === 'dashboard' || tab === 'register') && <Fab onPress={openNewEntry} right={wide ? 32 : 20} bottom={fabBottom} />}
    <UndoBar undo={undo} onUndo={runUndo} onHide={() => setUndo(null)} bottom={wide ? 24 : aboveBar + 8} left={sideBar + 20} />
    <BottomTabs
      tabs={BAR_TABS}
      value={tab}
      badges={{ dashboard: stats.pendingAsOnToday, register: openEntries.length, done: allDone.length, bin: binnedEntries.length }}
      onChange={goTab}
    />
    {introNeeded && (
      <WdAlarmIntro kind={alarmBlock}
        onAllow={() => { (alarmBlock === 'overlay' ? requestOverlayPermission() : requestFullScreenIntentPermission()); updateWd((w) => ({ ...w, alarmIntroSeen: true })); }}
        onSkip={() => updateWd((w) => ({ ...w, alarmIntroSeen: true }))} />
    )}
    </View>
  );
}
