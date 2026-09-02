/* ==========================================================================
   Deca scaffold estimator - server side
   ==========================================================================
   This file never reaches the browser. It holds the two things that are
   actually proprietary:

     1. PRODUCTIVITY. Kilograms of steel a scaffolder erects per hour, and how
        that degrades with height. Calibrated on four Deca jobs and one
        designed gear list. A competitor cannot get this from a quotation.
     2. COST. What Deca pays for labour, hire and transport.

   The rates the client sees are SELL rates, published deliberately. Margin is
   never a line item and is never returned.

   Labour is returned as a single lump. If an hourly rate and a man-hour count
   both went out, anyone could divide one into the other and read the
   productivity model straight off.
   ========================================================================== */

'use strict';

/* ── Measured component weights, kg ──────────────────────────────────────────
   From the designed gear list SA_81_PARADISE_ISLAND_4218-A (21 Feb 2024),
   whose ground level reads 1,322 items / 11.2 t / 393.5 m2. */
const BAY = {
  2.4: { ledger: 9.26, plank: 19.5, brace: 11.0, toe: 7.0 }
};
const W = { stdPerM: 5.83, transom: 9.6, baseJack: 7.5, soleBoard: 2.0, tie: 7.0, ladder: 8.5, hatch: 20.0 };

const BAY_L = 2.4, LIFT_H = 2.0, BOARDS = 5, STD_LINES = 2, CONTINGENCY = 0.07;

/* ── The confidential half of the model ──────────────────────────────────────
   This repository is PUBLIC, so none of these numbers live in it. They are read
   from a single Vercel environment variable, DECA_MODEL, holding JSON:

     {"cost":{"adv":0,"lh":0,"sup":0,"fork":0,"margin":0.30},
      "prod":{"newbuild":0,"facade":0,"occupied":0},
      "k":0.3333,"strip":1.4,"plateau":4}

   cost   what Deca pays an hour, and the margin that turns it into a sell rate
   prod   kilograms of steel erected per man-hour at ground floor, by access
   k      extra labour per storey up, as a fraction of the ground floor
   strip  how much faster dismantling runs than erecting
   plateau  the storey past which material goes up mechanically

   Set it in the Vercel dashboard under Settings, Environment Variables. With it
   unset the estimator declines politely rather than guessing, because a wrong
   default here is worse than no estimate. */
let MODEL = null;
try {
  if (process.env.DECA_MODEL) MODEL = JSON.parse(process.env.DECA_MODEL);
} catch (e) { MODEL = null; }

function modelReady() {
  return !!(MODEL && MODEL.cost && MODEL.prod && MODEL.prod.facade > 0 && MODEL.cost.adv > 0);
}

const FLOOR_TO_FLOOR = 3.0;

/* ── Published sell rates ────────────────────────────────────────────────── */
const SELL = {
  hirePerTonneWeek: 45,
  minHireWeeks:     4,
  truckPerHour:     300,
  truckTonnes:      22,
  handlingHours:    1,
  engineering:      10000,
  engineeringAboveM: 20,
  /* Material stops going up by hand at 12 m, which is where the labour model
     already assumes mechanical handling. But what you use depends on height.
     12 to 25 m is a crane or telehandler on the erect and strip days only.
     Above 25 m a mast hoist stands on the job for the duration, and its cost
     scales with mast height, calibrated so 47.5 m lands on Ampol's Alimak. */
  craneAboveM:      12,
  cranePerDay:      1450,
  hoistAboveM:      25,
  hoistBase:        6000,
  hoistPerMetre:    330,
  hoistWeekBase:    100,
  hoistWeekPerM:    8,
  containmentPerRoll: 186,
  rollCoverM2:      91.5
};

/* One way road hours from the Coomera yard. */
const REGION = {
  'gold-coast':     { hours: 1.0, label: 'Gold Coast' },
  'brisbane':       { hours: 1.5, label: 'Brisbane' },
  'northern-nsw':   { hours: 2.0, label: 'Northern NSW' },
  'sunshine-coast': { hours: 2.5, label: 'Sunshine Coast' },
  'toowoomba':      { hours: 2.5, label: 'Toowoomba' },
  'other':          { hours: 4.0, label: 'Elsewhere in QLD' }
};

const round50 = n => Math.round(n / 50) * 50;
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

/* ── Take-off ────────────────────────────────────────────────────────────── */
function tonnage(runLength, height) {
  const bays = Math.max(1, Math.ceil(runLength / BAY_L));
  const lifts = Math.max(1, Math.ceil(height / LIFT_H));
  const decked = Math.max(1, Math.ceil(lifts / 2));   // as the real gear list boards it
  const posns = (bays + 1) * STD_LINES;
  const b = BAY[BAY_L];

  const kg =
      posns * lifts * (LIFT_H * W.stdPerM)            // standards
    + posns * W.baseJack + posns * W.soleBoard
    + bays * lifts * STD_LINES * b.ledger
    + ((bays + 1) * lifts + bays * decked) * W.transom
    + Math.ceil(bays / 3) * lifts * b.brace
    + bays * decked * BOARDS * b.plank
    + bays * decked * 2 * b.ledger                    // guardrails
    + bays * decked * b.toe
    + Math.ceil(runLength / 4.8) * Math.ceil(height / 4.8) * W.tie   // push ties
    + lifts * W.ladder + decked * W.hatch;

  return { tonnes: kg * (1 + CONTINGENCY) / 1000, bays, lifts };
}

/* ── Height factor, plateauing where a hoist takes over ──────────────────── */
function heightFactor(height) {
  const storeys = Math.max(1, Math.ceil(height / FLOOR_TO_FLOOR));
  const k = MODEL.k, plateau = MODEL.plateau;
  let sum = 0;
  for (let n = 1; n <= storeys; n++) sum += 1 + k * (Math.min(n, plateau) - 1);
  return { factor: sum / storeys, storeys };
}

function estimate(input) {
  if (!modelReady())
    return { ok: false, error: 'The estimator is being configured just now. Please call us on 0428 901 108 and we will price it straight away.' };

  const rawHeight = Number(input.height);
  if (!isFinite(rawHeight) || rawHeight < 2)
    return { ok: false, error: 'Enter the height to the top of the work, in metres.' };
  if (rawHeight > 120)
    return { ok: false, error: 'Over 120 m is outside what we price online. Please call us on 0428 901 108.' };
  const height = rawHeight;
  const weeks = Math.max(SELL.minHireWeeks, Math.round(Number(input.weeks) || 4));
  /* An unrecognised access type falls to the slowest rate, never the fastest. */
  const useCase = MODEL.prod[input.useCase] > 0 ? input.useCase : 'occupied';
  const region = REGION[input.region] ? input.region : 'gold-coast';
  const containment = !!input.containment;

  /* Run length: a wrapped building or a single elevation. */
  let runLength;
  if (input.mode === 'run') {
    const r = Number(input.runLength);
    if (!isFinite(r) || r < 2) return { ok: false, error: 'Enter the length of the elevation, in metres.' };
    runLength = clamp(r, 2, 600);
  } else {
    const L = Number(input.length), Wd = Number(input.width);
    if (!isFinite(L) || L < 1 || !isFinite(Wd) || Wd < 1)
      return { ok: false, error: 'Enter the building length and width, in metres.' };
    const faces = clamp(Math.round(Number(input.faces) || 4), 1, 4);
    const partial = faces === 4 ? 2 * (clamp(L,1,300) + clamp(Wd,1,300))
                  : faces === 3 ? 2 * clamp(L,1,300) + clamp(Wd,1,300)
                  : faces === 2 ? clamp(L,1,300) + clamp(Wd,1,300) : clamp(L,1,300);
    runLength = partial + (faces === 4 ? 4 : Math.max(0, faces - 1)) * (BOARDS * 0.24);
  }

  const area = runLength * height;
  const { tonnes } = tonnage(runLength, height);
  const { factor, storeys } = heightFactor(height);

  /* Labour. */
  const prodBuild = MODEL.prod[useCase] / factor;
  const manHours = (tonnes * 1000) / prodBuild + (tonnes * 1000) / (prodBuild * MODEL.strip);
  const crew = clamp(Math.round(tonnes / 12), 3, 14);
  const days = manHours / (crew * 8);
  const nLH = crew >= 5 ? Math.floor(crew / 4) : 0;
  const nAdv = crew - nLH;
  const C = MODEL.cost, m = 1 + C.margin;
  let labour = (nAdv * C.adv + nLH * C.lh) * m * 8 * days;
  if (crew >= 5) labour += C.sup * m * 8 * days;
  if (tonnes > 40) labour += C.fork * m * 8 * days;

  /* Bought in, at published sell rates. */
  const hire = tonnes * SELL.hirePerTonneWeek * weeks;
  const loads = Math.ceil(tonnes / SELL.truckTonnes);
  const truckHours = loads * 2 * (2 * REGION[region].hours + SELL.handlingHours);
  const transport = truckHours * SELL.truckPerHour;

  const tall = height >= SELL.engineeringAboveM;
  const engineering = (tall || containment) ? SELL.engineering : 0;
  const needsHoist = height >= SELL.hoistAboveM;
  const hoist = needsHoist
    ? SELL.hoistBase + SELL.hoistPerMetre * height +
      (SELL.hoistWeekBase + SELL.hoistWeekPerM * height) * weeks
    : 0;
  const needsCrane = !needsHoist && height >= SELL.craneAboveM;
  const craneDays = needsCrane ? clamp(Math.ceil(tonnes / 25), 2, 8) : 0;
  const crane = craneDays * SELL.cranePerDay;
  const rolls = containment ? Math.ceil(area / SELL.rollCoverM2) : 0;
  const containCost = rolls * SELL.containmentPerRoll;

  const lines = [
    { label: 'Scaffold, erect and dismantle',
      detail: `${tonnes.toFixed(1)} tonnes, ${Math.ceil(days)} working days on site, crew of ${crew}`,
      amount: round50(labour) },
    { label: 'Equipment hire',
      detail: `${tonnes.toFixed(1)} tonnes at $${SELL.hirePerTonneWeek}/tonne/week for ${weeks} weeks`,
      amount: round50(hire) },
    { label: 'Transport',
      detail: `${loads} load${loads > 1 ? 's' : ''} at ${SELL.truckTonnes} t, in and out of our Coomera yard, ${REGION[region].label}`,
      amount: round50(transport) }
  ];
  if (engineering) lines.push({ label: 'Engineering design and certification',
    detail: tall ? `Over ${SELL.engineeringAboveM} m` : 'Sheeted scaffold, so the wind case is engineered',
    amount: engineering });
  if (crane) lines.push({ label: 'Crane and telehandler',
    detail: `${craneDays} days over the erect and strip. Material stops going up by hand above ${SELL.craneAboveM} m`,
    amount: round50(crane) });
  if (hoist) lines.push({ label: 'Material hoist',
    detail: `Install, hire and removal to ${height} m, ${weeks} weeks. Material goes up mechanically above ${SELL.hoistAboveM} m`,
    amount: round50(hoist) });
  if (containCost) lines.push({ label: 'Containment sheeting',
    detail: `${rolls} rolls over ${Math.round(area)} m²`, amount: round50(containCost) });

  const subtotal = lines.reduce((s, l) => s + l.amount, 0);
  const notes = [];
  const lifts = Math.ceil(height / LIFT_H);
  const slack = lifts * LIFT_H - height;
  if (slack > 0 && slack < 0.4 && height > 4)
    notes.push(`Scaffold rises in ${LIFT_H} m lifts, so this needs ${lifts} of them and the top one is barely used. If the work finishes by ${((lifts - 1) * LIFT_H).toFixed(1)} m you would save a full lift of steel.`);
  if (!engineering) notes.push(`Under ${SELL.engineeringAboveM} m and unsheeted, so this is a standard configuration we design in house. No engineering fee.`);
  else if (!tall && containment) notes.push('Sheeting changes the wind loading, so a sheeted scaffold is engineered whatever its height. Drop the sheeting and this fee comes off.');
  if (storeys > 4) notes.push('Above four storeys the programme is modelled rather than measured, so we will confirm it on site before you rely on the dates.');
  if (region === 'other') notes.push('Transport is estimated on a four hour road leg. We will confirm it once we have the address.');

  return {
    ok: true,
    tonnes: Number(tonnes.toFixed(1)),
    area: Math.round(area),
    days: Math.ceil(days),
    crew,
    weeks,
    lines,
    subtotal,
    gst: Math.round(subtotal * 0.1),
    total: Math.round(subtotal * 1.1),
    notes
  };
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') { res.status(405).json({ ok: false, error: 'POST only' }); return; }
  try {
    let body = req.body;
    if (typeof body === 'string') body = JSON.parse(body || '{}');
    if (!body || typeof body !== 'object') body = {};
    const result = estimate(body);
    res.status(result.ok ? 200 : 400).json(result);
  } catch (e) {
    res.status(400).json({ ok: false, error: 'Could not read those numbers. Please check and try again.' });
  }
};

module.exports.estimate = estimate;
