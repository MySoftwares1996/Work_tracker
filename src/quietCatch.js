/**
 * For fire-and-forget calls that must not break the screen (booking an alert, pushing an edit): the failure is still
 * written to the log - `.catch(warnQuiet('book alert'))` - instead of vanishing in an empty catch.
 */
export const warnQuiet = (what) => (e) => { try { console.warn(`[${what}] ${e && e.message ? e.message : e}`); } catch (_) { /* no console */ } };
