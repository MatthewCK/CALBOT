// CALBOT Web. Reads the model's outputs (see data.js) and draws the page.
// One game slider drives every chart; the charts can be scrubbed directly too.

import { load, fetchLatest, dataBase } from "./data.js";

const d3 = window.d3;
const HEX = ["#E5564A", "#2BA696", "#957BEA", "#6E9E33", "#3E8FDD"]; // bettor colors, fixed order
const LAMP = "#FFD23F";
const MUTED = "#7A9CA4";
// Record lines on the season chart. Same marks as model/config/records.json;
// the model announces them as events, the page just draws them.
const FENCES = [
  { v: 48, trigger: "pass", who: "Salvador Perez", what: "most by a catcher" },
  { v: 54, trigger: "pass", who: "Mickey Mantle", what: "most by a switch-hitter" },
  { v: 56, trigger: "pass", who: "Ken Griffey Jr.", what: "Mariners record" },
  { v: 60, trigger: "reach", who: "The 60 club", what: "seven players before him" },
  { v: 62, trigger: "pass", who: "Aaron Judge", what: "American League record" },
];
const WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
const TIMES = { 2: "TWO", 3: "THREE", 4: "FOUR" };

let D, G = 0;
const listeners = [];
const color = i => HEX[i % HEX.length];
const fmtDate = (s, opts = { month: "short", day: "numeric" }) =>
  new Date(s + "T12:00:00").toLocaleDateString("en-US", opts);
const dateAt = g => (g <= 0 ? "Opening Day" : fmtDate(D.date[g]));
const pct = p => (p === 1 ? "100%" : p >= 0.995 ? ">99%" : p < 0.005 ? (p > 0 ? "<1%" : "0%") : Math.round(p * 100) + "%");
const ordinal = n => n + ((n % 100 >= 11 && n % 100 <= 13) ? "th" : ["th", "st", "nd", "rd"][n % 10] || "th");
const passed = (f, total) => (f.trigger === "pass" ? total > f.v : total >= f.v);
const probAt = (g, total) => { const h = D.hist[g]; return h.probs[total - h.start] || 0; };

function setGame(g) {
  G = Math.max(0, Math.min(D.through, Math.round(g)));
  listeners.forEach(f => f(G));
}

function onResize(draw) {
  let t;
  window.addEventListener("resize", () => { clearTimeout(t); t = setTimeout(draw, 120); });
}

function scrubHandler(x) {
  return ev => {
    if (ev.type === "pointermove" && ev.pointerType !== "mouse" && !ev.buttons) return;
    stopPlay();
    setGame(x.invert(d3.pointer(ev)[0]));
  };
}

// Whose guess is closest to a total; -1 if tied (the pot would split).
function winnerOf(total) {
  const d = D.bettors.map(b => Math.abs(b.guess - total));
  const m = Math.min(...d);
  const w = d.flatMap((v, i) => (v === m ? [i] : []));
  return w.length === 1 ? w[0] : -1;
}

// Month axis for charts whose x is the game state (0..N): a tick at each month
// boundary and the month's name centered over its games. March's few games
// fold into April, as baseball splits usually do.
function monthAxis(svg, x, yBase) {
  const spans = [];
  for (let g = 1; g <= D.N; g++) {
    const m = new Date(D.date[g] + "T12:00:00").getMonth();
    const key = Math.max(m, 3); // Mar -> Apr
    const last = spans[spans.length - 1];
    if (last && last.key === key) last.end = g;
    else spans.push({ key, start: g - 1, end: g, label: key === 3 && m === 2 ? "Mar/Apr" : new Date(2025, key, 1).toLocaleDateString("en-US", { month: "short" }) });
  }
  const a = svg.append("g").attr("class", "axis").attr("transform", `translate(0,${yBase})`);
  a.selectAll("line").data([...spans.map(s => s.start), D.N]).join("line")
    .attr("x1", x).attr("x2", x).attr("y1", 0).attr("y2", 6);
  a.selectAll("text").data(spans).join("text").attr("x", s => (x(s.start) + x(s.end)) / 2).attr("y", 20)
    .attr("text-anchor", "middle").style("font-size", "14px").text(s => s.label);
}

/* ---------- hero: the season step chart ---------- */
function hero() {
  const el = d3.select("#hero");
  const M = { t: 22, r: 210, b: 36, l: 40 };
  const N = D.N;
  const yMax = Math.max(64, d3.max(D.pct, p => p.p95) + 2);
  const path = d3.range(0, D.through + 1).map(g => [g, D.cum[g]]);
  const satOut = d3.range(1, D.through + 1).filter(g => !D.played[g]);
  let W, H, x, y, past, fan, fanMid, fanLab, dot, fences, scrub;
  const line = () => d3.line().x(d => x(d[0])).y(d => y(d[1])).curve(d3.curveStepAfter);

  function draw() {
    el.selectAll("*").remove();
    W = Math.max(280, el.node().clientWidth);
    const narrow = W < 640;
    M.r = narrow ? 34 : 210;
    H = narrow ? 360 : 470;
    const svg = el.append("svg").attr("width", W).attr("height", H).attr("role", "img")
      .attr("aria-label", `Cal Raleigh's cumulative home runs by Mariners game in ${D.season}, reaching ${D.cum[D.through]}, with record lines at ${FENCES.map(f => f.v).join(", ")}.`);
    x = d3.scaleLinear([0, N], [M.l, W - M.r]);
    y = d3.scaleLinear([0, yMax], [H - M.b, M.t]);
    svg.append("g").attr("class", "grid").selectAll("line").data([10, 20, 30, 40]).join("line")
      .attr("x1", M.l).attr("x2", W - M.r).attr("y1", y).attr("y2", y);
    monthAxis(svg, x, H - M.b);
    svg.append("g").attr("class", "axis").attr("transform", `translate(${M.l - 8},0)`)
      .call(d3.axisLeft(y).tickValues([0, 10, 20, 30, 40]).tickSize(0)).call(g => g.select(".domain").remove());

    fences = svg.append("g").selectAll("g").data(FENCES).join("g").attr("class", "fence");
    fences.append("line").attr("class", "fence-line").attr("x1", M.l).attr("x2", W - M.r + (narrow ? 0 : 8))
      .attr("y1", d => y(d.v)).attr("y2", d => y(d.v));
    // Spread labels so close records (60, 62) never collide.
    const gap = narrow ? 15 : 22, ly = {};
    let prev = -Infinity;
    [...FENCES].sort((a, b) => b.v - a.v).forEach(f => { const yy = Math.max(y(f.v) + 5, prev + gap); ly[f.v] = yy; prev = yy; });
    if (!narrow) {
      const lab = fences.append("text").attr("x", W - M.r + 16).attr("y", d => ly[d.v]);
      lab.append("tspan").attr("class", "fn").text(d => d.v + " ");
      lab.append("tspan").text(d => d.who);
    } else {
      // On phones: numbers at the right edge, names in a caption below.
      fences.append("text").attr("class", "fn").attr("x", W - M.r + 6).attr("y", d => ly[d.v]).style("font-size", "15px").text(d => d.v);
      el.append("p").attr("class", "note").style("margin", ".4rem 0 0").style("font-family", "var(--label)")
        .text(FENCES.map(f => `${f.v}: ${f.who}, ${f.what}`).join(". ") + ".");
    }

    // Games he sat out: short ticks on the baseline.
    const so = svg.append("g").attr("aria-hidden", "true");
    so.selectAll("line").data(satOut).join("line").attr("class", "satout")
      .attr("x1", x).attr("x2", x).attr("y1", H - M.b - 9).attr("y2", H - M.b);

    fan = svg.append("path").attr("fill", LAMP).attr("fill-opacity", 0.13);
    fanMid = svg.append("line").attr("stroke", LAMP).attr("stroke-width", 1.5).attr("stroke-dasharray", "3 5").attr("stroke-opacity", 0.8);
    svg.append("path").datum(path).attr("fill", "none").attr("stroke", LAMP).attr("stroke-opacity", 0.22).attr("stroke-width", 2).attr("d", line());
    fanLab = svg.append("g").attr("class", "fan-lab").attr("aria-hidden", "true");
    past = svg.append("path").attr("fill", "none").attr("stroke", LAMP).attr("stroke-width", 3.5).attr("stroke-linejoin", "round");
    scrub = svg.append("line").attr("class", "scrubline").attr("y1", M.t).attr("y2", H - M.b);
    dot = svg.append("circle").attr("r", 7).attr("fill", LAMP).attr("stroke", "#0F3341").attr("stroke-width", 2);
    svg.append("rect").attr("class", "hit").attr("x", M.l).attr("y", 0).attr("width", W - M.r - M.l).attr("height", H)
      .attr("fill", "transparent").on("pointerdown pointermove", scrubHandler(x));
    update(G);
  }
  function update(g) {
    past.attr("d", line()(path.slice(0, g + 1)));
    scrub.attr("x1", x(g)).attr("x2", x(g));
    dot.attr("cx", x(g)).attr("cy", y(D.cum[g]));
    const { p5, p50, p95 } = D.pct[g];
    const show = g < N;
    if (show) {
      fan.attr("d", `M${x(g)},${y(D.cum[g])}L${x(N)},${y(Math.min(p95, yMax))}L${x(N)},${y(p5)}Z`);
      fanMid.attr("x1", x(g)).attr("y1", y(D.cum[g])).attr("x2", x(N)).attr("y2", y(p50));
    }
    fan.attr("opacity", show ? 1 : 0);
    fanMid.attr("opacity", show ? 1 : 0);
    // Numbers at the wedge's right edge: high end, median, low end of the simulated finishes.
    const ends = !show ? [] : [
      { v: p95, k: "high", t: `${p95}` },
      { v: p50, k: "mid", t: `${p50} median` },
      { v: p5, k: "low", t: `${p5}` },
    ].filter(d => d.k === "mid" || Math.abs(y(d.v) - y(p50)) >= 16);
    fanLab.selectAll("text").data(ends, d => d.k).join("text")
      .attr("x", x(N) - 8).attr("y", d => y(Math.min(d.v, yMax)) + (d.k === "high" ? 14 : d.k === "low" ? -6 : -6))
      .attr("text-anchor", "end").attr("class", d => d.k).text(d => d.t);
    heroRead(g);
    fences.classed("passed", f => passed(f, D.cum[g]));
  }
  listeners.push(update);
  draw();
  onResize(draw);
}

// The sentence under the season chart: what the wedge says at this game.
function heroRead(g) {
  const el = d3.select("#heroRead");
  const { p5, p50, p95 } = D.pct[g];
  if (g >= D.N) {
    el.html(`The season is over: he finished with <b>${D.cum[g]}</b>.`);
    return;
  }
  const when = g === 0 ? "Before Opening Day" : `After game ${g} (${dateAt(g)}), with ${D.cum[g]} so far`;
  let s = `${when}, CALBOT&rsquo;s middle guess for his final total is <b>${p50}</b>. ` +
    `Nine in ten of its ${D.simulations.toLocaleString("en-US")} simulated seasons end between <b>${p5}</b> and <b>${p95}</b>.`;
  if (D.finalTotal != null) {
    const f = D.finalTotal;
    s += f > p95 ? ` He actually hit ${f}, above the whole range.` : f < p5 ? ` He actually hit ${f}, below the whole range.` : ` He actually hit ${f}, inside it.`;
  }
  el.html(s);
}

/* ---------- counter, dock, CALBOT message ---------- */
function oddsSummary(g) {
  const o = D.odds[g];
  return d3.range(o.length).sort((a, b) => o[b] - o[a]).filter(i => o[i] >= 0.005).slice(0, 3)
    .map(i => `${D.bettors[i].name} ${pct(o[i])}`).join(", ");
}

function finalMessage() {
  const fin = D.finalTotal, o = D.odds[D.N];
  const w = d3.range(o.length).filter(i => o[i] > 0);
  if (w.length !== 1) return `Final: ${fin}. ${w.map(i => D.bettors[i].name).join(" and ")} split the pot.`;
  const b = D.bettors[w[0]], diff = fin - b.guess;
  const how = diff > 0 ? `which was still ${diff} short` : diff < 0 ? `${-diff} too high` : "exactly right";
  return `Final: ${fin}. ${b.name} wins the pot with a guess of ${b.guess}, ${how}.`;
}

// What the bot would have said after game g, built from the model's events for that game.
function message(g) {
  if (g === 0) {
    const day = fmtDate(D.date[1], { weekday: "long" });
    return `Season starts ${day}. Preseason odds: ${oddsSummary(0)}. Good luck, everyone.`;
  }
  if (g === D.N && D.complete) return finalMessage();
  const ev = D.eventsByGame.get(g) || [];
  const total = D.cum[g], n = D.hr[g];
  let msg;
  if (!D.played[g]) msg = `Day off for Cal. He stays at ${total}.`;
  else if (n >= 2) msg = `${TIMES[n] || n} homers tonight. Cal is up to ${total}.`;
  else if (n === 1) msg = `Cal just hit number ${total}.`;
  else msg = `No homer today. Cal stays at ${total}.`;
  for (const e of ev.filter(e => e.type === "record")) {
    msg += e.record.trigger === "pass" ? ` That passes ${e.record.label}.` : ` ${e.record.label}: he's in.`;
  }
  msg += ` Odds: ${oddsSummary(g)}.`;
  for (const e of ev.filter(e => e.type === "lead_change")) {
    msg += ` New favorite: ${e.leader}, taking over from ${e.previous_leader}.`;
  }
  return msg;
}

function readouts() {
  listeners.push(g => {
    const t = D.cum[g];
    d3.select("#count").text(t);
    const his = D.playerGame[g];
    const when = g === 0 ? "before Opening Day"
      : `through game ${g}${his && his !== g ? ` (his ${ordinal(his)})` : ""}, ${dateAt(g)}`;
    d3.select("#countCap").html(`home run${t === 1 ? "" : "s"}<span>${when}</span>`);
    const off = g > 0 && !D.played[g] ? " &nbsp;sat out" : "";
    d3.select("#dockRead").html(`Game <span>${g}</span> &nbsp;${dateAt(g)} &nbsp;<span>${t}</span> HR${off}`);
    d3.select("#scrub").property("value", g);
    d3.select("#chatMsg").text(message(g));
    let ts;
    if (g === 0) { const d = new Date(D.date[1] + "T12:00:00"); d.setDate(d.getDate() - 1); ts = d.toLocaleDateString("en-US", { month: "short", day: "numeric" }); }
    else ts = `${dateAt(g)}, after the game`;
    d3.select("#chatTs").text(ts);
  });
}

/* ---------- guesses with live odds ---------- */
function guesses() {
  const box = d3.select("#guesses").selectAll("div").data(D.bettors).join("div").attr("class", "g");
  box.append("i").style("background", (d, i) => color(i));
  box.append("b").text(d => d.name);
  box.append("em").text(d => "guessed " + d.guess);
  box.append("span").attr("class", "pct");
  listeners.push(g => box.select(".pct").text((d, i) => pct(D.odds[g][i])));
}

/* ---------- odds over time ---------- */
function oddsChart() {
  const el = d3.select("#odds");
  const M = { t: 12, r: 14, b: 28, l: 48 };
  let x, y, scr, dots;
  function draw() {
    el.selectAll("*").remove();
    const W = Math.max(280, el.node().clientWidth), H = 280;
    const svg = el.append("svg").attr("width", W).attr("height", H).attr("role", "img")
      .attr("aria-label", "Each friend's chance of winning the bet over the season");
    x = d3.scaleLinear([0, D.N], [M.l, W - M.r]);
    y = d3.scaleLinear([0, 1], [H - M.b, M.t]);
    svg.append("g").attr("class", "grid").selectAll("line").data([0.25, 0.5, 0.75, 1]).join("line")
      .attr("x1", M.l).attr("x2", W - M.r).attr("y1", y).attr("y2", y);
    monthAxis(svg, x, H - M.b);
    svg.append("g").attr("class", "axis").attr("transform", `translate(${M.l - 6},0)`)
      .call(d3.axisLeft(y).tickValues([0, 0.5, 1]).tickFormat(d3.format(".0%")).tickSize(0))
      .call(g => g.select(".domain").remove());
    const line = i => d3.line().x((d, g) => x(g)).y(d => y(d[i])).curve(d3.curveMonotoneX)(D.odds);
    svg.append("g").selectAll("path").data(d3.range(D.bettors.length)).join("path").attr("d", line)
      .attr("fill", "none").attr("stroke", color).attr("stroke-width", 2.25).attr("stroke-linejoin", "round");
    scr = svg.append("line").attr("class", "scrubline").attr("y1", M.t).attr("y2", H - M.b);
    dots = svg.append("g").selectAll("circle").data(d3.range(D.bettors.length)).join("circle").attr("r", 5)
      .attr("fill", color).attr("stroke", "#0A2530").attr("stroke-width", 2);
    svg.append("rect").attr("class", "hit").attr("x", M.l).attr("width", W - M.l - M.r).attr("height", H)
      .attr("fill", "transparent").on("pointerdown pointermove", scrubHandler(x));
    update(G);
  }
  function update(g) {
    scr.attr("x1", x(g)).attr("x2", x(g));
    dots.attr("cx", x(g)).attr("cy", i => y(D.odds[g][i]));
  }
  listeners.push(update);
  draw();
  onResize(draw);
}

/* ---------- final-total histogram ---------- */
function histChart() {
  const el = d3.select("#hist");
  // Range covering every total with a real chance at any point in the season.
  let lo = Infinity, hi = -Infinity;
  D.hist.forEach(h => h.probs.forEach((p, i) => { if (p >= 0.0005) { lo = Math.min(lo, h.start + i); hi = Math.max(hi, h.start + i); } }));
  if (D.finalTotal != null) hi = Math.max(hi, D.finalTotal);
  const LO = Math.floor(lo / 5) * 5, HI = Math.ceil((hi + 1) / 5) * 5;
  const totals = d3.range(LO, HI + 1);
  const M = { t: 34, r: 10, b: 28, l: 10 };
  let y, bars;
  function draw() {
    el.selectAll("*").remove();
    const W = Math.max(280, el.node().clientWidth), H = 300;
    const svg = el.append("svg").attr("width", W).attr("height", H).attr("role", "img")
      .attr("aria-label", "Distribution of simulated final home run totals, colored by whose guess would win");
    const x = d3.scaleBand(totals, [M.l, W - M.r]).paddingInner(0);
    y = d3.scaleLinear([0, 0.2], [H - M.b, M.t]);
    svg.append("g").attr("class", "axis").attr("transform", `translate(0,${H - M.b})`)
      .call(d3.axisBottom(x).tickValues(totals.filter(t => t % 10 === 0)).tickSize(4)).call(g => g.select(".domain").remove());
    bars = svg.append("g").selectAll("rect").data(totals).join("rect")
      .attr("x", d => x(d) + 1).attr("width", Math.max(1, x.bandwidth() - 2)).attr("rx", Math.min(3, x.bandwidth() / 3))
      .attr("fill", d => { const w = winnerOf(d); return w < 0 ? MUTED : color(w); });
    if (D.finalTotal != null) {
      const a = svg.append("g").attr("transform", `translate(${x(D.finalTotal) + x.bandwidth() / 2},0)`);
      a.append("line").attr("y1", M.t - 6).attr("y2", H - M.b).attr("stroke", LAMP).attr("stroke-width", 2);
      a.append("text").attr("y", M.t - 12).attr("text-anchor", "middle").attr("fill", LAMP)
        .style("font-size", "15px").style("font-weight", 700).text(`He finished at ${D.finalTotal}`);
    }
    update(G);
  }
  function update(g) {
    const top = d3.max(totals, t => probAt(g, t));
    y.domain([0, Math.max(0.08, top * 1.08)]);
    bars.attr("y", d => y(probAt(g, d))).attr("height", d => Math.max(0, y(0) - y(probAt(g, d))));
    const { p5, p95 } = D.pct[g];
    d3.select("#histNote").text(g === D.N
      ? "Final home run total: the season is over"
      : `Simulated final totals as of game ${g}, ${dateAt(g)}. Middle 90%: ${p5} to ${p95}`);
  }
  if (D.finalTotal == null) {
    d3.select("#actualNote").text("The season isn't over yet, so there's no final total to mark.");
  }
  listeners.push(update);
  draw();
  onResize(draw);
}

/* ---------- pull a random season ---------- */
// Draw a final total from the model's distribution for this game state.
function drawTotal(g) {
  const h = D.hist[g];
  let u = Math.random();
  for (let i = 0; i < h.probs.length; i++) { u -= h.probs[i]; if (u <= 0) return h.start + i; }
  return h.start + h.probs.length - 1;
}

function simChart() {
  const el = d3.select("#simchart");
  const M = { t: 12, r: 14, b: 28, l: 34 };
  const yMax = Math.max(80, Math.ceil((d3.max(D.hist, h => h.start + h.probs.length) + 1) / 20) * 20);
  let x, y, svg, actual, layer, pulls = [];
  const line = () => d3.line().x(d => x(d[0])).y(d => y(d[1])).curve(d3.curveStepAfter);
  function draw() {
    el.selectAll("*").remove();
    const W = Math.max(280, el.node().clientWidth), H = 300;
    svg = el.append("svg").attr("width", W).attr("height", H).attr("role", "img").attr("aria-label", "Simulated rest-of-season paths");
    x = d3.scaleLinear([0, D.N], [M.l, W - M.r]);
    y = d3.scaleLinear([0, yMax], [H - M.b, M.t]);
    const yt = d3.range(20, yMax + 1, 20);
    svg.append("g").attr("class", "grid").selectAll("line").data(yt).join("line").attr("x1", M.l).attr("x2", W - M.r).attr("y1", y).attr("y2", y);
    monthAxis(svg, x, H - M.b);
    svg.append("g").attr("class", "axis").attr("transform", `translate(${M.l - 6},0)`)
      .call(d3.axisLeft(y).tickValues([0, ...yt]).tickSize(0)).call(g => g.select(".domain").remove());
    layer = svg.append("g");
    actual = svg.append("path").attr("fill", "none").attr("stroke", LAMP).attr("stroke-width", 3);
    render();
  }
  function render() {
    if (!svg) return;
    actual.attr("d", line()(d3.range(0, G + 1).map(g => [g, D.cum[g]])));
    layer.selectAll("path").data(pulls).join("path").attr("fill", "none").attr("stroke", "#EEF3F2")
      .attr("stroke-width", (d, i) => (i === pulls.length - 1 ? 2.25 : 1.25))
      .attr("stroke-opacity", (d, i) => (i === pulls.length - 1 ? 1 : 0.28)).attr("d", d => line()(d.path));
  }
  function pull() {
    if (G >= D.N) {
      d3.select("#simOut").text("The season is over, so there's nothing left to simulate. Drag the slider back to an earlier game.");
      return;
    }
    const total = drawTotal(G), h = D.cum[G];
    // Scatter the simulated home runs over the games left, for the picture only.
    const per = new Array(D.N - G).fill(0);
    for (let k = 0; k < total - h; k++) per[Math.floor(Math.random() * per.length)]++;
    let c = h;
    const path = [[G, h], ...per.map((n, i) => [G + 1 + i, (c += n)])];
    if (pulls.length && pulls[0].from !== G) pulls = [];
    pulls.push({ path, from: G });
    if (pulls.length > 12) pulls.shift();
    const w = winnerOf(total);
    const near = probAt(G, total - 1) + probAt(G, total) + probAt(G, total + 1);
    const who = w < 0 ? "it's a tie and the pot gets split" : `<span style="color:${color(w)}">${D.bettors[w].name}</span> wins the pot`;
    const rarity = near < 0.05 ? "That's a strange one: finishes" : "Finishes";
    d3.select("#simOut").html(`In this season Cal finishes with <b>${total}</b> and ${who}. ${rarity} within one of ${total} came up in ${pct(near)} of simulations from game ${G}.`);
    render();
  }
  d3.select("#pull").on("click", pull);
  d3.select("#clear").on("click", () => { pulls = []; render(); d3.select("#simOut").text("Pick a game with the slider below, then pull a season."); });
  listeners.push(() => { if (pulls.length && pulls[0].from !== G) pulls = []; render(); });
  draw();
  onResize(draw);
}

/* ---------- table, text, footer ---------- */
function table() {
  const rows = d3.range(1, D.through + 1).filter(g => D.hr[g] > 0);
  d3.select("#tbl tbody").selectAll("tr").data(rows).join("tr").html(g =>
    `<td class="num">${g}</td><td class="num">${D.playerGame[g]}</td><td>${fmtDate(D.date[g])}</td><td>${D.opp[g]}</td><td class="num">${D.hr[g]}</td><td class="num">${D.cum[g]}</td>`);
}

function fillText() {
  const n = D.bettors.length, word = WORDS[n] || String(n);
  const f = {
    season: D.season,
    nBettors: word,
    nBettorsCap: word[0].toUpperCase() + word.slice(1),
    maxGuess: d3.max(D.bettors, b => b.guess),
    sims: D.simulations.toLocaleString("en-US"),
  };
  document.querySelectorAll("[data-f]").forEach(el => { el.textContent = f[el.dataset.f]; });
  const m = D.meta;
  d3.select("#srcLink").attr("href", m.source.game_log_url);
  const updated = new Date(m.updated_at).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
  d3.select("#meta").html(
    `Model run <code>${m.run_id}</code>, CALBOT model ${m.model_version}, ${D.simulations.toLocaleString("en-US")} simulations per game. ` +
    `Published ${updated}. Data snapshot <code>${m.data_hash.slice(0, 12)}</code>, fetched ${fmtDate(m.source.fetched_at.slice(0, 10), { month: "short", day: "numeric", year: "numeric" })}.`);
}

function showAlert(title, items = [], cls = "") {
  const a = d3.select("#alerts").append("div").attr("class", `alert ${cls}`).attr("role", "status");
  a.append("b").text(title);
  if (items.length) a.append("ul").selectAll("li").data(items.slice(0, 8)).join("li").text(d => d);
  return a;
}

// During a live season, check for a new run every few minutes and say so
// rather than redrawing under the reader.
function watchForNewRuns() {
  if (D.complete) return;
  const id = setInterval(async () => {
    try {
      const l = await fetchLatest();
      if (l.run_id !== D.meta.run_id) {
        clearInterval(id);
        const a = showAlert("New: the model has a newer run.", [], "banner");
        a.append("button").text("Load it").on("click", () => location.reload());
      }
    } catch (e) { console.warn("latest.json check failed", e); }
  }, 5 * 60 * 1000);
}

/* ---------- play + scrub ---------- */
let timer = null;
const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
function stopPlay() {
  if (timer) { timer.stop(); timer = null; d3.select("#play").text("Play"); }
}
function controls() {
  d3.select("#scrub").attr("max", D.through);
  d3.select("#play").on("click", () => {
    if (timer) { stopPlay(); return; }
    if (reduce) { setGame(D.through); return; }
    const start = G >= D.through ? 0 : G;
    setGame(start);
    d3.select("#play").text("Pause");
    const t0 = performance.now(), per = 70;
    timer = d3.timer(() => {
      const g = start + Math.floor((performance.now() - t0) / per);
      if (g >= D.through) { setGame(D.through); stopPlay(); } else if (g !== G) setGame(g);
    });
  });
  d3.select("#scrub").on("input", ev => { stopPlay(); setGame(+ev.target.value); });
}

async function main() {
  try {
    D = await load();
  } catch (e) {
    console.error(e);
    d3.select("#countCap").html(`home runs<span>couldn't load the model's outputs</span>`);
    showAlert("The model's outputs didn't load.", [String(e.message || e), `Looked in ${dataBase()}`]);
    return;
  }
  if (D.problems.length) {
    console.error("data checks failed", D.problems);
    showAlert("These numbers failed the page's checks, so treat them with suspicion:", D.problems);
  }
  window.CALBOT = D; // for checking the page against the source in the console
  G = D.through;
  fillText();
  hero();
  readouts();
  guesses();
  oddsChart();
  histChart();
  simChart();
  table();
  controls();
  setGame(D.through);
  watchForNewRuns();
}

main();
