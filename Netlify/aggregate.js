const { parseTravelPlanBuffer, groupIntoTrips, extractDestinations, extractFacilities } = require('./parseTravelPlan');

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// Common spelling variants seen across travel-plan entries, mapped to one canonical district name.
// Add to this list over time as new variants show up.
const DISTRICT_ALIASES = {
  'raibareilly': 'Raebareli',
  'raebarely': 'Raebareli',
  'rae bareli': 'Raebareli',
  'raebareily': 'Raebareli',
  'baghpat': 'Bagpat',
  'gautam budh nagar': 'Gautam Buddha Nagar',
  'gb nagar': 'Gautam Buddha Nagar',
  'gautam buddh nagar': 'Gautam Buddha Nagar',
};

function canonicalDistrictName(name) {
  const key = name.trim().toLowerCase();
  return DISTRICT_ALIASES[key] || name.trim();
}

function monthLabel(monthKey) {
  const [y, m] = monthKey.split('-').map(Number);
  return `${MONTH_NAMES[m - 1]} ${y}`;
}

/**
 * monthsData: array of { month: 'YYYY-MM', travelPlanBuffer: Buffer|null, tripReportText: string }
 * Returns: { districts: Map(districtName -> {visits, facilities:Set, levelGuess:Set, notesByMonth: Map(month -> [snippets])}) }
 */
async function aggregate(monthsData) {
  const districts = new Map();

  function ensureDistrict(name) {
    if (!districts.has(name)) {
      districts.set(name, { visits: 0, facilities: new Set(), notesByMonth: new Map() });
    }
    return districts.get(name);
  }

  for (const { month, travelPlanBuffer } of monthsData) {
    if (!travelPlanBuffer) continue;
    let rows;
    try {
      rows = await parseTravelPlanBuffer(travelPlanBuffer);
    } catch (e) {
      continue; // skip unreadable files rather than failing the whole report
    }
    const trips = groupIntoTrips(rows);

    for (const trip of trips) {
      const districtsInTrip = new Set();
      for (const row of trip.rows) {
        const dests = extractDestinations(row.locationTo);
        const facilities = extractFacilities(row.remarks);
        dests.forEach((raw) => {
          const d = canonicalDistrictName(raw);
          districtsInTrip.add(d);
          const rec = ensureDistrict(d);
          facilities.forEach((f) => rec.facilities.add(f));
        });
      }
      districtsInTrip.forEach((d) => {
        ensureDistrict(d).visits += 1;
      });
    }
  }

  // Match each month's pasted trip-report text to districts by simple keyword search,
  // splitting the pasted text into paragraphs so only the relevant part is attached.
  for (const { month, tripReportText } of monthsData) {
    if (!tripReportText || !tripReportText.trim()) continue;
    const paragraphs = tripReportText.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
    for (const [districtName, rec] of districts.entries()) {
      const keywords = [districtName, ...Array.from(rec.facilities)].map((k) => k.toLowerCase());
      const matches = paragraphs.filter((p) => keywords.some((k) => p.toLowerCase().includes(k)));
      if (matches.length) {
        if (!rec.notesByMonth.has(month)) rec.notesByMonth.set(month, []);
        rec.notesByMonth.get(month).push(...matches);
      }
    }
  }

  return districts;
}

module.exports = { aggregate, monthLabel, MONTH_NAMES, canonicalDistrictName };
