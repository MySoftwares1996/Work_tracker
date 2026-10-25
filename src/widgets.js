import React from 'react';
import { Platform } from 'react-native';
import { FlexWidget, TextWidget, requestWidgetUpdate } from 'react-native-android-widget';
import { loadAll, assemble } from './storeCore';
import { THEMES, darkTheme } from './theme';
import { WIDGET_NAMES, widgetsHidden, workSummaryWidgetData, workTodayWidgetData, workNextWidgetData } from './widgetData';
import { completeWdEntry } from './workingDashboardActions';

/**
 * Android home-screen widgets for the Working Dashboard: summary, today's list and next up.
 *
 * They are drawn from the saved data, never from the React tree, because the
 * OS asks for them with the app closed (the handler below is registered in
 * index.js as a headless task). Tapping a widget opens the app; tapping an
 * entry's circle completes it without opening the app.
 */

// Widgets are drawn by the launcher, so they take fixed colours from the
// app's own themes: the Ledger look (Forest) in light mode and its dark twin in dark mode.
const fromTheme = (th) => ({ bg: th.surface, text: th.text, dim: th.textDim, accent: th.accent, ok: th.ok, danger: th.danger, track: th.border });
const PALETTE = { light: fromTheme(THEMES.pearl), dark: fromTheme(darkTheme('pearl')) };

const open = (path) => ({ clickAction: 'OPEN_URI', clickActionData: { uri: `workingdashboard://${path}` } });

function Card({ c, path, children, a11y }) {
  return (
    <FlexWidget
      {...open(path)}
      accessibilityLabel={a11y}
      style={{ height: 'match_parent', width: 'match_parent', flexDirection: 'column', backgroundColor: c.bg, borderRadius: 18, padding: 14 }}
    >
      {children}
    </FlexWidget>
  );
}

function Locked({ c, label }) {
  return (
    <FlexWidget
      clickAction="OPEN_APP"
      style={{ height: 'match_parent', width: 'match_parent', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', backgroundColor: c.bg, borderRadius: 18, padding: 14 }}
    >
      <TextWidget text="🔒" style={{ fontSize: 24 }} />
      <TextWidget text={label} style={{ fontSize: 14, fontWeight: '700', color: c.text, marginTop: 4 }} />
      <TextWidget text="Unlock the app to see it" style={{ fontSize: 11, color: c.dim, marginTop: 2 }} maxLines={2} />
    </FlexWidget>
  );
}

/** Overdue / due today / open, at a glance. */
function WorkSummaryView({ c, d }) {
  const stat = (n, label, color) => (
    <FlexWidget style={{ flex: 1, flexDirection: 'column', alignItems: 'center' }}>
      <TextWidget text={String(n)} style={{ fontSize: 22, fontWeight: '800', color }} />
      <TextWidget text={label} style={{ fontSize: 10, color: c.dim }} />
    </FlexWidget>
  );
  return (
    <Card c={c} path="work" a11y="Working Dashboard">
      <TextWidget text="💼 Work" style={{ fontSize: 13, fontWeight: '700', color: c.dim }} />
      <TextWidget text={d.headline} maxLines={1} style={{ fontSize: 16, fontWeight: '800', color: d.overdue ? c.danger : c.text, marginTop: 2 }} />
      <FlexWidget style={{ width: 'match_parent', flexDirection: 'row', marginTop: 8 }}>
        {stat(d.overdue, 'Overdue', d.overdue ? c.danger : c.text)}
        {stat(d.today, 'Today', d.today ? c.accent : c.text)}
        {stat(d.open, 'Open', c.text)}
      </FlexWidget>
      <TextWidget text={d.nextLine} maxLines={1} truncate="END" style={{ fontSize: 11, color: c.dim, marginTop: 8 }} />
    </Card>
  );
}

/** Overdue and today's entries; the circle completes one without opening the app. */
function WorkTodayView({ c, d }) {
  return (
    <Card c={c} path="work" a11y="Working Dashboard today">
      <FlexWidget style={{ width: 'match_parent', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <TextWidget text="💼 Work today" style={{ fontSize: 15, fontWeight: '800', color: c.text }} />
        <TextWidget text={d.headline} style={{ fontSize: 12, color: c.dim }} />
      </FlexWidget>
      {!d.rows.length && <TextWidget text="Nothing overdue or due today." style={{ fontSize: 13, color: c.dim, marginTop: 10 }} />}
      {d.rows.map((r) => (
        <FlexWidget key={r.id} style={{ width: 'match_parent', flexDirection: 'row', alignItems: 'center', marginTop: 8 }}>
          <FlexWidget
            clickAction="WD_DONE"
            clickActionData={{ id: r.id }}
            accessibilityLabel={`Mark ${r.title} done`}
            style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: r.late ? c.danger : c.accent, marginRight: 10 }}
          />
          <FlexWidget style={{ flex: 1 }}>
            <TextWidget text={`${r.high ? '🔴 ' : ''}${r.title}`} maxLines={1} truncate="END" style={{ fontSize: 14, color: c.text }} />
          </FlexWidget>
          <TextWidget text={r.when} style={{ fontSize: 12, color: r.late ? c.danger : c.dim, marginLeft: 8 }} />
        </FlexWidget>
      ))}
      {d.more > 0 && <TextWidget text={`+${d.more} more`} style={{ fontSize: 12, color: c.accent, marginTop: 6 }} />}
    </Card>
  );
}

/** The next entry due, how long until it, and the nearest deadline. */
function WorkNextView({ c, d }) {
  return (
    <Card c={c} path="work" a11y="Next work entry">
      <TextWidget text="⏰ Next up" style={{ fontSize: 13, fontWeight: '700', color: c.dim }} />
      <TextWidget text={d.title} maxLines={2} truncate="END" style={{ fontSize: 15, fontWeight: '800', color: d.has ? c.text : c.dim, marginTop: 4 }} />
      <TextWidget text={d.when} maxLines={1} style={{ fontSize: 12, color: d.high ? c.danger : c.accent, marginTop: 4 }} />
      {!!d.priority && <TextWidget text={`${d.priority} priority`} style={{ fontSize: 11, color: c.dim, marginTop: 2 }} />}
      {!!d.deadline && <TextWidget text={d.deadline} maxLines={1} truncate="END" style={{ fontSize: 11, color: c.dim, marginTop: 6 }} />}
    </Card>
  );
}

const LABEL = { WorkSummaryWidget: 'Work', WorkTodayWidget: 'Work today', WorkNextWidget: 'Next up' };

/** Reads the saved data and returns the light + dark layout for one widget. */
export async function renderWidgetByName(name, now = new Date()) {
  const { core, slices } = await loadAll();
  const db = assemble(core, slices || {});
  const build = (c) => {
    if (widgetsHidden(db)) return <Locked c={c} label={LABEL[name] || 'Working Dashboard'} />;
    if (name === 'WorkSummaryWidget') return <WorkSummaryView c={c} d={workSummaryWidgetData(db, now)} />;
    if (name === 'WorkTodayWidget') return <WorkTodayView c={c} d={workTodayWidgetData(db, now)} />;
    if (name === 'WorkNextWidget') return <WorkNextView c={c} d={workNextWidgetData(db, now)} />;
    return null;
  };
  return { light: build(PALETTE.light), dark: build(PALETTE.dark) };
}

/** The OS asking for a widget: added, resized, its 30-minute refresh, or a tap. */
export async function widgetTaskHandler({ widgetInfo, widgetAction, clickAction, clickActionData, renderWidget }) {
  if (widgetAction === 'WIDGET_DELETED') return;
  // A Working Dashboard entry ticked off on the widget: completed (a repeating one rolls on) and its alerts stop.
  if (widgetAction === 'WIDGET_CLICK' && clickAction === 'WD_DONE' && clickActionData?.id) {
    const { core, slices } = await loadAll();
    // A failure here must not leave the widget undrawn: it is redrawn below either way.
    try { if (!widgetsHidden(assemble(core, slices || {}))) await completeWdEntry(String(clickActionData.id)); } catch { /* shown unchanged */ }
  }
  renderWidget(await renderWidgetByName(widgetInfo.widgetName));
}

/** Redraws every placed widget; called when the data they show changes. */
export async function refreshWidgets() {
  if (Platform.OS !== 'android') return;
  for (const widgetName of WIDGET_NAMES) {
    try {
      await requestWidgetUpdate({ widgetName, renderWidget: () => renderWidgetByName(widgetName) });
    } catch { /* no widget placed, or a build without the widget module */ }
  }
}

