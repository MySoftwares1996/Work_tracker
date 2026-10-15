/**
 * A symbol for every category, worked out from its name, so one you add
 * yourself ("Milk products", "House shifting", "Petrol") gets a fitting icon
 * without picking one. A name that already starts with an emoji keeps it.
 * The first rule whose words appear in the name wins, so the more specific
 * ones come first.
 */
const RULES = [
  [/sav(e|ing)|invest|\bsip\b|mutual|\bfd\b|deposit|gold|stock|share/i, '💰'],
  [/need/i, '🧺'],
  [/want|wish|lifestyle/i, '🎁'],
  [/salary|wage|payroll|stipend/i, '💼'],
  [/bonus|incentive|commission/i, '🏆'],
  [/refund|return|reimburs/i, '↩️'],
  [/cash ?back|reward|cashback/i, '🎁'],
  [/interest|dividend/i, '📈'],
  [/rent(al)? (income|received)|rent received/i, '🏘️'],
  [/milk|dairy|curd|ghee|paneer/i, '🥛'],
  [/vegetable|veggie|sabzi|greens/i, '🥦'],
  [/fruit/i, '🍎'],
  [/\beggs?\b/i, '🥚'],
  [/meat|chicken|mutton|fish|seafood|non.?veg/i, '🍗'],
  [/cool ?drink|soft ?drink|juice|soda|beverage/i, '🥤'],
  [/\btea\b|coffee|chai|cafe/i, '☕'],
  [/snack|biscuit|chips|sweet|bakery|cake/i, '🍪'],
  [/alcohol|liquor|beer|wine|bar\b/i, '🍷'],
  [/restaurant|dining|dine|hotel food|swiggy|zomato|takeaway|order(ed)? food/i, '🍽️'],
  [/grocer|kirana|provision|ration|supermarket|mart\b|daily needs/i, '🛒'],
  [/food|meal|lunch|dinner|breakfast|tiffin/i, '🍽️'],
  [/house ?shift|shifting|moving|packers|relocat/i, '📦'],
  [/appliance|fridge|refrigerator|washing machine|mixer|grinder|\bac\b|cooler|geyser|microwave/i, '🔌'],          // before "home": Home Appliances is not the house
  [/\brent|lease|\bpg\b|hostel/i, '🏠'],
  [/maintenance|society|apartment/i, '🏢'],
  [/repair|plumb|electrician|carpenter|service charge/i, '🔧'],
  [/house|home|household|holding|furnish|furniture|decor/i, '🏠'],
  [/electric|power|current bill|\beb\b/i, '💡'],
  [/water/i, '🚰'],
  [/\bgas\b|lpg|cylinder/i, '🔥'],
  [/mobile|phone|recharge|prepaid|postpaid/i, '📱'],
  [/internet|wifi|broadband|fiber/i, '🌐'],
  [/\bdth\b|cable|\btv\b|netflix|prime|hotstar|subscription|\bott\b/i, '📺'],
  [/fuel|petrol|diesel|cng/i, '⛽'],
  [/\bcabs?\b|taxi|uber|\bola\b|rapido|\bauto\b/i, '🚕'],
  [/\bbus\b|metro|train|\brail/i, '🚆'],
  [/flight|air ?ticket|airline/i, '✈️'],
  [/parking|toll|fastag/i, '🅿️'],
  [/\bcars?\b|bike|vehicle|two.?wheeler/i, '🚗'],
  [/travel|trip|tour|holiday|vacation|transport|commute/i, '🧳'],
  [/medic|pharma|chemist|doctor|hospital|clinic|health|dental|lab test|\bscan/i, '💊'],
  [/insurance|policy|premium|lic\b/i, '🛡️'],
  [/gym|fitness|yoga|sport/i, '🏋️'],
  [/salon|beauty|grooming|haircut|spa|cosmetic/i, '💇'],
  [/baby|kid|child|toy|diaper|tinku/i, '🧸'],
  [/school|tuition|college|\bfees?\b|course|education|\bbooks?\b|stationery/i, '📚'],
  [/cloth|apparel|dress|fashion|shoe|footwear/i, '👕'],
  [/electronic|gadget|laptop|computer|appliance/i, '💻'],
  [/shop|amazon|flipkart|myntra|online order/i, '🛍️'],
  [/movie|cinema|entertain|game|concert|event/i, '🎬'],
  [/gift|present/i, '🎁'],
  [/\bpets?\b|\bdogs?\b|\bcats?\b|\bvet\b/i, '🐾'],
  [/\bemi\b|loan|credit card|card bill|debt|repay/i, '🏦'],
  [/tax|gst|tds|income tax/i, '🧾'],
  [/bill|utility|utilities/i, '🧾'],
  [/donation|charity|temple|church|mosque|pooja|puja|religious/i, '🙏'],
  [/laundry|dry ?clean|ironing/i, '🧺'],
  [/clean|\bmaid|\bcook|\bhelp|servant|driver/i, '🧹'],
  [/office|work|business/i, '💼'],
  [/transfer/i, '🔁'],
  [/family|parents|mother|father|wife|husband/i, '👪'],
  [/misc|other|general|sundry/i, '🗂️'],
  [/unknown|uncategori[sz]ed|unassigned/i, '❔'],
];

/**
 * Whether a code point is an emoji or pictograph. Plain ranges, not a regex with Unicode property escapes
 * (\p{...}): the phone's JavaScript engine may not support those, and a regex it cannot read in a file
 * loaded at start-up would stop the app opening.
 */
const isPictograph = (cp) => (
  (cp >= 0x1F300 && cp <= 0x1FAFF) ||      // symbols & pictographs, transport, emoticons, supplemental
  (cp >= 0x2600 && cp <= 0x27BF) ||        // misc symbols, dingbats
  (cp >= 0x2B00 && cp <= 0x2BFF) ||        // arrows & stars (⭐ ⬆)
  (cp >= 0x2190 && cp <= 0x21FF) ||        // arrows (↩)
  (cp >= 0x1F1E6 && cp <= 0x1F1FF) ||      // regional indicators (flags)
  cp === 0x00A9 || cp === 0x00AE || cp === 0x203C || cp === 0x2049 || cp === 0x2122 || cp === 0x2139 ||
  (cp >= 0x231A && cp <= 0x23FF) ||        // watch, hourglass, media controls
  cp === 0x24C2 || cp === 0x3030 || cp === 0x303D || cp === 0x3297 || cp === 0x3299
);
const isJoiner = (cp) => cp === 0xFE0F || cp === 0x200D || (cp >= 0x1F3FB && cp <= 0x1F3FF) || (cp >= 0xE0020 && cp <= 0xE007F);

/** The emoji a name already starts with (with its variation selector, skin tone and joined parts), or ''. */
export function leadingEmoji(name = '') {
  const chars = Array.from(String(name).trim());     // by code point, so a surrogate pair stays whole
  if (!chars.length || !isPictograph(chars[0].codePointAt(0))) return '';
  let out = chars[0];
  for (let i = 1; i < chars.length; i++) {
    const cp = chars[i].codePointAt(0);
    if (isJoiner(cp)) { out += chars[i]; continue; }
    if (cp !== 0x200D && out.endsWith('\u200D') && isPictograph(cp)) { out += chars[i]; continue; }
    // A second flag letter completes a flag; anything else ends the emoji.
    if (cp >= 0x1F1E6 && cp <= 0x1F1FF && chars[0].codePointAt(0) >= 0x1F1E6 && chars[0].codePointAt(0) <= 0x1F1FF && out.length <= 2) { out += chars[i]; continue; }
    break;
  }
  return out;
}

/** The symbol for a category name: its own leading emoji, else one matched from its words, else 🏷️. */
export function iconFor(name) {
  const s = String(name || '').trim();
  if (!s) return '🏷️';
  const own = leadingEmoji(s);
  if (own) return own;
  for (const [re, icon] of RULES) if (re.test(s)) return icon;
  return '🏷️';
}

/** "🥛 Milk products" for display; a name that already has an emoji is shown as it is. */
export const withIcon = (name) => {
  const s = String(name ?? '');
  return !s.trim() || leadingEmoji(s) ? s : `${iconFor(s)} ${s}`;
};

/** The name without its leading emoji, for places that already show the symbol beside it. */
export const plainName = (name = '') => {
  const s = String(name ?? '');
  const e = leadingEmoji(s);
  return e ? s.trim().slice(e.length).trim() || s : s;
};
