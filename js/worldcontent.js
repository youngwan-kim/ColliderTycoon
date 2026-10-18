/* The world the lab lives in: the states that can found it, join it, or leave it.
 *
 * Each country:
 *   gdp    its 1950 GDP, billions of 1990 international dollars (after Maddison; approximate), the weight of its
 *          contribution and its pull as a member
 *   tr     trend growth against its bloc's (catch-up economies grow faster), in points a year
 *   aff    how keen its scientists and government are on big science (scales every chance to join)
 *   bloc   whose business cycle it follows: 'eu' (Europe) or 'us' (the dollar area, for the rest of the world)
 *   from   the year it can first take part: the West at the founding; behind the Iron Curtain from 1990;
 *          states that became independent from their independence; the wider world from the 1990s
 *   assoc  can only become an associate member (outside Europe)
 *   obs    an observer only (never pays, never votes): the superpowers and Japan
 *   c, r   its tile on the cartogram (column, row); r 8 is the strip "beyond Europe"
 *   names  [[year, name], …]: renamed (and resized, `gdpx`) when borders move: Germany reunited, Czechoslovakia
 *          split, Yugoslavia broken up. `splitFrom`: a member on the day of the split brings this one in too.
 * The host state is always a founder.
 */
var PC = PC || {};

PC.WORLD = {
  host: 'CH',
  founded: 1954,                    // the convention comes into force
  shareCap: 0.22,                   // no member pays more than this share of the budget
  // the budget, relative to a typical game's members at that date (sim/council-calib.js); clamped
  budgetClamp: [0.8, 1.25], budgetPow: 0.4,   // the budget follows (members' total ÷ typical)^0.4: felt, but not ruinous
  wRef: [[1951, 1150], [1954, 1200], [1958, 1280], [1962, 1470], [1966, 1630], [1970, 1800], [1974, 2050], [1978, 2280], [1982, 2550], [1986, 2880], [1990, 3260], [1994, 3780], [1998, 4280], [2002, 4900], [2006, 5570], [2010, 6470], [2014, 7530], [2018, 8530], [2022, 9630], [2026, 10700], [2030, 12100], [2034, 13700], [2038, 15300]],   // sim/council-calib.js
  // a typical lab's reputation by calendar year (the bot's normal play, sim/refs.js): the lab's standing is measured against it
  repRef: [[1950, 0], [1954, 45], [1958, 86], [1962, 150], [1966, 217], [1970, 358], [1974, 740], [1978, 2200], [1982, 5700],
    [1986, 1.76e4], [1990, 5.4e4], [1994, 7e4], [1998, 9.8e4], [2002, 1.01e5], [2006, 1.04e5], [2010, 2.15e5], [2014, 1.15e6],
    [2018, 1.33e6], [2022, 1.61e6], [2026, 1.85e6], [2030, 1.96e6], [2034, 2.2e6], [2040, 4e6]],
  // a typical lab's funding received so far (this generation) by calendar year, the same play: the audits weigh reputation against it
  fundsRef: [[1950, 0], [1954, 2.2e3], [1958, 3.1e4], [1962, 1.1e5], [1966, 4.6e5], [1970, 3.4e6], [1974, 3.2e8], [1978, 1.8e10],
    [1982, 6.6e11], [1986, 5.6e13], [1990, 2e15], [1994, 6.1e15], [1998, 1.7e16], [2002, 2.35e16], [2006, 3.5e16], [2010, 7.6e17],
    [2014, 1.05e21], [2018, 3.4e21], [2022, 1.3e22], [2026, 4.2e22], [2030, 7.3e22], [2034, 2.6e23], [2040, 2.3e24]]
};

PC.COUNTRIES = [
  // the West: free to found the lab
  { id: 'CH', name: 'Switzerland', gdp: 42.5, tr: -0.3, aff: 1.3, bloc: 'eu', from: 1950, c: 3, r: 4 },
  { id: 'FR', name: 'France', gdp: 220.5, tr: 0.3, aff: 1.2, bloc: 'eu', from: 1950, c: 2, r: 3 },
  { id: 'DE', name: 'West Germany', gdp: 265.4, tr: 0.5, aff: 1.2, bloc: 'eu', from: 1950, c: 4, r: 2, names: [[1990, 'Germany']], gdpx: [[1990, 1.2]] },
  { id: 'GB', name: 'United Kingdom', gdp: 347.9, tr: -0.4, aff: 1.0, bloc: 'eu', from: 1950, c: 2, r: 1 },
  { id: 'IT', name: 'Italy', gdp: 165, tr: 0.4, aff: 1.1, bloc: 'eu', from: 1950, c: 4, r: 5 },
  { id: 'NL', name: 'Netherlands', gdp: 60.6, tr: 0.1, aff: 1.1, bloc: 'eu', from: 1950, c: 3, r: 2 },
  { id: 'BE', name: 'Belgium', gdp: 47.2, tr: -0.1, aff: 1.1, bloc: 'eu', from: 1950, c: 2, r: 2 },
  { id: 'LU', name: 'Luxembourg', gdp: 2.5, tr: 0.8, aff: 0.4, bloc: 'eu', from: 1950, c: 3, r: 3 },
  { id: 'SE', name: 'Sweden', gdp: 47.3, tr: 0, aff: 1.0, bloc: 'eu', from: 1950, c: 5, r: 0 },
  { id: 'NO', name: 'Norway', gdp: 17.7, tr: 0.4, aff: 1.0, bloc: 'eu', from: 1950, c: 4, r: 0 },
  { id: 'DK', name: 'Denmark', gdp: 29.7, tr: -0.1, aff: 1.1, bloc: 'eu', from: 1950, c: 4, r: 1 },
  { id: 'FI', name: 'Finland', gdp: 17.1, tr: 0.4, aff: 0.7, bloc: 'eu', from: 1950, c: 6, r: 0 },
  { id: 'IS', name: 'Iceland', gdp: 0.76, tr: 0.5, aff: 0.2, bloc: 'eu', from: 1950, c: 0, r: 0 },
  { id: 'IE', name: 'Ireland', gdp: 10.2, tr: 1.2, aff: 0.5, bloc: 'eu', from: 1950, c: 1, r: 1 },
  { id: 'AT', name: 'Austria', gdp: 25.7, tr: 0.5, aff: 0.9, bloc: 'eu', from: 1950, c: 4, r: 4 },
  { id: 'ES', name: 'Spain', gdp: 61.4, tr: 1.0, aff: 0.8, bloc: 'eu', from: 1950, c: 1, r: 4 },
  { id: 'PT', name: 'Portugal', gdp: 17.6, tr: 0.8, aff: 0.7, bloc: 'eu', from: 1950, c: 0, r: 4 },
  { id: 'GR', name: 'Greece', gdp: 14.5, tr: 0.6, aff: 0.9, bloc: 'eu', from: 1950, c: 6, r: 6 },
  { id: 'TR', name: 'Turkey', gdp: 34.3, tr: 1.0, aff: 0.6, bloc: 'eu', from: 1950, c: 7, r: 6 },
  { id: 'RS', name: 'Yugoslavia', gdp: 25.3, tr: 0.3, aff: 0.8, bloc: 'eu', from: 1950, c: 6, r: 5, names: [[1992, 'Serbia']], gdpx: [[1992, 0.35]] },
  // behind the Iron Curtain until 1990
  { id: 'PL', name: 'Poland', gdp: 60.7, tr: 0.6, aff: 1.0, bloc: 'eu', from: 1990, c: 5, r: 2 },
  { id: 'CZ', name: 'Czechoslovakia', gdp: 43.4, tr: 0.2, aff: 1.0, bloc: 'eu', from: 1990, c: 4, r: 3, names: [[1993, 'Czechia']], gdpx: [[1993, 0.7]] },
  { id: 'SK', name: 'Slovakia', gdp: 13, tr: 0.6, aff: 1.0, bloc: 'eu', from: 1993, c: 5, r: 3, splitFrom: 'CZ' },
  { id: 'HU', name: 'Hungary', gdp: 23.2, tr: 0.3, aff: 1.0, bloc: 'eu', from: 1990, c: 5, r: 4 },
  { id: 'RO', name: 'Romania', gdp: 19.3, tr: 0.6, aff: 0.9, bloc: 'eu', from: 1990, c: 6, r: 4 },
  { id: 'BG', name: 'Bulgaria', gdp: 11.9, tr: 0.4, aff: 0.8, bloc: 'eu', from: 1990, c: 7, r: 5 },
  // independent from the 1990s
  { id: 'SI', name: 'Slovenia', gdp: 5.6, tr: 0.6, aff: 0.8, bloc: 'eu', from: 1992, c: 4, r: 6 },
  { id: 'HR', name: 'Croatia', gdp: 7.1, tr: 0.4, aff: 0.7, bloc: 'eu', from: 1992, c: 5, r: 5 },
  { id: 'EE', name: 'Estonia', gdp: 3, tr: 1.0, aff: 0.9, bloc: 'eu', from: 1991, c: 6, r: 1 },
  { id: 'LV', name: 'Latvia', gdp: 5.4, tr: 0.8, aff: 0.8, bloc: 'eu', from: 1991, c: 6, r: 2 },
  { id: 'LT', name: 'Lithuania', gdp: 6, tr: 0.8, aff: 0.8, bloc: 'eu', from: 1991, c: 6, r: 3 },
  { id: 'UA', name: 'Ukraine', gdp: 82.6, tr: -0.5, aff: 0.7, bloc: 'eu', from: 1991, c: 7, r: 3 },
  { id: 'CY', name: 'Cyprus', gdp: 0.9, tr: 1.0, aff: 0.6, bloc: 'eu', from: 1960, c: 8, r: 6 },
  { id: 'MT', name: 'Malta', gdp: 0.3, tr: 1.0, aff: 0.3, bloc: 'eu', from: 1964, c: 3, r: 6 },
  // beyond Europe: associates; observers
  { id: 'IL', name: 'Israel', gdp: 3.6, tr: 1.5, aff: 1.0, bloc: 'us', from: 1990, c: 0, r: 8 },
  { id: 'IN', name: 'India', gdp: 222.2, tr: 1.5, aff: 0.8, bloc: 'us', from: 1995, assoc: true, c: 1, r: 8 },
  { id: 'PK', name: 'Pakistan', gdp: 25.4, tr: 1.0, aff: 0.7, bloc: 'us', from: 1995, assoc: true, c: 2, r: 8 },
  { id: 'BR', name: 'Brazil', gdp: 89.3, tr: 0.8, aff: 0.7, bloc: 'us', from: 1995, assoc: true, c: 3, r: 8 },
  { id: 'RU', name: 'Soviet Union', gdp: 510.2, tr: -0.5, aff: 0, bloc: 'eu', from: 1993, obs: true, c: 8, r: 2, names: [[1992, 'Russia']], gdpx: [[1992, 0.6]] },
  { id: 'US', name: 'United States', gdp: 1455.9, tr: 0, aff: 0, bloc: 'us', from: 1997, obs: true, c: 5, r: 8 },
  { id: 'JP', name: 'Japan', gdp: 161, tr: 1.2, aff: 0, bloc: 'us', from: 1995, obs: true, c: 6, r: 8 }
];
PC.COUNTRYMAP = {};
PC.COUNTRIES.forEach(function (c) { PC.COUNTRYMAP[c.id] = c; });

/* The European assembly's political groups, left to right, and where they stand (−1 … +1) on:
 *   R research spending · G green regulation (energy taxes, nuclear safety, data protection) · X enlargement and
 *   openness · A austerity
 * base: their share of the vote in normal times; `rise`: the year a group starts to grow into it (the Greens). */
PC.GROUPS = [
  { id: 'left', name: 'Left', short: 'LEFT', col: '#b8323a', base: 0.09, st: { R: 0.3, G: 0.6, X: 0.0, A: -0.9 } },
  { id: 'green', name: 'Greens', short: 'GRN', col: '#3f8f4f', base: 0.08, rise: 1975, st: { R: 0.4, G: 1.0, X: 0.4, A: -0.4 } },
  { id: 'soc', name: 'Socialists', short: 'SOC', col: '#e0707a', base: 0.29, st: { R: 0.6, G: 0.4, X: 0.5, A: -0.5 } },
  { id: 'lib', name: 'Liberals', short: 'LIB', col: '#e3a72f', base: 0.10, st: { R: 0.7, G: -0.2, X: 0.8, A: 0.5 } },
  { id: 'cd', name: 'Christian Democrats', short: 'CD', col: '#3d74c9', base: 0.30, st: { R: 0.5, G: -0.1, X: 0.6, A: 0.6 } },
  { id: 'con', name: 'Conservatives', short: 'CON', col: '#2a4a7f', base: 0.11, st: { R: 0.2, G: -0.5, X: -0.2, A: 0.9 } },
  { id: 'nat', name: 'Nationalists', short: 'NAT', col: '#8a6a45', base: 0.03, st: { R: -0.5, G: -0.6, X: -1.0, A: 0.2 } }
];

/* The bills that can come before the assembly. w: how each stance weighs on support (support = Σ w·stance);
 * want: +1 the lab wants it passed, −1 rejected; fx: what it does while in force (yrs years): budget (×), power
 * (× the energy price the lab pays), fac/tech/staff/store (× costs), rep (× reputation earned), accession (× the
 * chance a state applies). from: the earliest year it can be tabled. Before direct elections (1979) the assembly
 * is only consulted: a law does half as much. */
PC.BILLS = [
  { id: 'fp', name: 'Framework Programme for Research', w: { R: 1 }, want: 1, yrs: 7, from: 1975, fx: { budget: 1.06 },
    desc: 'A multi-year research budget, part of it for the lab.' },
  { id: 'roadmap', name: 'Research infrastructure roadmap', w: { R: 0.8, X: 0.2 }, want: 1, yrs: 8, from: 1990, fx: { fac: 0.95 },
    desc: 'Co-funds big facilities: new machines cost less.' },
  { id: 'mobility', name: 'Researcher mobility and visas', w: { X: 0.6, R: 0.4 }, want: 1, yrs: 8, from: 1968, fx: { staff: 0.92 },
    desc: 'Scientists move freely between member states: hiring costs less.' },
  { id: 'procure', name: 'Open public procurement', w: { A: 0.5, X: 0.3, R: 0.2 }, want: 1, yrs: 6, from: 1962, fx: { tech: 0.97, fac: 0.98 },
    desc: 'Competitive tenders across borders: upgrades cost less.' },
  { id: 'open', name: 'Open science mandate', w: { R: 0.6, G: 0.2, X: 0.2 }, want: 1, yrs: 8, from: 1995, fx: { rep: 1.08, store: 1.05 },
    desc: 'Publications and data open to all: more reputation, more storage to keep.' },
  { id: 'enlarge', name: 'Enlargement treaty', w: { X: 1 }, want: 1, yrs: 10, from: 1958, fx: { accession: 1.8 },
    desc: 'Opens the door to new states: more of them apply to the lab too.' },
  { id: 'austerity', name: 'Stability and growth pact', w: { A: 1 }, want: -1, yrs: 5, from: 1958, fx: { budget: 0.94 },
    desc: 'Deficit limits for every government: contributions are cut.' },
  { id: 'cuts', name: 'Review of research spending', w: { R: -1, A: 0.3 }, want: -1, yrs: 5, from: 1958, fx: { budget: 0.95 },
    desc: 'Questions what big science gives back: the budget shrinks.' },
  { id: 'energytax', name: 'Energy taxation directive', w: { G: 1, A: -0.2 }, want: -1, yrs: 6, from: 1975, fx: { power: 1.25 },
    desc: 'Taxes on electricity: the lab’s power bill rises.' },
  { id: 'radiation', name: 'Radiation protection directive', w: { G: 0.7, R: -0.3 }, want: -1, yrs: 8, from: 1959, fx: { fac: 1.07, tech: 1.04 },
    desc: 'Stricter shielding and safety rules: machines and upgrades cost more.' },
  { id: 'dataprot', name: 'Data protection regulation', w: { G: 0.4, X: -0.2, A: -0.2 }, want: -1, yrs: 6, from: 1990, fx: { store: 1.06 },
    desc: 'Every stored record is regulated: storage costs more.' }
];
PC.BILLMAP = {};
PC.BILLS.forEach(function (b) { PC.BILLMAP[b.id] = b; });
