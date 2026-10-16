# Particle Clicker

An idle/clicker game: grow CERN's real proton chain (Linac → PS Booster → PS → SPS → Sp̄pS → LHC → HL-LHC)
and one experiment, from a cosmic-ray test stand to a CMS-like detector, and find the Higgs.

## Play

Open `index.html` in a browser; no build step and no dependencies are needed.
(Or serve the folder, e.g. `python3 -m http.server`, and open http://localhost:8000.)

Progress saves in the browser and continues while you are away (up to 12 h).

## How it works

- **Overview**: the accelerator complex map (rings build, bunches circulate) with a zoom lens on your experiment's
  site showing the detector (cosmic test stand → fixed-target spectrometer → collider end view drawn in metres,
  tracks bent by r = pT/(0.3 B); tracker modules, PbWO₄ crystals, HCAL sampling layers, the coil cryostat and the
  12-sided yoke with drift-tube chambers, installed piece by piece during a shutdown; hits fire modules, crystals,
  towers and chamber segments, and jets get a cone), linked through the trigger to a computing lens (counting room → CDC 6600 →
  VAX → PC farm → WLCG Tier-0 and Tier-1s) and the data-chain gauges.
- **Analyses** run in parallel slots; each has its own histogram (the dimuon spectrum, γγ, 4ℓ, m_T…) whose
  peak grows out of the background as significance rises and sharpens with better tracking.
- **Layout**: on a large window the game is one screen: the overview fills it, details appear when you hover
  (detector parts and the current event, the data chain, a machine on the map, each header number), and the
  bottom bar opens movable windows (Upgrades, Analyses with its Papers section, Staff, Logbook, Lab; keys 1–5, Esc closes).
  Drag a window by its title, resize it from the corner, double-click the title to reset it. A Long Shutdown
  button appears on the bar when upgrades are waiting. Small screens scroll, and windows open as sheets.
- **Tech tree** (Upgrades tab): lanes are subsystems; columns follow the prerequisites; completed columns can be hidden.
- **Data chain**: collisions (luminosity of every machine you own) → trigger → computing → × event quality = data/s.
  A saturated stage keeps the best events, so its output grows as √(input × capacity); the panel shows the bottleneck.
- **Discoveries** need a machine with the right beam and energy *and* the right detector capabilities.
  Significance grows as 5·√(signal / threshold); 3σ is evidence, 5σ a discovery.
- **Funding** is a grant proportional to data/s, boosted by **reputation** (earned from discoveries and publications).
- **Papers** (the Papers section of the Analyses window, and the paper station in the analysis room): submitting costs data; each paper then passes the
  collaboration's internal review and a journal's referees, who may ask for revisions or reject it (back to the start).
  Reputation comes on acceptance. Postdocs, professors and better software (CERNLIB, ROOT, Geant4, ML) lower the odds
  of trouble; graduate students and the Web speed reviews up; analysis groups allow more papers in review at once.
  Papers accepted since the last conference are shown there, with their measured values, for bonus reputation.
- **Analysis room**: the analyses run at the workstations, split into one group per analysis slot (its particle and
  significance over its desks). A submitted paper is printed onto the review stand at the bottom; a crew (a postdoc
  first, students, perhaps a professor) gathers at a free review table, one of them fetches the paper, and they read
  it around the table while the internal review runs (six review tables in two rows). Then one carries it to the
  journal outbox. When an analysis passes 3σ its group takes one of the two 5σ-check tables (the plot printed out,
  cross-checks before the claim) until the discovery. Click a review table for the Papers, a 5σ table or a
  workstation group for its analysis. During a conference its name and time left are in the hall's title, and
  whatever can be presented appears as small Present buttons beside the screen.
- **Conference series and the archive**: ICHEP (from 1950), Lepton–Photon (1963), Moriond (1966), EPS-HEP (1971) and
  LHCP (2013) each meet at most once per game year (the year your newest machine, upgrade or discovery dates from);
  one opens about every 25 minutes, the series that met longest ago first, and when every running series has met in
  a year the next waits for the lab's next year. When a conference closes, those who went line up in front of the
  screen for a group photo (a photographer, three flashes) before walking back. Click the conference room for the
  archive: every conference the lab attended, kept across generations, with its group photo (backdrop after the
  venue, the lab in rows, guests at the edges, the slide of any result first shown there that became a discovery),
  the results presented and what became of them, the papers shown and the reputation earned.
- **Conference room** (below the analysis room, through a door): when a conference opens, your students, postdocs
  and professors leave their desks, open the door and fill the front rows; your professor speaks while the slides
  show your new results. When it closes they file back.
- **Long Shutdowns**: hardware upgrades are only installed while the beams are off (half funding meanwhile).
- **Beam operations**: colliders run in fills whose luminosity decays; the operators refill at 25% of the peak, and
  dumping yourself near the best moment (the bottom bar says when) gains about a quarter. Machines fault now and then
  (RF trips, power glitches, quenches, kicker faults, vacuum leaks, and the LHC's 2008 incident); accelerator physicists
  and technicians repair faster, and you can help the crew from the bottom bar.
- **Control rooms** (click the buildings on the map): the accelerator control room shows the live luminosity chart,
  fill statistics, the injection chain with each machine's state and share of the collisions, and recent faults; the
  detector control room shows detector health as a heatmap on the detector's own geometry (an r–z quarter view for the
  collider, damage following the particle fluence from the interaction point), data taking, the magnet and the trigger.
- **Detector ageing**: while beam reaches the experiment, radiation wears the tracker (fastest), calorimeters and muon
  system, cutting event quality by up to 40%. Detector engineers slow it; every Long Shutdown refurbishes everything,
  and the detector control room can call a short maintenance shutdown when no upgrade is waiting. Modules also fail
  on their own now and then (dead or noisy channels, more often when worn), shown on per-subdetector η–φ maps;
  engineers repair them and every shutdown clears them. A noisy channel fires fake triggers that eat its streams'
  bandwidth and computing: mask it (button in the detector control room, or click it on the map) for a slightly
  bigger quality loss until it is repaired, or the shift crew masks it after 90 s.
- **Control rooms on the overview**: under the map, both rooms are drawn live (the luminosity curve and machine lights;
  the detector health thumbnail, beam strip and faulty channels), with your staff at the consoles while there is beam.
  Click one to open its window.
- **Trigger menu** (Analyses window): share the trigger bandwidth between muons, e/γ, jets and missing energy. When the
  trigger is saturated, a stream's share speeds up the analyses triggered on it, at the cost of total data.
  Each stream also has a threshold (muon p_T 3–25 GeV, e/γ E_T 20–60, jets 40–300, missing E_T 30–150): raising it
  cuts the stream's rate as (lowest/threshold)², leaving more bandwidth per event, but a search whose signal needs
  less than the threshold keeps only (need/threshold)² of it (shown in red). Low-mass searches (J/ψ, Υ, cosmic
  muons) want low thresholds; H → 4ℓ gains from a 7 GeV muon trigger once bandwidth is tight.
- **Storage**: every bit of data written needs room on disk or tape, and the room costs money. Click the storage hall
  (under the computing hall) for the Storage window: the fill, when it will be full, what each trigger stream writes,
  and buttons for +10 min, +1 h or +6 h of the current data rate (shift-click for ten times that). When it is full nothing new is written: the data count and the analyses
  stand still, though the grant keeps coming. The Storage lane of the tech tree (magnetic tape, disk packs, robotic
  silos, RAID servers, CASTOR, EOS, the CERN Tape Archive) makes capacity cheaper; magnetic tape also lets the
  operators buy it automatically at 85%. Capacity is priced against the lab's funding level, so it stays a real
  budget line in every era. The computing column runs the full height under the detector control room: the computing
  hall on top (its name and the ⓘ data-chain button in the corner), a pipe carrying what the farm writes, one lane
  per trigger stream, and the storage hall below, its units drawn in the era's technology, more of them as capacity
  grows, their slots filling with data. A curved cable runs from the foot of each column of racks into the pipe,
  and the packets follow them; three links curve from the storage hall to the analysis room, one per workstation
  row, carrying data whenever a PC on that row is on (green: someone is sitting at it); the tape library's picker shuttles between slots and the drives, busier while data are written.
- **Conferences and excesses**: every so often a conference opens for a few minutes; present results at 3σ or more for
  reputation. Unexpected excesses build up from the data on their own: some are real (neutral currents, pentaquarks,
  X(6900)), most are historical flukes (the split A₂, the Oops-Leon, UA1's 40 GeV top and monojets, the Wjj bump,
  the 750 GeV diphoton). A presented fluke that fades is withdrawn and costs twice what it earned.
- **Next generation** (prestige, after the Higgs): reset for Legacy points that boost luminosity and funding. The lepton branch (LEP, FCC-ee) and FCC-hh come in later stages.

## Files

| Path | What |
|---|---|
| `js/content.js` | All facilities, technologies, staff and discoveries, with years and descriptions |
| `js/engine.js` | Pure game logic (no DOM); also runs headless |
| `js/physics.js` | Event generation and analysis histograms |
| `js/display.js` | Detector geometry and event display |
| `js/complex.js` | Accelerator complex map |
| `js/computing.js` | Computing lens |
| `js/health.js` | Detector health: the r–z heatmap, the subdetector η–φ maps, the overview thumbnail |
| `js/ctrlrooms.js` | The two control rooms drawn under the map |
| `js/photo.js` | Conference group photos, drawn from the archive's records |
| `js/rooms.js` | The analysis room and the conference room, joined by a door; the staff walking between them |
| `js/people.js` | Staff figures shared by the views |
| `js/overview.js` | Zoom lines and the detector → trigger → computing → analysis links |
| `js/plot.js` | Analysis histogram drawing |
| `js/tree.js` | Tech tree |
| `js/shell.js` | Fit-to-screen layout |
| `js/windows.js` | Movable windows |
| `js/ui.js`, `js/main.js` | Interface, saving, offline progress |
| `js/debug.js` | Debug panel (open `index.html#debug`) |
| `sim/` | Balance tooling (Node) |

## Balancing

```sh
sim/run.sh 40 [1]        # simulate a greedy player for up to 40 h (1 = verbose purchases)
sim/calibrate.sh 18 8    # refit costs and discovery thresholds, writing them into js/content.js
```

Units shown in the game are real (GeV, cm⁻²s⁻¹…). Rates, costs and thresholds are scaled for play;
historical order, energy thresholds and technology dependencies are kept accurate.
Speculative future items are labelled as such.
