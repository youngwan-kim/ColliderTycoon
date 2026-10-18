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
  Double-click a node to build, order or adopt it (or select it and use the button in the side panel).
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
- **Analysis room**: the analyses run at the workstations, split into one group per analysis slot.
  A submitted paper is printed onto the review stand at the bottom; a crew (a postdoc
  first, students, perhaps a professor) gathers at a free review table, one of them fetches the paper, and they read
  it around the table while the internal review runs (six review tables in two rows). Then one carries it to the
  journal outbox. When an analysis passes 3σ its group takes one of the two 5σ-check tables (the plot printed out,
  cross-checks before the claim) until the discovery. Click a review table for the Papers, a 5σ table or a
  workstation group for its analysis. During a conference its name and time left are in the hall's title, and
  whatever can be presented appears as small Present buttons beside the screen.
- **Conference series and the archive**: ICHEP (from 1950), Lepton–Photon (1963), Moriond (1966), EPS-HEP (1971) and
  LHCP (2013) each meet at most once per calendar year; one opens about every 25 minutes, the series that met longest
  ago first, and when every running series has met in a year the next waits for the next year. When a conference closes, those who went line up in front of the
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
- **Trigger** (under the detector lens): the readout drops from the detector into it, and one link per trigger stream,
  in the stream's colour, curves on to the computing room, its packets at the rate the stream records. A status line (the run, events kept of those coming in, dead time), the event stream (each event the display
  shows passes as a block in its trigger stream's colour, the same colour the lens writes the event in; candidates for
  a running analysis amber and outlined; the streams' shares
  of the bandwidth beneath) and the run's luminosity as the experiments plot it: delivered and recorded, integrated
  since the run began (collisions ÷ σ_inel ≈ 70 mb, in b⁻¹). Dead time grows as the trigger saturates and is total
  while storage is full. Click it for the trigger menu.
- **Control rooms** (click the buildings on the map): the accelerator control room shows the live luminosity chart,
  fill statistics, the injection chain as a live synoptic (each machine in its own shape, sized by its circumference,
  the transfer lines by name, bunches moving, the LHC's two beams filling while injecting, and the beam energy per
  stage with γ and the gain on a log scale), each machine's state and share of the collisions, and recent faults; the
  detector control room shows detector health as a heatmap on the detector's own geometry (an r–z quarter view for the
  collider, damage following the particle fluence from the interaction point), data taking, the magnet and the trigger.
- **Detector ageing**: while beam reaches the experiment, radiation wears the tracker (fastest), calorimeters and muon
  system, cutting event quality by up to 40%. Detector engineers slow it; every Long Shutdown refurbishes everything,
  and the detector control room can call a short maintenance shutdown when no upgrade is waiting. Modules also fail
  on their own now and then (dead or noisy channels, more often when worn), shown on per-subdetector η–φ maps;
  engineers repair them and every shutdown clears them. A noisy channel fires fake triggers that eat its streams'
  bandwidth and computing: mask it (button in the detector control room, or click it on the map) for a slightly
  bigger quality loss until it is repaired, or the shift crew masks it after 90 s.
- **The council strip** (overview, under the accelerator control room) shows the world at a glance:
  - a small hemicycle of the assembly (a dot a seat);
  - the budget the states and the economy leave the lab, with a thin bar of who pays;
  - Europe's economic mood;
  - the bill on the floor, with its countdown and expected vote;
  - where the lab stands with the auditors.

  Click it for the World window.
- **Control rooms on the overview**: both rooms are drawn live, each laid out after the real one. Click either to open its window.
  - The **accelerator control room** (after the CERN Control Centre) is seen from above: a curved video wall (luminosity,
    the injection chain, "page 1", the alarm list) over round console islands, one per machine family (PS complex, SPS,
    collider, technical infrastructure), each appearing when its machines are built, and a visitors' gallery where tours
    stop now and then. Two operators sit at each island, with your accelerator physicists. During an injection,
    operators gather at the collider's island while page 1 counts down. A fault sets off a rotating beacon and flashes the
    faulty island; people hurry over to it, and physicists on call come in. A beam dump flashes the wall, shifts change at
    the islands, and a Long Shutdown empties the room and dims the lights.
  - The **detector control room** (after an experiment's, such as CMS's) is seen from the back of the room: a wall of
    screens (run status, trigger rates, the event display, detector health) and two rows of desks facing it. The front
    row holds the shift leader, DAQ and trigger desks; the second row has one desk per installed subsystem plus data
    quality. Each desk's screens show its job, and experts stand at the back by the run-plan whiteboard. A subsystem
    fault turns its desk red and brings in its on-call expert. A full disk sets off the DAQ desk (a saturated trigger
    turns the trigger desk amber), and people come over. When a new run or stable beams begins, the shift leader stands
    up and the wall announces it. A signal candidate makes everyone look at the event display. A Long Shutdown leaves a
    skeleton crew.
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
- **The calendar**: the year in the header runs continuously. It moves about 2 years per hour of play, and faster
  (up to 30 years per hour) while it is behind the year your newest machine, upgrade or discovery dates from. Once it
  is ahead of them it slows to 1 year per hour, so the lab's history stays close to the real one (the J/ψ in the
  early 1970s, the Higgs in 2012). A new generation starts it again at 1950.
- **The world economy** (World window, or click the Budget readout in the header): two big blocs, Europe (where
  the lab is) and the dollar area, stepped month by month on the calendar. It is a coarse sector model, built to be
  stable and legible rather than to forecast:
  - **Households and firms:** they spend and invest on income, confidence and expected profits, against
    borrowing costs that reach them over a year or two.
  - **Prices and jobs:** firms hire with the output gap and price as a markup over wages and energy.
  - **Banks:** they lend out of their capital. Defaults (from unemployment and debt service) and bond losses eat
    it, and thin capital tightens credit. A bust can become a banking crisis, and the government recapitalises.
  - **Governments:** they tax and spend with automatic stabilisers and a fiscal rule, turn to austerity when debt
    or its cost runs high, and fund deficits with bonds held by banks, investors and the central bank. A run on
    the debt brings a debt crisis, central-bank bond buying, or at worst a restructuring.
  - **Central banks:** a Taylor rule; at zero rates they buy bonds (QE) and sell them back later. Now and then
    they go soft for years, and a great inflation can take hold.
  - **Markets:** bond yields follow expected rates plus term, fiscal and banking risk, and bond prices fall when
    yields rise. Stocks are profits discounted by yields and a risk premium, times a sentiment that overshoots
    and crashes.
  - **Between the blocs:** oil is priced in dollars (supply shocks and gluts, demand from both blocs), and the
    exchange rate follows rate and inflation gaps. Trade, crashes and banking stress spill from one bloc to the
    other.

  Nothing is tied to a date: recessions (about 15 a century, ~15% of the time), oil shocks (~6), crashes (~6),
  banking crises (1–3), debt crises and stagflation all come out of the dynamics, and each is logged and toasted.
  Every coefficient is in `PC.ECON`; `node sim/load.js sim/econstats.js` prints the model's statistics over 150
  seeds.

  What it does to the lab, priced in Europe and bounded (0.85–1.25):
  - construction follows European inflation, energy (oil in euros) and bond yields;
  - upgrades, hiring and storage follow inflation and energy;
  - the electricity bill takes a share of the budget that grows with the machines (2% for cosmics, 16% with the
    LHC) and costs what energy costs;
  - alumni in industry give more when markets are buoyant.

  The World window has a Europe / Dollar area switch and shows the last ten years as quarterly candles: oil, the
  exchange rate, stocks, the bond yield (with the policy rate) and inflation. It also has GDP growth bars with
  unemployment, public debt with the central bank's share, and bank stress, with recessions shaded. Below them:
  what each does to the lab now, and the list of episodes.
- **Member states** (World window → Member states):
  - **Founding:** the lab is founded by a council of states, drawn anew in every game (and every generation). The
    host (Switzerland) always founds it. Every other Western state joins with a chance that rises with its 1950 GDP
    (after Maddison) and its taste for big science: 5–14 founders, about 9 typically. The convention comes into
    force in 1954.
  - **Contributions:** they follow each member's national income. That grows with its bloc's potential and its own
    catch-up trend, moves with the business cycle, and is cut by austerity. Associates pay a fraction, and no state
    pays more than 22% of the budget. The budget multiplier is the members' total against a typical game's at the
    same date, to the power 0.4 and limited to 0.8–1.25: a lucky or unlucky council is felt, but not ruinous.
  - **Joining:** states apply now and then, likelier when the lab stands high (its reputation against a typical
    lab's at the same date), their economy grows and their bloc isn't cutting back. Talks take 2–5 years and can
    fail. The former East (free to join from 1990) and the newly independent states usually become associates
    first; India, Pakistan and Brazil stay associates; the United States, Japan and Russia only observe.
  - **Leaving:** rare, likelier under austerity, in a banking or debt crisis, or when the lab stands low. A state
    that left can return after five years.
  - **Borders move:** Germany reunites in 1990, Czechoslovakia splits in 1993 (a member brings Slovakia in), and
    Yugoslavia breaks up in 1992.
  - **Typical membership:** about 10 states in 1960, 14 in 1990, 21 in 2010 and 27 by 2030. Each game is
    different.

  The tab shows a tile map of Europe (and a strip beyond it) coloured by status, with founders marked. It also
  shows who pays what, each state's story (click a tile), and the council's history. The header's Budget readout
  includes the council. The reference tables come from `sim/council-calib.js` (the budget path) and the bot's normal
  play (`PC.WORLD.repRef`).
- **The European assembly** (World window → Parliament): seven political groups, Left to Nationalists, each with a
  stance on research spending, green regulation, enlargement and austerity. Their popularity drifts with the
  European economy: unemployment and crises feed the Left and the Nationalists, high inflation the Conservatives,
  and the Greens grow from the mid-1970s.
  - **1952–1978, the Common Assembly:** delegates appointed by national parliaments, re-appointed every year. It is
    only consulted, so its laws do half as much.
  - **From 1979, the European Parliament:** direct elections every five years, with turnout falling over time.
  - **Bills** come up every one to two years, from a catalogue of eleven:
    - for the lab: framework programmes for research (budget +6%), the research infrastructure roadmap (new
      machines −5%), researcher mobility (hiring −8%), open procurement, an open-science mandate (more reputation,
      more storage) and enlargement (more states apply);
    - against it: the stability pact (budget −6%), a review of research spending, energy taxation (power bill
      +25%), radiation protection (machines +7%) and data protection (storage +6%).

    The economy and the seats decide which is tabled: austerity when governments are cutting back or in a crisis,
    green rules when the Greens are strong, enlargement when states are knocking. Each group supports a bill as its
    stances say, and the public's image of science helps anything about research. After a debate of five to seven
    minutes the house votes, seat-weighted, and a law stays in force for five to ten years.
  - **What the lab can do, by legal means** (each costs a few minutes of income or data):
    - **lobby a group:** moves it towards the lab's side, less each round; past three rounds on one bill, a
      scandal can break, costing reputation and image and undoing most of the lobbying;
    - **testify at the hearing:** once a bill; costs data, and sways the undecided, more with discoveries;
    - **hold open days:** reputation, and the public's view of science, which fades back over the years;
    - **science diplomacy:** speeds a state's accession talks, or invites the keenest state to apply.

  The tab shows a hemicycle (a dot a seat, with the change since the last election), the bill on the floor (its
  effect, the expected vote, each group's support with a lobby button, the countdown), the laws in force and the
  record of votes.
- **Audits** (World window → Audits, and the header's Budget readout):
  - **Value for money:** the lab's reputation against a typical lab's of the same year, over the funding it has
    received against a typical lab's, in orders of magnitude (the references come from the bot's normal play,
    `sim/refs.js`). A typical lab sits near 1; the bot never falls below 0.96.
  - **The ladder**, each step announced in a toast, in the logbook and in the header (amber, then red), with a
    way back at every step. Audits begin in 1960.
    - **Under watch:** value below 0.90 for a minute; lifted above 0.93.
    - **Audit:** value below 0.85, or ten minutes under watch, and at least ten minutes after the last one. The
      Court of Auditors reviews for seven minutes and finds the lab clean (+2% reputation), makes
      recommendations (budget −10% for ten minutes; half a strike, and no more patience after two), or is
      adverse (budget frozen at −25% for ten minutes; a strike).
    - **Closure vote:** two strikes and still below 0.85. The council votes on closing the lab, weighted by each
      state's share of the budget; austerity, a low value and a cool attitude to science push states towards
      yes. The lab can make its case once.
    - **Closure:** if more than half the budget votes yes, a closing screen tells the generation's story. The
      generation ends with no Legacy gained; Legacy, the conference archive and the alumni are kept.

    A lab that never publishes is watched after about four hours and can be closed after about five.
  - **The way out:** publish, present results at conferences, discover, and hold open days.
- **People and careers** (Staff window → People): graduate students, postdocs and professors are individuals with
  names, a talent, the analysis they work on and a record (papers, conference talks, discoveries). Hiring funds a
  position; people move through it, on the calendar. A PhD lasts about 5 years, then the student stays on for a
  postdoc here or leaves for industry or another lab; postdoc contracts (about 2.5 years, renewed at most twice) end
  in a chair here, a permanent research-scientist post, or a move elsewhere. Professors and research scientists retire
  at 65–68. Everyone has a birth year (PhD students join at 22–27, those hired from outside older) and a death drawn
  from a life table: most live to 70–95, but death can come at any age, in the lab or years after leaving it. A death
  in the lab is a memorial in the logbook. Alumni of an earlier generation stay in that universe: they age no
  further once it ends. Outcomes are chance, weighted by each person's record and talent; a
  vacancy goes to whoever waits for it here before anyone from outside. Experience and papers raise each person's
  performance, which the staff bonuses sum. Alumni in industry add a little funding, those at other labs a little
  reputation; the alumni outlive a new generation. Each conference talk is given by one of your people.
  The People tab draws the lab floor: everyone walks about their room (PhD office, postdocs, professors, research
  scientists, a common room, a bench for those waiting for a position); hover a figure for who they are, click to
  follow them and read their story (born, age, or their years, e.g. 1931–2004). "See where the alumni went" switches
  to industry, other labs, the retired, and an "In memoriam" garden with a headstone for each who has died.
- **Next generation** (prestige, after the Higgs): reset for Legacy points that boost luminosity and funding. The lepton branch (LEP, FCC-ee) and FCC-hh come in later stages.

## Files

| Path | What |
|---|---|
| `js/content.js` | All facilities, technologies, staff and discoveries, with years and descriptions |
| `js/engine.js` | Pure game logic (no DOM); also runs headless |
| `js/worldcontent.js` | The states (1950 GDP, growth, science affinity, map tiles), the assembly's groups and the bills |
| `js/council.js` | The member states: the founding draw, contributions, joining, leaving, borders |
| `js/parliament.js` | The European assembly: popularity, appointed and elected seats, bills, votes, laws, lobbying |
| `js/worldview.js` | The council strip on the overview |
| `js/audit.js` | Value for money, the audits, the closure vote |
| `js/economy.js` | The world economy: the macro model, its episodes, and its effect on costs and the budget |
| `js/careers.js` | People as individuals: lives (birth, retirement, death), careers, records, alumni |
| `js/peopleview.js` | The People tab's lab floor: everyone as a walking figure, hover and click |
| `js/physics.js` | Event generation and analysis histograms |
| `js/display.js` | Detector geometry and event display |
| `js/complex.js` | Accelerator complex map |
| `js/computing.js` | Computing lens |
| `js/health.js` | Detector health: the r–z heatmap, the subdetector η–φ maps, the overview thumbnail |
| `js/ctrlrooms.js` | The two control rooms on the overview: the accelerator's (islands, from above) and the detector's (desk rows, from the back) |
| `js/chainview.js` | The injection-chain synoptic in the accelerator control room |
| `js/trigview.js` | The trigger under the detector lens: status, event stream, the run's luminosity |
| `js/photo.js` | Conference group photos, drawn from the archive's records |
| `js/rooms.js` | The analysis room and the conference room, joined by a door; the staff walking between them |
| `js/people.js` | Staff figures shared by the views |
| `js/overview.js` | Zoom lines and the detector → trigger → computing → analysis links |
| `js/plot.js` | Analysis histogram drawing |
| `js/tree.js` | Tech tree |
| `js/shell.js` | Fit-to-screen layout |
| `js/windows.js` | Movable windows |
| `js/ui.js`, `js/main.js` | Interface, saving, offline progress |
| `js/debug.js` | Debug panel (open `index.html#debug`); shows errors the views caught |
| `js/util.js` | Formatting; error-safe animation loops and guards (`PC.loop`, `PC.guard`) |
| `sim/` | Balance tooling (Node) and the UI tests (headless Chrome) |

## Balancing

```sh
sim/run.sh 40 [1]        # simulate a greedy player for up to 40 h (1 = verbose purchases)
sim/seeds.sh 10 38       # 10 games in parallel: milestone medians and ranges, budgets, votes, politics, audits, closures
sim/calibrate.sh 18 8    # refit costs and discovery thresholds, writing them into js/content.js
node sim/load.js sim/econstats.js      # the world economy's statistics over 150 seeds
node sim/load.js sim/council-calib.js  # the council's reference budget (PC.WORLD.wRef) and membership over time
node sim/load.js sim/refs.js           # a typical lab's reputation and funding by year (PC.WORLD.repRef, fundsRef)
```

The bot (`sim/bot.js`) is a reasonably attentive greedy player. It also plays politics a little: it testifies and
lobbies (never more than three rounds) when a bill goes the wrong way, holds open days when its value for money
dips, and sends science diplomacy when that is cheap. Over ten games it is never audited or closed.

Units shown in the game are real (GeV, cm⁻²s⁻¹…). Rates, costs and thresholds are scaled for play;
historical order, energy thresholds and technology dependencies are kept accurate.
Speculative future items are labelled as such.

## Testing

```sh
sim/ui-test.sh           # UI smoke tests in headless Chrome (sim/ui_tests.js); exits non-zero on a failure
```

It runs the real page in `#debug` mode in a throwaway browser profile, so saves are not touched. Each scenario
starts a fresh game and fails on a wrong result or on any error, including ones the views caught and reported.
Set `CHROME=/path/to/chrome` if Chrome is not in a usual place.
