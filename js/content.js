/* Particle Clicker: Content (stage 1, hadron branch).
 *
 * One laboratory following CERN's real proton chain
 *   Linac → PS Booster → PS → SPS → (Sp̄pS) → LHC → HL-LHC
 * and one general-purpose experiment that grows from a fixed-target spectrometer
 * into a CMS-like detector.
 *
 * Units shown to the player are real. `lumi`, `cost` and `need` are game-balance
 * values fitted by sim/calibrate.sh.
 * Beam types: cosmic, p-fixed (E = beam energy), pp, ppbar (E = √s), in GeV.
 */
var PC = PC || {};

PC.BEAM_LABEL = { cosmic: 'cosmic rays', 'p-fixed': 'p on fixed target', pp: 'pp', ppbar: 'pp̄' };
PC.COLLIDER_BEAMS = ['pp', 'ppbar'];

/* What the lab owns on day one: a scintillator test stand recording cosmic muons. */
PC.START = { fac: ['cosmic'], tech: ['paddles'] };

/* Tech-tree lanes, top to bottom. */
PC.LANES = [
  { id: 'machine', name: 'Accelerators' },
  { id: 'beam', name: 'Beam technology' },
  { id: 'tracking', name: 'Tracking' },
  { id: 'calo', name: 'Calorimetry' },
  { id: 'magnet', name: 'Magnet' },
  { id: 'muon', name: 'Muon system' },
  { id: 'trigger', name: 'Trigger & DAQ' },
  { id: 'computing', name: 'Computing' },
  { id: 'storage', name: 'Storage' }
];

/* ───────────────────────────── Machines ─────────────────────────────
 * role: physics (delivers beam to the experiment) | injector (boosts machines downstream)
 * fx.lumi on a machine multiplies the luminosity of the listed machines.
 * map: which ring or line the complex map draws for it.
 */
PC.FACILITIES = [
  { id: 'cosmic', name: 'Cosmic rays', year: 1912, cost: 0, build: 0, lumi: 0.4, role: 'physics',
    beams: [{ b: 'cosmic', E: 1e6 }], spec: '~1 muon per cm² per minute at sea level',
    desc: 'Free beam from the sky. CMS itself was commissioned on cosmic muons before the LHC had beam.' },
  { id: 'linac1', name: 'Linac 1', year: 1959, cost: 11, build: 20, lumi: 2, role: 'physics', map: 'linac',
    beams: [{ b: 'p-fixed', E: 0.05 }], spec: '50 MeV protons',
    desc: 'CERN’s first linear accelerator: the start of every proton’s journey.' },
  { id: 'ps', name: 'Proton Synchrotron (PS)', year: 1959, cost: 1.1e2, build: 60, lumi: 20, role: 'physics', map: 'ps',
    beams: [{ b: 'p-fixed', E: 28 }], spec: '28 GeV · 628 m circumference', requires: ['linac1', 'strongFocus'],
    desc: 'The first strong-focusing synchrotron to run at full energy. Still the heart of the complex.' },
  { id: 'psb', name: 'PS Booster', year: 1972, cost: 6.1e3, build: 90, lumi: 0, role: 'injector', map: 'psb',
    beams: [], spec: '4 stacked rings · 800 MeV', requires: ['ps'],
    fx: { lumi: { mult: 3, fac: ['ps', 'sps', 'sppbar', 'lhc'] } },
    desc: 'Four small rings stacked on top of each other: more protons per pulse for everything downstream.' },
  { id: 'linac2', name: 'Linac 2', year: 1978, cost: 1.6e4, build: 90, lumi: 0, role: 'injector', map: 'linac',
    beams: [], spec: '50 MeV · higher intensity', requires: ['psb'],
    fx: { lumi: { mult: 2, fac: ['ps', 'sps', 'sppbar', 'lhc'] } },
    desc: 'Replaced Linac 1 and fed the complex for 40 years.' },
  { id: 'sps', name: 'Super Proton Synchrotron (SPS)', year: 1976, cost: 3.4e6, build: 180, lumi: 400, role: 'physics', map: 'sps',
    beams: [{ b: 'p-fixed', E: 400 }], spec: '400 GeV · 6.9 km, underground', requires: ['ps', 'psb'],
    desc: 'The first ring to cross the French–Swiss border. Its beams feed the North Area experiments.' },
  { id: 'aa', name: 'Antiproton Accumulator', year: 1980, cost: 1.7e9, build: 180, lumi: 0, role: 'injector', map: 'aa',
    beams: [], spec: '3.5 GeV p̄ · stochastic cooling', requires: ['stochCool'],
    desc: 'Collects antiprotons made in a target and cools them for days into a dense beam.' },
  { id: 'sppbar', name: 'Sp̄pS collider', year: 1981, cost: 3.3e9, build: 300, lumi: 8e3, role: 'physics', map: 'sps',
    beams: [{ b: 'ppbar', E: 630 }], spec: '√s = 540–630 GeV · protons vs antiprotons', requires: ['sps', 'aa'],
    desc: 'Rubbia’s idea: run protons and antiprotons in opposite directions in the same SPS ring.' },
  { id: 'lhc', name: 'Large Hadron Collider', year: 2010, cost: 6.9e15, build: 900, lumi: 2e5, role: 'physics', map: 'lhc',
    beams: [{ b: 'pp', E: 7000 }], spec: '√s = 7 TeV · 27 km · 1232 dipoles at 1.9 K', requires: ['tunnel27', 'twinDipole', 'sps'],
    desc: 'Two proton beams in one cryostat, injected from the SPS through two 3 km transfer lines.' },
  { id: 'linac4', name: 'Linac 4', year: 2020, cost: 3.1e21, build: 600, lumi: 0, role: 'injector', map: 'linac',
    beams: [], spec: '160 MeV H⁻ ions', requires: ['lhc', 'linac2'],
    fx: { lumi: { mult: 1.6, fac: ['lhc'] } },
    desc: 'Accelerates negative hydrogen ions, stripped on injection: brighter beams for the HL-LHC.' }
];

/* ───────────────────────────── Technologies ─────────────────────────────
 * lane: tree lane · install: seconds of Long Shutdown work (0 = immediate)
 * fx: { lumi:{mult, fac?|beams?}, energy:{fac, b, E}, quality, trigger, compute,
 *       analysis, funding, rep, pileup, autoPublish, B (tesla), res (σm/m) }
 */
PC.TECH = [
  /* Beam technology */
  { id: 'strongFocus', lane: 'beam', name: 'Strong focusing', year: 1952, cost: 67, install: 0,
    requires: ['linac1'], fx: {}, desc: 'Courant, Livingston and Snyder: alternate focusing and defocusing magnets give net focusing and much smaller magnets.' },
  { id: 'slowExtract', lane: 'beam', name: 'Resonant slow extraction', year: 1963, cost: 1.1e4, install: 20,
    requires: ['ps'], fx: { lumi: { mult: 2, beams: ['p-fixed'] } },
    desc: 'Peel the beam off over a second instead of a microsecond: a steady spill for fixed-target detectors.' },
  { id: 'stochCool', lane: 'beam', name: 'Stochastic cooling', year: 1978, cost: 6.1e8, install: 0,
    requires: ['sps'], fx: {}, nobel: 'van der Meer, 1984',
    desc: 'Sense a beam’s spread, kick it back. Demonstrated at CERN’s ICE ring in 1978.' },
  { id: 'lowBeta', lane: 'beam', name: 'Low-β insertions', year: 1983, cost: 3.3e13, install: 120,
    requires: ['sppbar'], fx: { lumi: { mult: 2.5, beams: ['pp', 'ppbar'] } },
    desc: 'Squeeze the beams hard at the collision point. Collider luminosity ×2.5.' },
  { id: 'scMagnets', lane: 'beam', name: 'Superconducting NbTi magnets', year: 1983, cost: 1.1e14, install: 0,
    requires: ['sppbar'], fx: {}, desc: 'Niobium-titanium cable at 4.2 K carries thousands of amps with no resistance.' },
  { id: 'tunnel27', lane: 'beam', name: '27 km tunnel', year: 1988, cost: 7.2e13, install: 0,
    requires: ['sppbar'], fx: {}, desc: 'Dug 1983–88 between Lake Geneva and the Jura, 100 m underground.' },
  { id: 'twinDipole', lane: 'beam', name: '8.3 T twin-aperture dipoles', year: 2008, cost: 1.7e15, install: 0,
    requires: ['scMagnets', 'tunnel27'], fx: {}, desc: 'Two beam pipes in one magnet, cooled to 1.9 K with superfluid helium.' },
  { id: 'lhc8', lane: 'beam', name: 'LHC at 8 TeV', year: 2012, cost: 1.1e20, install: 240,
    requires: ['lhc'], fx: { energy: { fac: 'lhc', b: 'pp', E: 8000 }, lumi: { mult: 2, fac: ['lhc'] } },
    desc: 'After the 2008 splice incident the LHC ran cautiously, at 7 then 8 TeV.' },
  { id: 'ls1', lane: 'beam', name: 'Splice consolidation → 13 TeV', year: 2015, cost: 2.5e20, install: 900,
    requires: ['lhc8'], fx: { energy: { fac: 'lhc', b: 'pp', E: 13000 }, lumi: { mult: 2, fac: ['lhc'] } },
    desc: 'Long Shutdown 1 (2013–15): 10,000 magnet interconnects repaired for 6.5 TeV per beam.' },
  { id: 'liu', lane: 'beam', name: 'Injector upgrade → 13.6 TeV', year: 2022, cost: 5.8e21, install: 900,
    requires: ['ls1', 'linac4'], fx: { energy: { fac: 'lhc', b: 'pp', E: 13600 }, lumi: { mult: 2, fac: ['lhc'] } },
    desc: 'Long Shutdown 2: brighter beams from the Booster, PS and SPS.' },
  { id: 'nb3sn', lane: 'beam', name: 'Nb₃Sn final-focus quadrupoles', year: 2030, cost: 6.7e21, install: 1500,
    requires: ['liu'], fx: { lumi: { mult: 5, fac: ['lhc'] }, pileup: 0.4 },
    desc: 'HL-LHC: 11–12 T magnets give 5× luminosity, and up to 200 collisions per crossing.' },
  { id: 'crab', lane: 'beam', name: 'Crab cavities', year: 2030, cost: 2.6e23, install: 900,
    requires: ['nb3sn'], fx: { lumi: { mult: 2, fac: ['lhc'] } },
    desc: 'Tilt the bunches so they still meet head-on despite the crossing angle.' },

  /* Tracking */
  { id: 'spark', lane: 'tracking', name: 'Spark chambers', year: 1959, cost: 2.4e2, install: 15,
    requires: ['ps'], caps: ['tracking'], fx: { quality: 1.5, res: 0.06 },
    desc: 'High voltage between plates, triggered by counters: a spark marks where the particle passed.' },
  { id: 'mwpc', lane: 'tracking', name: 'Multi-wire proportional chambers', year: 1968, cost: 3.2e3, install: 30,
    requires: ['spark', 'nim'], caps: ['mwpc'], fx: { quality: 2, res: 0.03 }, nobel: 'Charpak, 1992',
    desc: 'Charpak’s wires read out electronically, a thousand times faster than spark chambers.' },
  { id: 'drift', lane: 'tracking', name: 'Drift chambers', year: 1971, cost: 3.3e5, install: 60,
    requires: ['mwpc'], caps: ['drift'], fx: { quality: 2, res: 0.02 },
    desc: 'Time the electrons’ drift to the wire: 100 μm positions with few wires.' },
  { id: 'imageCh', lane: 'tracking', name: 'Central drift “image chamber”', year: 1981, cost: 1.5e10, install: 120,
    requires: ['drift', 'sppbar'], caps: ['central'], fx: { quality: 2, res: 0.015 },
    desc: 'UA1’s 6 m cylinder of drift cells: the first electronic bubble chamber around a collider.' },
  { id: 'siStrips', lane: 'tracking', name: 'Silicon microstrips', year: 1983, cost: 1.7e12, install: 240,
    requires: ['imageCh'], caps: ['silicon'], fx: { quality: 3, res: 0.012 },
    desc: 'Lithographed silicon resolves 10 μm: enough to see b-hadrons fly before decaying. CMS has 200 m² of it.' },
  { id: 'pixels', lane: 'tracking', name: 'Hybrid silicon pixels', year: 2008, cost: 3.1e17, install: 480,
    requires: ['siStrips', 'lhc'], caps: ['pixel'], fx: { quality: 3, res: 0.009 },
    desc: '66 million 100×150 μm pixels, radiation-hard, 4 cm from the beam.' },
  { id: 'tracker4d', lane: 'tracking', name: 'Phase-2 tracker + timing layer', year: 2029, cost: 1e22, install: 1500,
    requires: ['pixels', 'nb3sn'], caps: ['timing'], fx: { quality: 2, res: 0.007 },
    desc: 'New tracker plus 30 ps timing per track: separates 200 pile-up collisions in time as well as space.' },

  /* Calorimetry */
  { id: 'leadGlass', lane: 'calo', name: 'Lead-glass & sampling calorimeters', year: 1965, cost: 1.5e3, install: 20,
    requires: ['ps'], caps: ['calo'], fx: { quality: 1.5 },
    desc: 'Measure energy by stopping the particle: electrons and photons shower in lead.' },
  { id: 'hermetic', lane: 'calo', name: 'Hermetic calorimetry', year: 1981, cost: 5.2e10, install: 120,
    requires: ['leadGlass', 'sppbar'], caps: ['hermetic'], fx: { quality: 2 },
    desc: 'Cover every direction, so the energy that is missing reveals neutrinos (UA1, UA2).' },
  { id: 'pbwo4', lane: 'calo', name: 'Lead-tungstate crystal ECAL', year: 2008, cost: 3.1e13, install: 480,
    requires: ['hermetic', 'lhc'], caps: ['crystal'], fx: { quality: 2.5 },
    desc: '75,848 PbWO₄ crystals, dense enough that one radiation length is 9 mm. Built for H→γγ.' },
  { id: 'brassHcal', lane: 'calo', name: 'Brass–scintillator HCAL', year: 2008, cost: 1e17, install: 480,
    requires: ['pbwo4'], caps: ['hcal'], fx: { quality: 1.5 },
    desc: 'Absorber partly made from melted-down Russian navy artillery shells.' },
  { id: 'hgcal', lane: 'calo', name: 'High-granularity calorimeter', year: 2029, cost: 5.5e22, install: 1500,
    requires: ['brassHcal', 'tracker4d'], caps: ['hgcal'], fx: { quality: 3 },
    desc: 'Phase-2 endcaps: 6 million silicon channels. A calorimeter that tracks showers.' },

  /* Magnet */
  { id: 'dipole', lane: 'magnet', name: 'Spectrometer dipole', year: 1960, cost: 35, install: 10,
    requires: [], caps: ['bfield'], fx: { quality: 1.5, B: 1.5 },
    desc: 'Bend charged particles: the curvature gives charge and momentum.' },
  { id: 'ua1dipole', lane: 'magnet', name: 'UA1 dipole around the beam', year: 1981, cost: 7.7e8, install: 120,
    requires: ['dipole', 'sppbar'], caps: ['colliderMagnet'], fx: { quality: 1.5, B: 0.7 },
    desc: '0.7 T over 85 m³, with the field across the beam line. Later reused by the T2K neutrino experiment.' },
  { id: 'solenoid', lane: 'magnet', name: '3.8 T superconducting solenoid', year: 2008, cost: 3.9e18, install: 600,
    requires: ['ua1dipole', 'scMagnets', 'lhc'], caps: ['solenoid'], fx: { quality: 2, B: 3.8 },
    desc: 'The S in CMS: 6 m bore, 12,500 t, 2.6 GJ stored. The iron yoke returns the field.' },

  /* Muon system */
  { id: 'ironWall', lane: 'muon', name: 'Iron absorber + counters', year: 1965, cost: 5.2e2, install: 15,
    requires: ['ps'], caps: ['muonID'], fx: { quality: 1.5 },
    desc: 'Only muons punch through metres of iron. A wall of counters behind it tags them.' },
  { id: 'muonDrift', lane: 'muon', name: 'Muon drift chambers', year: 1981, cost: 8.2e12, install: 150,
    requires: ['ironWall', 'drift', 'sppbar'], caps: ['muonCh'], fx: { quality: 1.5 },
    desc: 'Track the muon after the iron to measure it a second time.' },
  { id: 'cmsMuon', lane: 'muon', name: 'DT, CSC & RPC stations', year: 2008, cost: 1.2e18, install: 600,
    requires: ['muonDrift', 'lhc'], caps: ['cmsMuon'], fx: { quality: 2 },
    desc: 'Four stations interleaved with the return yoke: drift tubes in the barrel, cathode strips in the endcaps, RPCs for timing.' },
  { id: 'gem', lane: 'muon', name: 'GEM detectors', year: 2021, cost: 9.5e20, install: 900,
    requires: ['cmsMuon', 'ls1'], caps: ['gem'], fx: { quality: 1.5, trigger: 2 },
    desc: 'Gas electron multipliers in the forward muon system, installed during Long Shutdown 2.' },

  /* Trigger & DAQ */
  { id: 'paddles', lane: 'trigger', name: 'Scintillator paddles', year: 1947, cost: 0, install: 0,
    requires: [], caps: ['scint'], fx: {},
    desc: 'Plastic scintillator read by photomultipliers: the cosmic test stand you start with.' },
  { id: 'coinc', lane: 'trigger', name: 'Coincidence trigger', year: 1950, cost: 65, install: 5,
    requires: [], caps: ['coinc'], fx: { trigger: 4 }, nobel: 'Bothe, 1954',
    desc: 'Record only when two counters fire together. The first trigger.' },
  { id: 'nim', lane: 'trigger', name: 'NIM fast electronics', year: 1964, cost: 9e2, install: 15,
    requires: ['coinc', 'ps'], caps: ['nim'], fx: { trigger: 8 },
    desc: 'Standard plug-in modules for discriminators and logic: nanosecond triggers.' },
  { id: 'camac', lane: 'trigger', name: 'CAMAC readout', year: 1972, cost: 2.9e5, install: 40,
    requires: ['nim', 'mwpc'], fx: { trigger: 8 },
    desc: 'A standard crate connecting thousands of channels to a computer.' },
  { id: 'multilevel', lane: 'trigger', name: 'Multi-level trigger', year: 1981, cost: 3e11, install: 150,
    requires: ['camac', 'sppbar'], caps: ['multilevel'], fx: { trigger: 15 },
    desc: 'Fast hardware logic, then processors: keep 1 collision in 10⁵.' },
  { id: 'hlt', lane: 'trigger', name: 'L1 + software High-Level Trigger', year: 2008, cost: 1.1e19, install: 480,
    requires: ['multilevel', 'farms', 'lhc'], caps: ['hlt'], fx: { trigger: 30 },
    desc: '40 MHz of collisions → 100 kHz in custom hardware → 1 kHz written after full reconstruction.' },
  { id: 'gpuHlt', lane: 'trigger', name: 'GPU-accelerated HLT', year: 2022, cost: 5.4e21, install: 600,
    requires: ['hlt', 'ml'], fx: { trigger: 6 },
    desc: 'Pixel tracks and calorimeter clusters reconstructed on GPUs (CMS Patatrack).' },
  { id: 'l1track', lane: 'trigger', name: 'L1 track trigger', year: 2029, cost: 2.7e22, install: 1200,
    requires: ['gpuHlt', 'tracker4d'], caps: ['l1track'], fx: { trigger: 8 },
    desc: 'Tracks found in hardware at 40 MHz; the L1 rate rises to 750 kHz.' },

  /* Computing */
  { id: 'scanning', lane: 'computing', name: 'Scanning tables', year: 1955, cost: 79, install: 0,
    requires: [], fx: { compute: 5 },
    desc: 'Teams of scanners, mostly women, searched film and plots by eye, event by event.' },
  { id: 'mainframe', lane: 'computing', name: 'CDC 6600 mainframe', year: 1965, cost: 2e4, install: 0,
    requires: ['scanning', 'ps'], fx: { compute: 8 },
    desc: 'CERN’s first supercomputer: three million instructions per second.' },
  { id: 'cernlib', lane: 'computing', name: 'CERN Program Library', year: 1970, cost: 5.6e7, install: 0,
    requires: ['mainframe'], fx: { compute: 2, analysis: 1.5, reviewQ: 0.15 },
    desc: 'Shared FORTRAN: HBOOK histograms, MINUIT fits.' },
  { id: 'vax', lane: 'computing', name: 'VAX clusters', year: 1980, cost: 8.7e8, install: 0,
    requires: ['cernlib', 'sps'], fx: { compute: 8 },
    desc: 'The workhorse of 1980s physics.' },
  { id: 'www', lane: 'computing', name: 'World Wide Web', year: 1989, cost: 1.8e14, install: 0,
    requires: ['vax', 'tunnel27'], fx: { funding: 1.5, rep: 1.3, reviewSpeed: 1.5 },
    desc: 'Tim Berners-Lee’s 1989 proposal at CERN, for sharing documents among physicists. With e-print preprints, papers get to the referees faster.' },
  { id: 'farms', lane: 'computing', name: 'Linux PC farms', year: 1997, cost: 2.9e14, install: 0,
    requires: ['www'], fx: { compute: 12 },
    desc: 'Racks of cheap PCs replace mainframes and workstations.' },
  { id: 'root', lane: 'computing', name: 'ROOT framework', year: 1995, cost: 8e14, install: 0,
    requires: ['farms'], fx: { analysis: 1.5, autoPublish: true, reviewQ: 0.15 },
    desc: 'The C++ analysis framework every LHC physicist uses. Unlocks automatic publishing.' },
  { id: 'geant4', lane: 'computing', name: 'Geant4 simulation', year: 1998, cost: 2.2e15, install: 0,
    requires: ['root'], fx: { analysis: 2, reviewQ: 0.2 },
    desc: 'Monte Carlo transport of every particle through every volume of the detector.' },
  { id: 'grid', lane: 'computing', name: 'Worldwide LHC Computing Grid', year: 2002, cost: 3.9e15, install: 0,
    requires: ['geant4', 'twinDipole'], caps: ['grid'], fx: { compute: 40 },
    desc: '170 computing centres in 42 countries working as one.' },
  { id: 'ml', lane: 'computing', name: 'Machine learning', year: 2017, cost: 4.7e20, install: 0,
    requires: ['grid', 'pixels'], caps: ['ml'], fx: { analysis: 3, compute: 2, reviewQ: 0.1 },
    desc: 'Boosted decision trees, then deep-learning b-taggers (DeepJet) and graph networks.' },

  /* Storage: fx.storage multiplies the capacity each franc buys (the price of a byte keeps falling) */
  { id: 'tape', lane: 'storage', name: 'Magnetic tape', year: 1958, cost: 150, install: 0,
    requires: ['scanning'], caps: ['autostore'], fx: { storage: 1.6 },
    desc: 'Half-inch reels on the Ferranti Mercury. The operators order new reels before the racks fill: unlocks automatic storage purchases.' },
  { id: 'diskpack', lane: 'storage', name: 'Disk packs', year: 1966, cost: 3e4, install: 0,
    requires: ['tape', 'mainframe'], fx: { storage: 1.6 },
    desc: 'Removable stacks of platters, a few megabytes each: fast enough to keep the latest runs online.' },
  { id: 'silo', lane: 'storage', name: 'Robotic tape silos', year: 1987, cost: 3e10, install: 0,
    requires: ['diskpack', 'vax'], fx: { storage: 1.6 },
    desc: 'StorageTek silos: a robot arm fetches any of six thousand cartridges in seconds.' },
  { id: 'raid', lane: 'storage', name: 'RAID disk servers', year: 1995, cost: 1.5e14, install: 0,
    requires: ['silo', 'www'], fx: { storage: 1.6 },
    desc: 'Cheap commodity disks in redundant arrays, served over the network.' },
  { id: 'castor', lane: 'storage', name: 'CASTOR', year: 2001, cost: 2e15, install: 0,
    requires: ['raid', 'farms'], fx: { storage: 1.6 },
    desc: 'The CERN Advanced STORage manager: a disk cache in front of the tape libraries, built for LHC rates.' },
  { id: 'eos', lane: 'storage', name: 'EOS disk pools', year: 2011, cost: 3e17, install: 0,
    requires: ['castor', 'grid'], fx: { storage: 1.6 },
    desc: 'Hundreds of petabytes of disk for analysis, the LHC experiments’ working space.' },
  { id: 'cta', lane: 'storage', name: 'CERN Tape Archive', year: 2020, cost: 3e20, install: 0,
    requires: ['eos'], fx: { storage: 1.6 },
    desc: 'The exabyte-scale archive of every LHC run, on tape libraries with tens of thousands of cartridges.' }
];

/* ───────────────────────────── Staff ───────────────────────────── */
PC.STAFF = [
  { id: 'shifter', name: 'Shift crew', cost: 10, growth: 1.14, each: { click: 0.25 },
    desc: '+25% data per click. Someone has to watch the screens at 4 a.m.' },
  { id: 'grad', name: 'Graduate student', cost: 50, growth: 1.14, each: { analysis: 0.08, flat: 0.3 },
    desc: '+8% analysis speed.' },
  { id: 'technician', name: 'Technician', cost: 200, growth: 1.16, each: { install: 0.04 },
    desc: 'Long Shutdowns 4% shorter (diminishing).' },
  { id: 'postdoc', requires: ['ps'], name: 'Postdoc', cost: 900, growth: 1.15, each: { analysis: 0.25 },
    desc: '+25% analysis speed.' },
  { id: 'convener', requires: ['ps'], name: 'Analysis group', cost: 2e3, growth: 40, max: 4, each: { slots: 1 },
    desc: 'One more analysis can run at the same time (up to 5).' },
  { id: 'accphys', requires: ['psb'], name: 'Accelerator physicist', cost: 5e3, growth: 1.17, each: { lumi: 0.1 },
    desc: '+10% luminosity on every machine.' },
  { id: 'deteng', requires: ['mwpc'], name: 'Detector engineer', cost: 5e3, growth: 1.17, each: { trigger: 0.1, quality: 0.05 },
    desc: '+10% trigger bandwidth, +5% event quality.' },
  { id: 'compeng', requires: ['mainframe'], name: 'Computing engineer', cost: 5e3, growth: 1.17, each: { compute: 0.1 },
    desc: '+10% processing capacity.' },
  { id: 'professor', requires: ['sps'], name: 'Professor', cost: 3e4, growth: 1.22, each: { funding: 0.1, rep: 0.05 },
    desc: '+10% funding, +5% reputation.' }
];

/* ───────────────────────────── Analyses ─────────────────────────────
 * via: {beam: minimum energy (GeV)} · needs: capabilities · need: signal for 5σ
 * plot: how the analysis histogram looks
 *   dimuon   — the shared log-mass dimuon spectrum; this analysis's peak at m
 *   peak     — linear mass window [lo, hi], a peak at m (width w) on a falling background
 *   mt       — transverse mass, Jacobian edge at m
 *   spectrum — a falling spectrum with no peak (a measurement)
 */
PC.DISCOVERIES = [
  { id: 'cosmicMu', name: 'Cosmic muon charge ratio', year: 1957, via: { cosmic: 0 }, needs: ['bfield', 'coinc'], need: 5.9e2,
    rep: 4, particle: 'μ⁺/μ⁻ = 1.27', plot: { type: 'spectrum', x: 'p (GeV)', lo: 1, hi: 1000 },
    desc: 'More positive than negative muons, because cosmic primaries are mostly protons. CMS measured 1.2766 in 2010.' },
  { id: 'rho', name: 'ρ, ω and φ in dimuons', year: 1962, via: { 'p-fixed': 3 }, needs: ['tracking', 'bfield', 'muonID'], need: 2.6e6,
    rep: 10, particle: 'ρ ω φ', plot: { type: 'dimuon', m: 0.78 },
    desc: 'Short-lived vector mesons decaying to muon pairs: the first peaks in the spectrum.' },
  { id: 'jpsi', name: 'The J/ψ', year: 1974, via: { 'p-fixed': 25 }, needs: ['mwpc', 'bfield', 'muonID'], need: 9.4e7,
    rep: 40, nobel: 'Richter & Ting, 1976', particle: 'J/ψ → μμ', plot: { type: 'dimuon', m: 3.097 },
    desc: 'A peak so narrow it had to be a new quark: charm. Found at Brookhaven and SLAC the same week.' },
  { id: 'upsilon', name: 'The Υ and the b quark', year: 1977, via: { 'p-fixed': 300 }, needs: ['drift', 'bfield', 'muonID'], need: 3.4e9,
    rep: 60, particle: 'Υ → μμ', plot: { type: 'dimuon', m: 9.46 },
    desc: 'Three peaks near 10 GeV: a fifth quark. First seen by Lederman’s team at Fermilab.' },
  { id: 'jets', name: 'Hadronic jets', year: 1982, via: { ppbar: 500 }, needs: ['hermetic'], need: 2e6,
    rep: 80, particle: 'q, g → jets', plot: { type: 'spectrum', x: 'E_T (GeV)', lo: 10, hi: 300 },
    desc: 'UA2 sees quarks and gluons as sprays of particles with large transverse energy.' },
  { id: 'w', name: 'The W boson', year: 1983, via: { ppbar: 500 }, needs: ['central', 'hermetic', 'multilevel'], need: 1e7,
    rep: 200, nobel: 'Rubbia & van der Meer, 1984', particle: 'W → eν', plot: { type: 'mt', m: 80.4, lo: 20, hi: 140 },
    desc: 'An electron plus missing energy: the carrier of the weak force, at 80 GeV.' },
  { id: 'z', name: 'The Z boson', year: 1983, via: { ppbar: 500 }, needs: ['central', 'hermetic', 'muonCh'], need: 3e7,
    rep: 200, particle: 'Z → μμ', plot: { type: 'dimuon', m: 91.19 },
    desc: 'A dimuon peak at 91 GeV: the neutral weak boson, a few months after the W.' },
  { id: 'top', name: 'The top quark', year: 1995, via: { pp: 1800, ppbar: 1800 }, needs: ['silicon', 'hermetic', 'muonCh', 'multilevel'], need: 3e9,
    rep: 500, particle: 't → bW', plot: { type: 'peak', m: 173, w: 18, lo: 100, hi: 300 },
    desc: 'As heavy as a gold atom. Needs silicon to tag its b-quark. First seen at Fermilab’s Tevatron.' },
  { id: 'hgg', name: 'Higgs → γγ', year: 2012, via: { pp: 7000 }, needs: ['crystal', 'pixel', 'solenoid', 'hlt', 'grid'], need: 1e11,
    rep: 1500, nobel: 'Englert & Higgs, 2013', particle: 'H → γγ', plot: { type: 'peak', m: 125, w: 1.6, lo: 100, hi: 160 },
    desc: 'A small bump at 125 GeV on a steeply falling diphoton background.' },
  { id: 'h4l', name: 'Higgs → ZZ → 4ℓ', year: 2012, via: { pp: 7000 }, needs: ['pixel', 'cmsMuon', 'solenoid', 'hlt', 'grid'], need: 2e11,
    rep: 1500, particle: 'H → 4ℓ', plot: { type: 'peak', m: 125, w: 1.8, lo: 70, hi: 180, z: true },
    desc: 'The golden channel: four leptons, almost no background, a peak at 125 GeV beside the Z.' },
  { id: 'tth', name: 'Higgs couples to top and bottom', year: 2018, via: { pp: 13000 }, needs: ['ml', 'pixel', 'hcal'], need: 6.2e16,
    rep: 2500, particle: 'ttH, H → bb̄', plot: { type: 'peak', m: 125, w: 14, lo: 50, hi: 210 },
    desc: 'The Higgs gives mass to quarks too: seen with deep-learning b-tagging.' },
  { id: 'hh', name: 'Higgs self-coupling', year: 2040, via: { pp: 13600 }, needs: ['timing', 'hgcal', 'l1track'], need: 1e14,
    rep: 6000, particle: 'HH', speculative: true, plot: { type: 'peak', m: 250, w: 30, lo: 200, hi: 800 },
    desc: 'The HL-LHC’s headline goal: the shape of the Higgs potential. (Projected, not yet observed.)' }
];

/* ───────────────────────────── Trigger streams ─────────────────────────────
 * What the trigger can select on. A stream exists once the detector can see it;
 * the trigger menu shares the bandwidth between the streams that exist.
 */
PC.STREAMS = [
  { id: 'mu', name: 'Muons', sym: 'μ', caps: [], v: 'p_T', thr: [3, 7, 15, 25] },
  { id: 'eg', name: 'Electrons & photons', sym: 'e/γ', caps: ['calo'], v: 'E_T', thr: [20, 30, 45, 60] },
  { id: 'jet', name: 'Jets', sym: 'jet', caps: ['hermetic'], v: 'E_T', thr: [40, 80, 150, 300] },
  { id: 'met', name: 'Missing energy', sym: 'E̸T', caps: ['hermetic'], v: 'E̸_T', thr: [30, 60, 100, 150] }
];
/* Each stream's threshold (GeV) can be raised from its lowest level: its rate falls as
 * (lowest/threshold)², the steeply falling spectra. Each analysis keeps its full efficiency
 * up to the threshold its signal needs, then loses it as (need/threshold)². */
// the stream each analysis is triggered on
(function () {
  var of = { cosmicMu: 'mu', rho: 'mu', jpsi: 'mu', upsilon: 'mu', jets: 'jet', w: 'met', z: 'eg', top: 'jet',
    hgg: 'eg', h4l: 'mu', tth: 'jet', hh: 'jet' };
  // the highest threshold that keeps the signal (GeV): soft muons from the J/ψ, hard photons from the Higgs
  var need = { cosmicMu: 3, rho: 3, jpsi: 3, upsilon: 4, jets: 80, w: 30, z: 30, top: 80, hgg: 45, h4l: 7, tth: 80, hh: 40 };
  PC.DISCOVERIES.forEach(function (d) { d.stream = of[d.id]; d.thrNeed = need[d.id]; });
})();

/* ───────────────────────────── Unexpected excesses ─────────────────────────────
 * Bumps nobody was looking for. They build up from the data on their own (no analysis
 * slot) whenever the beam and detector allow. Some are real; most are flukes whose
 * significance rises, peaks at `peak` σ and fades as more data come in.
 * Presenting one at a conference earns reputation now; a fluke that fades afterwards
 * costs twice that. `need` is the signal at 5σ (real) or at the peak (fluke).
 */
PC.EXCESSES = [
  { id: 'a2split', name: 'A narrow double peak at 1.3 GeV', year: 1967, real: false, peak: 3.7, via: { 'p-fixed': 10 }, needs: ['tracking'], stream: 'jet',
    need: 1.5e6, rep: 15, particle: 'A₂ → two peaks?', plot: { type: 'peak', m: 1.31, w: 0.012, lo: 1.15, hi: 1.5 },
    desc: 'The “split A₂”: in 1967 a CERN missing-mass spectrometer saw the A₂ meson as two narrow peaks. Better experiments found a single resonance.' },
  { id: 'neutral', name: 'Neutrino events with no muon', year: 1973, real: true, via: { 'p-fixed': 20 }, needs: ['tracking', 'calo'], stream: 'jet',
    need: 1.5e7, rep: 60, particle: 'Z⁰ exchange', plot: { type: 'peak', m: 2.5, w: 1.2, lo: 0, hi: 8 },
    desc: 'Neutral currents: CERN’s Gargamelle saw neutrinos scatter without turning into muons — the first sign of the Z.' },
  { id: 'oopsleon', name: 'A dimuon excess near 6 GeV', year: 1976, real: false, peak: 3.4, via: { 'p-fixed': 300 }, needs: ['mwpc', 'bfield', 'muonID'], stream: 'mu',
    need: 4e9, rep: 50, particle: 'Υ(6.0)?', plot: { type: 'peak', m: 6.0, w: 0.25, lo: 4, hi: 9 },
    desc: 'The “Oops-Leon”: a 1976 bump at 6 GeV that vanished. The real Υ turned up at 9.5 GeV a year later.' },
  { id: 'top40', name: 'Top-like events at 40 GeV', year: 1984, real: false, peak: 3.3, via: { ppbar: 500 }, needs: ['central', 'hermetic'], stream: 'jet',
    need: 1.5e13, rep: 150, particle: 't(40)?', plot: { type: 'peak', m: 40, w: 6, lo: 15, hi: 90 },
    desc: 'In 1984 UA1 reported events that looked like a 30–50 GeV top quark. They went away with more data; the top weighs 173 GeV.' },
  { id: 'monojets', name: 'Monojets with missing energy', year: 1984, real: false, peak: 3.5, via: { ppbar: 500 }, needs: ['hermetic'], stream: 'met',
    need: 1.2e13, rep: 150, particle: 'SUSY?', plot: { type: 'peak', m: 45, w: 12, lo: 10, hi: 110 },
    desc: 'UA1’s monojets were hailed as supersymmetry. Better-understood W and Z backgrounds explained them away.' },
  { id: 'wjj', name: 'A dijet bump at 145 GeV in W + 2 jets', year: 2011, real: false, peak: 3.9, via: { pp: 7000 }, needs: ['silicon', 'hermetic', 'multilevel'], stream: 'jet',
    need: 2.5e16, rep: 400, particle: 'Wjj(145)?', plot: { type: 'peak', m: 145, w: 14, lo: 60, hi: 260 },
    desc: 'CDF saw a 4σ bump in W + dijet events in 2011. D0 did not, and it faded.' },
  { id: 'pentaquark', name: 'Narrow J/ψ p resonances', year: 2015, real: true, via: { pp: 7000 }, needs: ['pixel', 'cmsMuon'], stream: 'mu',
    need: 5e17, rep: 800, particle: 'P_c → J/ψ p', plot: { type: 'peak', m: 4.45, w: 0.04, lo: 4.0, hi: 5.0 },
    desc: 'Pentaquarks: after the 2003 Θ⁺ fiasco nobody believed in them, until LHCb found two states in 2015.' },
  { id: 'diphoton750', name: 'A diphoton excess at 750 GeV', year: 2015, real: false, peak: 3.6, via: { pp: 13000 }, needs: ['crystal', 'pixel', 'solenoid'], stream: 'eg',
    need: 4.5e18, rep: 1500, particle: 'X(750) → γγ?', plot: { type: 'peak', m: 750, w: 45, lo: 400, hi: 1300 },
    desc: 'December 2015: ATLAS and CMS both saw a mild γγ bump. Five hundred theory papers later, the 2016 data showed nothing.' },
  { id: 'x6900', name: 'A structure near 6.9 GeV in J/ψ pairs', year: 2020, real: true, via: { pp: 13000 }, needs: ['pixel', 'cmsMuon', 'hlt'], stream: 'mu',
    need: 7e18, rep: 1200, particle: 'X(6900)', plot: { type: 'peak', m: 6.9, w: 0.1, lo: 6.2, hi: 7.8 },
    desc: 'A four-charm tetraquark: LHCb saw it in 2020, CMS confirmed it.' }
];

/* Conferences, in a yearly cycle. While one is open you can present results at 3σ or more. */
/* Conference series: each meets at most once per game year, from the year it was founded.
 * venue: the backdrop of its group photos. */
PC.CONF_SERIES = [
  { name: 'ICHEP', since: 1950, venue: 'city', place: 'the Rochester conference, then around the world' },
  { name: 'Lepton–Photon', since: 1963, venue: 'hall', place: 'the electron and photon symposium' },
  { name: 'Moriond', since: 1966, venue: 'mountains', place: 'Rencontres de Moriond, in the Alps' },
  { name: 'EPS-HEP', since: 1971, venue: 'arches', place: 'the European Physical Society conference' },
  { name: 'LHCP', since: 2013, venue: 'glass', place: 'Large Hadron Collider Physics' }
];
PC.CONFERENCES = PC.CONF_SERIES.map(function (c) { return c.name; });

/* Machine faults. `on`: which machines they hit (any | sc = superconducting | inj = fed by an injector);
 * `down`: seconds to recover before staff help; `all`: every machine stops. */
PC.FAULTS = [
  { id: 'rf', name: 'RF cavity trip', on: 'any', w: 4, down: 40 },
  { id: 'power', name: 'Power glitch (thunderstorm)', on: 'any', w: 2, down: 70, all: true },
  { id: 'kicker', name: 'Injection kicker fault', on: 'inj', w: 2, down: 90 },
  { id: 'vacuum', name: 'Vacuum leak', on: 'any', w: 1, down: 200 },
  { id: 'quench', name: 'Magnet quench', on: 'sc', w: 3, down: 150 }
];
PC.INCIDENT_2008 = { id: 'inc2008', name: 'Magnet interconnect failure', down: 600,
  desc: '19 September 2008: a faulty splice between two LHC magnets melted, releasing six tonnes of helium. The repair took a year.' };

/* ───────────────────────────── Paper results ─────────────────────────────
 * What each publication measures, for the slides at conferences. The uncertainty shrinks
 * as rel/√(1 + n) with every new paper n on the same measurement.
 */
PC.RESULTS = {
  'f:cosmic': { q: 'Muon flux at sea level', v: 1.0, u: 'cm⁻² min⁻¹', rel: 0.12 },
  'f:linac1': { q: 'σ(p + Be) at 50 MeV', v: 252, u: 'mb', rel: 0.1 },
  'f:ps': { q: 'σ_tot(pp) at 28 GeV', v: 39.9, u: 'mb', rel: 0.05 },
  'f:sps': { q: 'σ_tot(pp) at 400 GeV', v: 38.9, u: 'mb', rel: 0.03 },
  'f:sppbar': { q: 'σ_tot(pp̄) at 546 GeV', v: 61.9, u: 'mb', rel: 0.03 },
  'f:lhc': { q: 'σ_inel(pp) at 13 TeV', v: 79.5, u: 'mb', rel: 0.03 },
  'd:cosmicMu': { q: 'μ⁺/μ⁻', v: 1.2766, u: '', rel: 0.02 },
  'd:rho': { q: 'm(ρ)', v: 775.3, u: 'MeV', rel: 0.01 },
  'd:jpsi': { q: 'm(J/ψ)', v: 3096.9, u: 'MeV', rel: 0.002 },
  'd:upsilon': { q: 'm(Υ)', v: 9460.3, u: 'MeV', rel: 0.002 },
  'd:jets': { q: 'α_s(m_Z)', v: 0.118, u: '', rel: 0.05 },
  'd:w': { q: 'm(W)', v: 80.37, u: 'GeV', rel: 0.005 },
  'd:z': { q: 'm(Z)', v: 91.19, u: 'GeV', rel: 0.002 },
  'd:top': { q: 'm(t)', v: 172.7, u: 'GeV', rel: 0.01 },
  'd:hgg': { q: 'm(H)', v: 125.1, u: 'GeV', rel: 0.005 },
  'd:h4l': { q: 'μ(H → 4ℓ)', v: 1.0, u: '', rel: 0.2 },
  'd:tth': { q: 'μ(ttH)', v: 1.0, u: '', rel: 0.3 },
  'd:hh': { q: 'κ_λ', v: 1.0, u: '', rel: 0.8 }
};
PC.JOURNALS = ['Phys. Lett. B', 'Nuovo Cimento', 'Phys. Rev. Lett.', 'Nucl. Phys. B', 'Z. Phys. C', 'Eur. Phys. J. C', 'JHEP'];

/* Detector ageing: radiation wears the detector while beam reaches it. `rate` is the
 * health lost per second of beam (before detector engineers); worn parts cut event quality.
 * Every Long Shutdown refurbishes everything, and new parts start like new. */
PC.AGEING = {
  tracking: { name: 'Tracker', rate: 4.2e-5, why: 'silicon and wires closest to the beam take the most radiation' },
  calo: { name: 'Calorimeters', rate: 1.7e-5, why: 'crystals and scintillators darken' },
  muon: { name: 'Muon system', rate: 1e-5, why: 'gas chambers age slowly, far from the beam' }
};

/* Spontaneous detector faults: a module dies (a high-voltage trip, dead readout) or turns
 * noisy. Worn subsystems fail more often; detector engineers repair them; any Long
 * Shutdown clears them all. `cost`: event quality lost while it lasts. */
PC.DET_FAULTS = [
  { id: 'dead', name: 'dead channel', w: 2, cost: 0.015, down: [150, 320], what: ['HV trip', 'readout link down', 'dead front-end board', 'tripped power supply'] },
  { id: 'noisy', name: 'noisy channel', w: 3, cost: 0.005, down: [90, 220], what: ['noisy channel', 'hot pixel cluster', 'unstable pedestal', 'spiking channel'] }
];

// the trigger thresholds the unexpected excesses need (GeV, in their own stream)
(function () {
  var need = { a2split: 40, neutral: 40, oopsleon: 3, top40: 40, monojets: 30, wjj: 80, pentaquark: 3, diphoton750: 60, x6900: 3 };
  PC.EXCESSES.forEach(function (e) { e.thrNeed = need[e.id]; });
})();
