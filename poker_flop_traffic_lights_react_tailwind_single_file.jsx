import React, { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Info, RefreshCcw, Sparkles, CircleHelp, Copy, Shuffle } from "lucide-react";

/**
 * Poker Flop Traffic Lights — single-file React component
 * - TailwindCSS for styling
 * - No external state; easy to drop into Vite/Next/CRA
 * - Enter a starting hand (e.g., "Js9s", "AhKd", "7c7d").
 * - Returns context-aware Green / Yellow / Red flop families with guidance.
 * - "Clear" to reset; "Random" to sample a valid hand.
 *
 * Hand format supported:
 *   - Exactly 3 or 4 chars: Rank + Suit + Rank + Suit (e.g., AhKd, Js9s, 7c7d)
 *   - Case-insensitive; suits: c,d,h,s; ranks: A,K,Q,J,T,9..2
 */

// ----- Utilities -----
const RANKS = ["A", "K", "Q", "J", "T", "9", "8", "7", "6", "5", "4", "3", "2"]; // for ordering
const RANK_ORDER: Record<string, number> = Object.fromEntries(RANKS.map((r, i) => [r, i]));
const isRank = (c: string) => /[AKQJT2-9]/i.test(c);
const isSuit = (c: string) => /[cdhs]/i.test(c);

function normalizeCard(card: string) {
  const r = card[0].toUpperCase();
  const s = card[1].toLowerCase();
  return r + s;
}

function parseHand(input: string) {
  const raw = (input || "").replace(/\s+/g, "").trim();
  if (raw.length !== 4) return null; // require exactly 4 chars
  const c1 = raw.slice(0, 2);
  const c2 = raw.slice(2, 4);
  if (!isRank(c1[0]) || !isSuit(c1[1]) || !isRank(c2[0]) || !isSuit(c2[1])) return null;
  const card1 = normalizeCard(c1);
  const card2 = normalizeCard(c2);
  if (card1 === card2) return null; // duplicate
  return {
    c1: card1,
    c2: card2,
    r1: card1[0],
    r2: card2[0],
    s1: card1[1],
    s2: card2[1],
    suited: card1[1] === card2[1],
    pair: card1[0] === card2[0],
  };
}

function handLabel(h: ReturnType<typeof parseHand>) {
  if (!h) return "";
  const { r1, r2, s1, s2, suited, pair } = h;
  const pretty = (r: string, s: string) => `${r}${s.toUpperCase()}`;
  if (pair) return `${r1}${r2}`.toUpperCase() + ` (${pretty(r1, s1)} ${pretty(r2, s2)})`;
  const off = suited ? "s" : "o";
  const hi = RANK_ORDER[r1] < RANK_ORDER[r2] ? r1 : r2;
  const lo = hi === r1 ? r2 : r1;
  return `${hi}${lo}${off}`.toUpperCase() + ` (${pretty(h.c1[0], h.c1[1])} ${pretty(h.c2[0], h.c2[1])})`;
}

// Quick helpers
const rankGap = (a: string, b: string) => Math.abs(RANK_ORDER[a] - RANK_ORDER[b]);
const isBroadway = (r: string) => ["A", "K", "Q", "J", "T"].includes(r);
const isWheel = (r: string) => ["A", "5", "4", "3", "2"].includes(r);

// Sample a random valid hand (no suit duplication constraints with a real deck; fine for UI)
function randomHand() {
  const ranks = [...RANKS];
  const suits = ["c", "d", "h", "s"];
  const r1 = ranks[Math.floor(Math.random() * ranks.length)];
  const r2 = ranks[Math.floor(Math.random() * ranks.length)];
  const s1 = suits[Math.floor(Math.random() * suits.length)];
  let s2 = suits[Math.floor(Math.random() * suits.length)];
  // avoid identical exact card
  if (r1 === r2 && s1 === s2) s2 = suits[(suits.indexOf(s2) + 1) % suits.length];
  return `${r1}${s1}${r2}${s2}`;
}

// ----- Core heuristic engine -----
export type TrafficAdvice = {
  title: string;
  bullets: string[];
  examples?: string[]; // suggested flop families (e.g., "T♠8x", "A K 4 r")
};

export type AdviceBundle = {
  green: TrafficAdvice[];
  yellow: TrafficAdvice[];
  red: TrafficAdvice[];
};

function suitGlyph(s: string) {
  return { c: "♣", d: "♦", h: "♥", s: "♠" }[s as "c" | "d" | "h" | "s"] ?? "?";
}

function rankStr(r: string) {
  return r === "T" ? "10" : r;
}

function example(x: string) {
  // Replace lowercase suit letters with glyphs for readability if present (e.g., T s 8 x)
  return x
    .replaceAll("c", "♣")
    .replaceAll("d", "♦")
    .replaceAll("h", "♥")
    .replaceAll("s", "♠");
}

function makeExamplesForSuited(h: ReturnType<typeof parseHand>, patterns: string[]): string[] {
  if (!h) return [];
  const g = suitGlyph(h.s1); // use first card suit as the flush suit
  return patterns.map((p) => p.replaceAll("s", g));
}

function generateAdvice(hand: ReturnType<typeof parseHand>): AdviceBundle | null {
  if (!hand) return null;
  const { r1, r2, suited, pair } = hand;

  // Normalize rank hi/lo for phrasing
  const hi = RANK_ORDER[r1] < RANK_ORDER[r2] ? r1 : r2;
  const lo = hi === r1 ? r2 : r1;
  const gap = rankGap(r1, r2);

  const base: AdviceBundle = { green: [], yellow: [], red: [] };

  // Pocket pairs
  if (pair) {
    const pocket = r1; // same rank
    const pairIdx = RANK_ORDER[pocket];
    const isPremium = ["A", "K", "Q", "J"].includes(pocket);
    const midPair = ["T", "9", "8", "7"].includes(pocket);

    base.green.push({
      title: "Sets / Overpairs",
      bullets: [
        "Top set or middle/bottom set: build pots vs one player; size up multiway for value/protection.",
        "Overpair on safe boards (low/medium disconnected): bet for value/protection; keep barreling clean turns.",
      ],
      examples: [
        `${pocket}${pocket}x (rainbow)`,
        `${pocket}${rankStrBelow(pocket)}${rankStrBelow(rankStrBelow(pocket))} (r)`,
      ].map(example),
    });

    base.yellow.push({
      title: "Underpairs / Paired boards",
      bullets: [
        "Underpair to one or two overcards: realize equity cheap; check-call small once in-position.",
        "Paired boards w/ one over: pot control; take free cards; avoid big pots without improvement.",
      ],
      examples: [
        `A ${rankStr(pocket)} 4 (r)`,
        `${rankStrAbove(pocket)} ${rankStrAbove(rankStrAbove(pocket))} ${rankStr(pocket)} (r)`,
      ].map(example),
    });

    base.red.push({
      title: "Two+ overs / High, wet textures",
      bullets: [
        "Boards with two or more higher cards, especially connected or two-tone, are bad for under-repped pocket pairs.",
        "Fold to sizable aggression multiway; avoid check-raise bluffs without strong equity.",
      ],
      examples: [
        `A K ${rankStrBelow(pairIdx > 10 ? "4" : "T")} (r)`,
        `Q J ${rankStrBelow("T")} (two-tone)`,
      ].map(example),
    });

    return base;
  }

  // Suited hands (including suited broadways, suited aces, suited connectors/gappers)
  if (suited) {
    const suitedBroadway = isBroadway(hi) && isBroadway(lo);
    const suitedAce = hi === "A";
    const conn = gap === 1;
    const oneGap = gap === 2;

    // GREEN
    const greenBlocks: TrafficAdvice[] = [];

    // Strong combo equity
    if (conn || oneGap || suitedBroadway) {
      const patterns = makeExamplesForSuited(hand, [
        `${lo}s${rankStrBelow(lo)}x`, // e.g., T♠8x for JTs
        `${rankStrAbove(hi)}s${lo}x`, // e.g., Q♠Tx for JTs
        `${rankStrBelow(lo)}s${rankStrBelow(rankStrBelow(lo))}s x`, // e.g., 8♠7♠x
      ]);
      greenBlocks.push({
        title: "Strong combo equity (OESDs/GS + backdoors)",
        bullets: [
          "Open-ender or pair + draw with your suit/backdoors: build pots vs singles; mix check-raises vs late stabs.",
          "Pressure good turns (your suit, straight completers, or overcards you rep).",
        ],
        examples: patterns,
      });
    }

    // Top two or better
    greenBlocks.push({
      title: "Top two or better",
      bullets: [
        "Two-pair on uncoordinated boards: value bet; size up multiway (60–75%).",
        "Trips on paired boards: value but beware when obvious straights/flushes complete.",
      ],
      examples: [
        `${hi}${lo}x (no straight/flush)`,
        `${hi}${hi}${lo} (r)`,
      ].map(example),
    });

    // Nut FDs with extras (for Axs)
    if (suitedAce) {
      greenBlocks.push({
        title: "Nut FD + extras",
        bullets: [
          "A-high nut FD with gutter/overcards: semi-bluff aggressively vs folds; deny equity.",
          "In-position, raise some small c-bets; out-of-position, prefer check-raise mixes on dynamic boards.",
        ],
        examples: makeExamplesForSuited(hand, [
          `Q s J x (BDFD + GS)`,
          `${lo} s ${rankStrBelow(lo)} x (NFD + pair outs)`,
        ]),
      });
    }

    base.green.push(...greenBlocks);

    // YELLOW
    const yellowBlocks: TrafficAdvice[] = [];

    yellowBlocks.push({
      title: "Decent one-pair / backdoors",
      bullets: [
        "Top pair weak kicker or second pair w/ backdoors: check-call small once; fold to heat multiway.",
        "Favor pot control when your kicker is dominated or board shifts on the turn.",
      ],
      examples: [
        `${hi} ${rankStrBelow(hi)} ${rankStrAboveOrSame(lo)} (r)`,
        `${lo} ${rankStrBelow(lo)} ${rankStrAbove(hi)} (two-tone)`,
      ].map(example),
    });

    yellowBlocks.push({
      title: "Non-nut FDs with extras",
      bullets: [
        "Front-door FD without overcards: peel small; avoid big pots unless with extra equity (gutter/overs).",
        "Raise mainly when you can fold out better highs or realize fold equity vs capped ranges.",
      ],
      examples: makeExamplesForSuited(hand, [
        `A Q 7 (you have FD only)`,
        `T 8 3 (BDFD + backdoor straight)`,
      ]),
    });

    base.yellow.push(...yellowBlocks);

    // RED
    base.red.push({
      title: "Dry, high-card boards you miss",
      bullets: [
        "Disconnected high-card boards heavily favor tight ranges; your equity realization is poor.",
        "Mostly check-fold; continue only vs tiny bets with backdoors in-position.",
      ],
      examples: ["A K 4 (r)", "Q 7 2 (r)"].map(example),
    });

    // Monotone non-nut
    base.red.push({
      title: "Monotone boards without nut advantage",
      bullets: [
        "Avoid building 3-street pots when you lack the nut on monotone textures.",
        "Call tiny, fold big; realize equity when cheap.",
      ],
      examples: makeExamplesForSuited(hand, [
        `${hi} ${rankStrBelow(hi)} x (all same suit)`,
        `${rankStrAbove(hi)} ${rankStrBelow(lo)} ${rankStrBelow(rankStrBelow(lo))} (all same suit)`,
      ]),
    });

    return base;
  }

  // Offsuit (broadways, wheel aces, gappers)
  const broadway = isBroadway(hi) && isBroadway(lo);
  const offsConn = gap === 1;

  base.green.push({
    title: broadway ? "Top pair / two-pair / strong gutters" : offsConn ? "Open-enders / pair+draw" : "Strong top-pair / two-pair",
    bullets: [
      broadway
        ? "Top pair good kicker and two-pair on safe boards: value/protection; barrel good turns."
        : offsConn
        ? "Open-enders and pair+draws: pressure single opponents; mix raises vs small c-bets."
        : "When you smash (two-pair+), build pots; protect vs live overcards/backdoors.",
    ],
    examples: [
      `${hi}${lo}x (r)`,
      offsConn ? `${rankStrAbove(hi)} ${hi} ${lo} (r)` : `${rankStrAbove(hi)} ${rankStrBelow(lo)} x`,
    ].map(example),
  });

  base.yellow.push({
    title: "Marginal one-pair / backdoors",
    bullets: [
      "Check-call small once in-position; fold to pressure on turns that help opponent's range.",
      "Favor pot control multiway; avoid thin value on coordinated runouts.",
    ],
    examples: [
      `${hi} ${rankStrBelow(hi)} ${rankStrBelow(lo)} (r)`,
      `${lo} ${rankStrBelow(lo)} ${rankStrAbove(hi)} (two-tone)`,
    ].map(example),
  });

  base.red.push({
    title: "High, disconnected boards you miss / bad low boards",
    bullets: [
      "AKx/QTx without connection; also super-low boards that smash callers' ranges.",
      "Mostly give up out-of-position; continue only with strong backdoors or vs tiny sizes in-position.",
    ],
    examples: ["A K 4 (r)", "6 5 4 (two-tone)"].map(example),
  });

  return base;
}

// ----- Rank stepping helpers -----
function idx(r: string) { return RANK_ORDER[r]; }
function rankByIdx(i: number) { return RANKS[Math.max(0, Math.min(RANKS.length - 1, i))]; }
function rankStrAbove(r: string) { return rankByIdx(Math.max(0, idx(r) - 1)); }
function rankStrAboveOrSame(r: string) { return rankByIdx(Math.max(0, idx(r))); }
function rankStrBelow(r: string | number) {
  const rr = typeof r === "string" ? r : RANKS[Math.max(0, Math.min(RANKS.length - 1, r))];
  return rankByIdx(Math.min(RANKS.length - 1, idx(rr) + 1));
}

// ----- UI Bits -----
const Badge = ({ tone, children }: { tone: "green" | "yellow" | "red"; children: React.ReactNode }) => (
  <span
    className={
      "inline-flex items-center gap-2 rounded-2xl px-3 py-1 text-xs font-semibold shadow-sm " +
      (tone === "green"
        ? "bg-emerald-100 text-emerald-800"
        : tone === "yellow"
        ? "bg-yellow-100 text-yellow-800"
        : "bg-rose-100 text-rose-800")
    }
  >
    {tone === "green" ? "🟢" : tone === "yellow" ? "🟡" : "🔴"} {children}
  </span>
);

const Card = ({ title, tone, children, examples }: { title: string; tone: "green" | "yellow" | "red"; children: React.ReactNode; examples?: string[]; }) => (
  <motion.div
    layout
    initial={{ opacity: 0, y: 8 }}
    animate={{ opacity: 1, y: 0 }}
    exit={{ opacity: 0, y: -8 }}
    className="rounded-2xl border bg-white p-4 shadow-sm ring-1 ring-black/5"
  >
    <div className="mb-2 flex items-center justify-between">
      <Badge tone={tone}>{tone === "green" ? "Green-light" : tone === "yellow" ? "Yellow-light" : "Red-light"}</Badge>
      <div className="text-sm font-medium text-slate-700">{title}</div>
    </div>
    <div className="prose prose-sm max-w-none text-slate-700">
      {children}
      {examples && examples.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          {examples.slice(0, 6).map((e, i) => (
            <span key={i} className="rounded-full bg-slate-100 px-2 py-1 font-mono">{e}</span>
          ))}
        </div>
      )}
    </div>
  </motion.div>
);

function copyText(text: string) {
  try { navigator.clipboard?.writeText(text); } catch (e) {}
}

export default function PokerFlopTrafficLights() {
  const [handInput, setHandInput] = useState("");
  const hand = useMemo(() => parseHand(handInput), [handInput]);
  const advice = useMemo(() => generateAdvice(hand), [hand]);

  const header = (
    <div className="mx-auto w-full max-w-5xl px-4 pt-10 pb-4">
      <div className="flex flex-col items-center gap-3 text-center">
        <div className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <Sparkles className="size-5" />
          <span>Poker Flop Traffic Lights</span>
        </div>
        <p className="max-w-2xl text-sm text-slate-600">
          Type a starting hand like <span className="font-mono">Js9s</span>, <span className="font-mono">AhKd</span>, or <span className="font-mono">7c7d</span>.
          We classify <span className="font-medium">Green</span> (build pots), <span className="font-medium">Yellow</span> (realize cheap), and <span className="font-medium">Red</span> (let it go) flop families with quick heuristics.
        </p>
      </div>
    </div>
  );

  const controls = (
    <div className="mx-auto w-full max-w-5xl px-4">
      <div className="flex flex-col gap-3 rounded-2xl border bg-white/60 p-4 shadow-sm ring-1 ring-black/5">
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={handInput}
            onChange={(e) => setHandInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                const h = parseHand(handInput);
                if (!h) return;
              }
            }}
            placeholder="Enter starting hand (e.g., Js9s, AhKd, 7c7d)"
            className="w-full flex-1 rounded-xl border px-3 py-2 font-mono text-sm outline-none focus:ring-2 focus:ring-emerald-400 sm:w-[340px]"
          />
          <button
            onClick={() => setHandInput("")}
            className="inline-flex items-center gap-2 rounded-xl border bg-white px-3 py-2 text-sm shadow-sm hover:bg-slate-50"
            title="Clear"
          >
            <RefreshCcw className="size-4" /> Clear
          </button>
          <button
            onClick={() => setHandInput(randomHand())}
            className="inline-flex items-center gap-2 rounded-xl border bg-white px-3 py-2 text-sm shadow-sm hover:bg-slate-50"
            title="Random valid hand"
          >
            <Shuffle className="size-4" /> Random
          </button>
          {hand && (
            <button
              onClick={() => copyText(handLabel(hand))}
              className="inline-flex items-center gap-2 rounded-xl border bg-white px-3 py-2 text-sm shadow-sm hover:bg-slate-50"
              title="Copy parsed hand label"
            >
              <Copy className="size-4" /> Copy hand
            </button>
          )}
        </div>
        <div className="flex items-start gap-2 text-xs text-slate-500">
          <Info className="mt-0.5 size-4 shrink-0" />
          <div>
            Format: <span className="font-mono">RankSuitRankSuit</span> (e.g., <span className="font-mono">J s 9 s</span> → <span className="font-mono">Js9s</span>). Suits: c,d,h,s. Case-insensitive.
          </div>
        </div>
      </div>
    </div>
  );

  const content = (
    <div className="mx-auto w-full max-w-5xl gap-4 px-4 py-6">
      {!hand && (
        <div className="rounded-2xl border bg-white/70 p-6 text-slate-600 shadow-sm ring-1 ring-black/5">
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold"><CircleHelp className="size-4"/> How to read the output</div>
          <ul className="list-disc space-y-1 pl-5 text-sm">
            <li><span className="font-medium">Green</span>: strong value/combo equity → build pots (size up multiway for protection).</li>
            <li><span className="font-medium">Yellow</span>: marginal / backdoor-heavy → realize equity cheap; fold to heat multiway.</li>
            <li><span className="font-medium">Red</span>: range disadvantage / dominated → check-fold; don’t bloat.</li>
          </ul>
        </div>
      )}

      <AnimatePresence mode="popLayout">
        {hand && advice && (
          <motion.div layout className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="space-y-3">
              {advice.green.map((g, i) => (
                <Card key={"g" + i} title={g.title} tone="green" examples={g.examples}>
                  <ul className="list-disc space-y-1 pl-5 text-sm">
                    {g.bullets.map((b, j) => (
                      <li key={j}>{b}</li>
                    ))}
                  </ul>
                </Card>
              ))}
            </div>
            <div className="space-y-3">
              {advice.yellow.map((g, i) => (
                <Card key={"y" + i} title={g.title} tone="yellow" examples={g.examples}>
                  <ul className="list-disc space-y-1 pl-5 text-sm">
                    {g.bullets.map((b, j) => (
                      <li key={j}>{b}</li>
                    ))}
                  </ul>
                </Card>
              ))}
            </div>
            <div className="space-y-3">
              {advice.red.map((g, i) => (
                <Card key={"r" + i} title={g.title} tone="red" examples={g.examples}>
                  <ul className="list-disc space-y-1 pl-5 text-sm">
                    {g.bullets.map((b, j) => (
                      <li key={j}>{b}</li>
                    ))}
                  </ul>
                </Card>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {hand && (
        <div className="mt-6 grid gap-3 rounded-2xl border bg-white p-4 shadow-sm ring-1 ring-black/5 md:grid-cols-2">
          <div>
            <div className="text-sm font-semibold text-slate-700">Parsed hand</div>
            <div className="font-mono text-slate-800">{handLabel(hand)}</div>
            <div className="mt-2 text-xs text-slate-500">Suited: {hand.suited ? "Yes" : "No"} · Pair: {hand.pair ? "Yes" : "No"} · Gap: {Math.abs(RANK_ORDER[hand.r1] - RANK_ORDER[hand.r2])}</div>
          </div>
          <div className="text-xs text-slate-500">
            This tool encodes practical heuristics for MTT/cash NLHE. Always adjust to position, SPR, players, and bet sizing. Use as a quick <em>traffic light</em> guide, not absolute rules.
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="min-h-dvh w-full bg-gradient-to-b from-emerald-50 via-white to-white">
      {header}
      {controls}
      {content}
      <footer className="mx-auto w-full max-w-5xl px-4 pb-10 text-center text-xs text-slate-400">
        Built with React + Tailwind. Tip: paste <span className="font-mono">Js9s</span> to see suited-connector behavior.
      </footer>
    </div>
  );
}
