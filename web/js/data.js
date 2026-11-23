// Load the model's published outputs (../contract/) and shape them for the page.
//
// Follows the contract: fetch latest.json (short cache), then that run's files
// (immutable, cacheable forever), then events.json. Nothing here computes odds or
// distributions; those come from the model.

export const SCHEMA = 1;

// Where the outputs live. Default: ./data/ next to the page. Override with
// <meta name="calbot-data" content="https://..."> or ?data=<url> for testing.
export function dataBase() {
  const q = new URLSearchParams(location.search).get("data");
  const meta = document.querySelector('meta[name="calbot-data"]')?.content;
  const base = q || meta || "data/";
  return base.endsWith("/") ? base : base + "/";
}

async function getJSON(url, opts) {
  const r = await fetch(url, opts);
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
  const d = await r.json();
  if (d.schema !== SCHEMA) {
    throw new Error(`${url} has schema ${d.schema}; this page reads schema ${SCHEMA}`);
  }
  return d;
}

export async function fetchLatest(base = dataBase()) {
  return getJSON(base + "latest.json", { cache: "no-cache" });
}

export async function load(base = dataBase()) {
  const latest = await fetchLatest(base);
  const run = `${base}runs/${latest.run_id}/`;
  const [odds, dist, log, events] = await Promise.all([
    getJSON(run + "odds.json"),
    getJSON(run + "distribution.json"),
    getJSON(run + "season_log.json"),
    getJSON(base + "events.json", { cache: "no-cache" }),
  ]);
  const D = shape(latest, odds, dist, log, events);
  D.problems = check(D, odds, dist, log);
  return D;
}

// One entry per game state g = 0..N (g team games completed), so every chart
// indexes the same way. Game states after through_game have no model output.
function shape(latest, odds, dist, log, events) {
  const games = log.games;
  const N = log.team_games;
  const through = odds.through_game;
  const cum = [0], hr = [0], played = [false], date = [null], opp = [null], playerGame = [null];
  for (const g of games) {
    cum.push(g.final ? g.cum_hr : cum[cum.length - 1]);
    hr.push(g.hr);
    played.push(g.played);
    date.push(g.date);
    opp.push(g.opponent);
    playerGame.push(g.player_game);
  }
  const byGame = new Map();
  for (const e of events.events) {
    if (e.season !== log.season || e.team_game > through) continue;
    if (!byGame.has(e.team_game)) byGame.set(e.team_game, []);
    byGame.get(e.team_game).push(e);
  }
  const complete = games.length === N && games.every(g => g.final) && through === N;
  return {
    latest,
    season: log.season,
    player: log.player,
    team: log.team,
    N,
    through,
    complete,
    finalTotal: complete ? cum[N] : null,
    cum, hr, played, date, opp, playerGame,
    bettors: odds.bettors.map(b => ({ name: b.name, guess: b.guess })),
    odds: odds.history.map(h => h.win_prob),
    pct: odds.history.map(h => h.percentiles),
    hist: dist.history.map(h => ({ start: h.start, probs: h.probs })),
    eventsByGame: byGame,
    simulations: odds.simulations,
    meta: {
      run_id: odds.run_id,
      model_version: odds.model_version,
      generated_at: odds.generated_at,
      updated_at: latest.updated_at,
      data_hash: log.data_hash,
      source: log.source,
    },
  };
}

// The page refuses to look confident about numbers that don't add up.
// Returns a list of problems; the page shows them if there are any.
function check(D, odds, dist, log) {
  const p = [];
  const ids = new Set([odds.run_id, dist.run_id, D.latest.run_id]);
  if (ids.size !== 1) p.push(`run ids disagree: ${[...ids].join(", ")}`);
  if (log.games.length !== D.N) p.push(`season log has ${log.games.length} games, expected ${D.N}`);
  if (odds.history.length !== D.through + 1) p.push(`odds history has ${odds.history.length} states, expected ${D.through + 1}`);
  if (dist.history.length !== D.through + 1) p.push(`distribution history has ${dist.history.length} states, expected ${D.through + 1}`);
  odds.history.forEach((h, g) => {
    if (h.through_game !== g) p.push(`odds state ${g} says through_game ${h.through_game}`);
    if (h.hr !== D.cum[g]) p.push(`odds state ${g} has ${h.hr} HR, season log has ${D.cum[g]}`);
    const s = h.win_prob.reduce((a, b) => a + b, 0);
    if (Math.abs(s - 1) > 0.001) p.push(`win chances after game ${g} sum to ${s.toFixed(4)}`);
  });
  dist.history.forEach((h, g) => {
    const s = h.probs.reduce((a, b) => a + b, 0);
    if (Math.abs(s - 1) > 0.002) p.push(`final-total shares after game ${g} sum to ${s.toFixed(4)}`);
    if (h.start + h.probs.length - 1 < D.cum[g]) p.push(`distribution after game ${g} ends below the ${D.cum[g]} already hit`);
  });
  let run = 0;
  for (const g of log.games) {
    if (!g.final) continue;
    run += g.hr;
    if (g.cum_hr !== run) { p.push(`cum_hr wrong at team game ${g.team_game}`); break; }
    if (!g.played && g.hr) p.push(`home run in a game he sat out (team game ${g.team_game})`);
  }
  if (odds.hr !== D.cum[D.through]) p.push(`odds.hr ${odds.hr} doesn't match the log's ${D.cum[D.through]}`);
  return p;
}
