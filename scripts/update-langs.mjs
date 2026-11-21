// 重新统计常用语言,把数字写进主页那张卡片(assets/banner-*.svg)。
// 由 .github/workflows/update-langs.yml 每天自动运行;也可以手动跑:node scripts/update-langs.mjs
import { readFileSync, writeFileSync } from "node:fs";

const USER = process.env.GH_USER || "weierliteln";
const TOKEN = process.env.GITHUB_TOKEN || "";
const TOP = 6;
// 博客那套柔和的颜色,按名次用
const COLORS = ["#5FD08A", "#FFCE2E", "#FF8F85", "#F2A0B9", "#B9A4E8", "#9DB7D9"];
const THEMES = { light: { ink: "#1d1d1f", muted: "#5b5e66" }, dark: { ink: "#f2f2f4", muted: "#9da0aa" } };
// 卡片里进度条和图例的位置(和 SVG 里的卡片对应)
const BX = 736, BW = 376, CY = 34;

async function api(path) {
  const res = await fetch(`https://api.github.com${path}`, { headers: { Accept: "application/vnd.github+json", "User-Agent": "profile-langs", ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}) } });
  if (!res.ok) throw new Error(`${path} → ${res.status}`);
  return res.json();
}

// 只算自己的、公开的、不是 fork 的仓库,按代码量(字节)加总
const repos = [];
for (let page = 1; ; page++) {
  const batch = await api(`/users/${USER}/repos?per_page=100&type=owner&page=${page}`);
  repos.push(...batch.filter((r) => !r.fork && !r.private));
  if (batch.length < 100) break;
}
const bytes = {};
for (const repo of repos) {
  const langs = await api(`/repos/${repo.full_name}/languages`);
  for (const [name, n] of Object.entries(langs)) bytes[name] = (bytes[name] || 0) + n;
}
const total = Object.values(bytes).reduce((a, b) => a + b, 0);
if (!total) throw new Error("没有统计到任何语言,不改动图片");
const langs = Object.entries(bytes).sort((a, b) => b[1] - a[1]).slice(0, TOP).map(([name, n], i) => ({ name, pct: (n / total) * 100, color: COLORS[i] }));
const shown = langs.reduce((a, l) => a + l.pct, 0);

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
function block(theme) {
  let x = BX, seg = "";
  for (const l of langs) {
    const w = (BW * l.pct) / shown; // 进度条按显示出来的这几种铺满
    seg += `<rect x="${x.toFixed(1)}" y="${CY + 66}" width="${(w + 0.6).toFixed(1)}" height="12" fill="${l.color}"/>`;
    x += w;
  }
  const legend = langs.map((l, i) => {
    const lx = BX + Math.floor(i / 3) * 196, ly = CY + 116 + (i % 3) * 34;
    return `<circle cx="${lx + 6}" cy="${ly - 5}" r="6" fill="${l.color}"/><text x="${lx + 22}" y="${ly}" font-size="16" font-weight="600" fill="${theme.ink}">${esc(l.name)}</text><text x="${lx + 176}" y="${ly}" text-anchor="end" font-size="15" fill="${theme.muted}">${l.pct.toFixed(1)}%</text>`;
  }).join("");
  return `<!--langs-->\n<g clip-path="url(#bar)"><g class="grow">${seg}</g></g>\n${legend}\n<!--/langs-->`;
}

for (const [name, theme] of Object.entries(THEMES)) {
  const file = new URL(`../assets/banner-${name}.svg`, import.meta.url);
  const svg = readFileSync(file, "utf8");
  if (!/<!--langs-->[\s\S]*<!--\/langs-->/.test(svg)) throw new Error(`${name}: 找不到 <!--langs--> 标记`);
  const next = svg
    .replace(/<!--langs-->[\s\S]*<!--\/langs-->/, block(theme))
    .replace(/<desc id="d">[^<]*<\/desc>/, `<desc id="d">常用语言:${langs.map((l) => `${esc(l.name)} ${l.pct.toFixed(1)}%`).join("、")}</desc>`);
  writeFileSync(file, next);
}
console.log(langs.map((l) => `${l.name} ${l.pct.toFixed(1)}%`).join(" · "), `(${repos.length} 个仓库)`);
