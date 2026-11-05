// Worker 2 (GitHub Actions): runs skill voice-to-memo v1 against job 2's MCP link.
// Needs env JOB2_URL (repo secret) and CLIP_URL. Writes out/result.json.
import { Mcp, payload } from "./mcp.mjs"; import fs from "fs";
const { JOB2_URL, CLIP_URL } = process.env;
if (!JOB2_URL || !CLIP_URL) throw new Error("JOB2_URL and CLIP_URL are required");
fs.mkdirSync("out", { recursive: true });
const m = new Mcp(JOB2_URL, e => fs.appendFileSync("out/calls.jsonl", JSON.stringify(e).replace(/v1\.eyJ[\w.-]+/g, "v1.eyJ…") + "\n"));
const init = await m.init();
console.log("server:", init.instructions ?? "");
const tools = (await m.tools()).tools;
for (const t of tools) console.log("tool", t.name, JSON.stringify(t.inputSchema.properties));
const step = p => p.step ?? p.stepToken;
// Segment offsets: accept seconds (number or numeric string), "m:ss"/"h:mm:ss", or ms fields.
const secs = seg => {
  for (const k of ["at", "start", "startSec", "start_s", "startSeconds", "from", "offset", "t", "begin"]) {
    const v = seg[k]; if (v == null) continue;
    if (typeof v === "number") return v;
    if (/^\d+(\.\d+)?$/.test(v)) return Number(v);
    if (/^\d+(:\d+)+(\.\d+)?$/.test(v)) return v.split(":").reduce((a, x) => a * 60 + Number(x), 0);
  }
  for (const k of ["startMs", "start_ms"]) if (typeof seg[k] === "number") return seg[k] / 1000;
  throw new Error("no start offset in segment: " + JSON.stringify(seg));
};
const mmss = sec => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, "0")}`;

// 1. transcribe
let p = payload(await m.call("transcribe", { url: CLIP_URL }));
const segs = p.segments ?? [];
console.log("segment keys:", JSON.stringify(Object.keys(segs[0] ?? {})), "first:", JSON.stringify(segs[0]));
let st = step(p);
console.log("segments:"); for (const s of segs) console.log(`  [${mmss(secs(s))}] ${s.text}`);

// 2. notes: one per finding (fault, freeze/stall, hold, reset), every time it happens.
const FINDING = /\b(fault|faulted|froze|frozen|freez\w*|stall\w*|hung|hang\w*|hold|held|reset\w*|reboot\w*|restart\w*)\b/i;
const notes = [];
for (const s of segs) {
  // each segment is one entry on the desk's log; keep its spoken time as said
  if (FINDING.test(s.text)) notes.push(`${s.text.trim().replace(/[.]$/, "")} @${mmss(secs(s))}`);
  else console.log("not a finding:", s.text);
}
for (const n of notes) { p = payload(await m.call("memo_write", { text: n, step: st })); st = step(p) ?? st; }

// 3. confirm
p = payload(await m.call("memo_search", { step: st })); st = step(p) ?? st;
const have = JSON.stringify(p);
for (const n of notes) if (!have.includes(n.split(" @")[1])) console.log("missing in search:", n);
console.log("notes:"); for (const n of notes) console.log("  " + n);

// 4. submit
p = payload(await m.call("submit", { result: notes.join("\n"), skillVersion: "1", step: st }));
console.log("submit status:", p.status, p.message ?? "");
if (p.receipt) console.log(`::add-mask::${p.receipt}`);
fs.writeFileSync("out/result.json", JSON.stringify({ segments: segs, notes, submit: p }, null, 1));
if (p.status !== "accepted") process.exitCode = 1;
