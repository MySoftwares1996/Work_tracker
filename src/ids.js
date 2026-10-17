/** One id maker for everything created on the device (links, templates, checklist steps, undo items): a prefix, the time and a random part. */
export const newId = (prefix = '') => `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
