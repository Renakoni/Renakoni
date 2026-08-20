const fs = require('fs');

const USERNAME = 'Renakoni';
const TOKEN = process.env.METRICS_TOKEN;
const DAYS = 7;
const TZ_OFFSET_HOURS = 8;
const IGNORED_LANGUAGES = new Set(['Jupyter Notebook']);

const headers = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
};

function shiftedDate(date) {
    return new Date(date.getTime() + TZ_OFFSET_HOURS * 60 * 60 * 1000);
}

function dayKey(date) {
    const value = shiftedDate(date);
    return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, '0')}-${String(value.getUTCDate()).padStart(2, '0')}`;
}

function dayLabelFromKey(key) {
    const [, month, day] = key.split('-');
    return `${Number(month)}/${Number(day)}`;
}

function formatStat(value) {
    if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}m`;
    if (value >= 1000) return `${(value / 1000).toFixed(1)}k`;
    return String(value);
}

function formatBytes(value) {
    if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)} GB`;
    if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)} MB`;
    if (value >= 1000) return `${(value / 1000).toFixed(1)} KB`;
    return `${value} B`;
}

function escapeXml(value) {
    return value.replace(/[&<>"']/g, (char) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;',
    })[char]);
}

async function fetchJson(url) {
    const response = await fetch(url, { headers });
    if (!response.ok) {
        const body = await response.text();
        throw new Error(`GitHub API ${response.status} for ${url}: ${body.slice(0, 300)}`);
    }
    return response.json();
}

async function fetchAllPages(url) {
    const items = [];
    for (let page = 1; ; page++) {
        const separator = url.includes('?') ? '&' : '?';
        const pageItems = await fetchJson(`${url}${separator}per_page=100&page=${page}`);
        if (!Array.isArray(pageItems) || pageItems.length === 0) break;
        items.push(...pageItems);
        if (pageItems.length < 100) break;
    }
    return items;
}

function smoothPath(points) {
    if (points.length < 2) return '';
    let path = `M ${points[0].x} ${points[0].y}`;
    for (let index = 0; index < points.length - 1; index++) {
        const p0 = points[index - 1] || points[index];
        const p1 = points[index];
        const p2 = points[index + 1];
        const p3 = points[index + 2] || p2;
        const c1x = p1.x + (p2.x - p0.x) / 6;
        const c1y = p1.y + (p2.y - p0.y) / 6;
        const c2x = p2.x - (p3.x - p1.x) / 6;
        const c2y = p2.y - (p3.y - p1.y) / 6;
        path += ` C ${c1x.toFixed(1)} ${c1y.toFixed(1)}, ${c2x.toFixed(1)} ${c2y.toFixed(1)}, ${p2.x} ${p2.y}`;
    }
    return path;
}

function languageMark(name) {
    const marks = {
        Python: 'PY', TypeScript: 'TS', JavaScript: 'JS',
        CSS: 'CSS', Dart: 'DART', Vue: 'VUE', Java: 'JAVA', Svelte: 'SV', Other: '+',
    };
    return marks[name] || name.slice(0, 3).toUpperCase();
}

function renderTelemetrySvg(dailyData, languageTotals) {
    const width = 1166;
    const centerY = 166;
    const startX = 58;
    const endX = 1108;
    const step = (endX - startX) / (dailyData.length - 1);
    const maxLog = Math.max(...dailyData.flatMap((day) => [Math.log1p(day.a), Math.log1p(day.d)]), 1);
    const addPoints = dailyData.map((day, index) => ({
        x: Math.round(startX + step * index),
        y: Math.round(centerY - (Math.log1p(day.a) / maxLog) * 88),
        value: day.a,
        label: day.dateStr,
    }));
    const delPoints = dailyData.map((day, index) => ({
        x: Math.round(startX + step * index),
        y: Math.round(centerY + (Math.log1p(day.d) / maxLog) * 70),
        value: day.d,
        label: day.dateStr,
    }));
    const addPath = smoothPath(addPoints);
    const delPath = smoothPath(delPoints);
    const addArea = `M ${addPoints[0].x} ${centerY} L ${addPoints[0].x} ${addPoints[0].y} ${addPath.slice(addPath.indexOf('C'))} L ${addPoints.at(-1).x} ${centerY} Z`;
    const delArea = `M ${delPoints[0].x} ${centerY} L ${delPoints[0].x} ${delPoints[0].y} ${delPath.slice(delPath.indexOf('C'))} L ${delPoints.at(-1).x} ${centerY} Z`;
    const totalAdditions = dailyData.reduce((total, day) => total + day.a, 0);
    const totalDeletions = dailyData.reduce((total, day) => total + day.d, 0);

    const pointMarkup = dailyData.map((day, index) => {
        const add = addPoints[index];
        const del = delPoints[index];
        return `<g class="node" style="animation-delay:${(index * 0.08).toFixed(2)}s">
          <rect x="${add.x - 5}" y="${add.y - 5}" width="10" height="10" rx="2" transform="rotate(45 ${add.x} ${add.y})" fill="var(--mint)"/>
          <rect x="${del.x - 4}" y="${del.y - 4}" width="8" height="8" rx="2" transform="rotate(45 ${del.x} ${del.y})" fill="var(--coral)"/>
          <text x="${add.x}" y="${Math.max(add.y - 12, 66)}" text-anchor="middle" class="mono value add">+${formatStat(day.a)}</text>
          <text x="${del.x}" y="${Math.min(del.y + 19, 250)}" text-anchor="middle" class="mono value del">-${formatStat(day.d)}</text>
          <text x="${add.x}" y="266" text-anchor="middle" class="mono date">${day.dateStr}</text>
        </g>`;
    }).join('');

    const languageEntries = [...languageTotals.entries()].sort((a, b) => b[1] - a[1]);
    const totalBytes = languageEntries.reduce((total, [, bytes]) => total + bytes, 0);
    const namedEntries = languageEntries.filter(([name]) => name !== 'Other');
    const visible = namedEntries.slice(0, 7);
    const knownOtherBytes = languageTotals.get('Other') || 0;
    const otherBytes = knownOtherBytes + namedEntries.slice(7).reduce((total, [, bytes]) => total + bytes, 0);
    if (otherBytes > 0) visible.push(['Other', otherBytes]);
    const positions = [
        [84, 366], [228, 393], [372, 350], [516, 391],
        [660, 352], [804, 390], [948, 354], [1082, 386],
    ];
    const route = visible.map((_, index) => `${index === 0 ? 'M' : 'L'} ${positions[index][0]} ${positions[index][1]}`).join(' ');
    const languageMarkup = visible.map(([name, bytes], index) => {
        const percentage = totalBytes ? (bytes / totalBytes) * 100 : 0;
        const radius = Math.round(17 + Math.sqrt(percentage) * 3.3);
        const [x, y] = positions[index];
        return `<g class="language" style="animation-delay:${(0.35 + index * 0.07).toFixed(2)}s">
          <circle cx="${x}" cy="${y}" r="${radius}" fill="var(--lang-${index + 1})" opacity="0.2"/>
          <circle cx="${x}" cy="${y}" r="${Math.max(radius - 6, 12)}" fill="var(--panel)" stroke="var(--lang-${index + 1})" stroke-width="2"/>
          <text x="${x}" y="${y + 4}" text-anchor="middle" class="mono mark" fill="var(--lang-${index + 1})">${escapeXml(languageMark(name))}</text>
          <text x="${x}" y="${Math.min(y + radius + 17, 455)}" text-anchor="middle" class="ui language-label">${escapeXml(name)} ${percentage.toFixed(1)}%</text>
        </g>`;
    }).join('');

    return `<svg width="${width}" height="470" viewBox="0 0 ${width} 470" xmlns="http://www.w3.org/2000/svg" role="img" aria-labelledby="title desc">
  <title id="title">Renakoni lab telemetry</title>
  <desc id="desc">A seven-day code energy trace and a constellation of most-used programming languages.</desc>
  <style>
    :root { --panel:#eef0ed; --panel-2:#e5e9e4; --line:#bfc8c0; --ink:#32373a; --muted:#6d7674; --mint:#3a9885; --coral:#d76d59; --violet:#7467a7; --amber:#c49338; --blue:#4c79a8; --aqua:#4b9da0; --rose:#b86f86; --lang-1:#3a9885; --lang-2:#7467a7; --lang-3:#d76d59; --lang-4:#c49338; --lang-5:#4c79a8; --lang-6:#4b9da0; --lang-7:#b86f86; --lang-8:#717b7a; }
    @media (prefers-color-scheme: dark) { :root { --panel:#191c22; --panel-2:#20252c; --line:#3b434b; --ink:#eef0ed; --muted:#9aa4a4; --mint:#78c8b0; --coral:#f08a72; --violet:#a395df; --amber:#e3bd61; --blue:#74a4d4; --aqua:#70c1c0; --rose:#d795aa; --lang-1:#78c8b0; --lang-2:#a395df; --lang-3:#f08a72; --lang-4:#e3bd61; --lang-5:#74a4d4; --lang-6:#70c1c0; --lang-7:#d795aa; --lang-8:#a3adac; } }
    text { letter-spacing:0; } .ui { font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; } .mono { font-family:ui-monospace,SFMono-Regular,Consolas,monospace; }
    .trace { fill:none; stroke-linecap:round; stroke-linejoin:round; stroke-dasharray:1; stroke-dashoffset:1; animation:draw 1.4s cubic-bezier(.16,1,.3,1) forwards; }
    .node,.language { opacity:0; animation:appear .55s cubic-bezier(.16,1,.3,1) forwards; } .value { font-size:10px; font-weight:750; } .add { fill:var(--mint); } .del { fill:var(--coral); } .date,.language-label { fill:var(--muted); font-size:10px; font-weight:650; } .mark { font-size:11px; font-weight:800; }
    .scanner { animation:blink 1.8s ease-in-out infinite alternate; }
    @keyframes draw { to { stroke-dashoffset:0; } } @keyframes appear { to { opacity:1; } } @keyframes blink { to { opacity:.35; } }
    @media (prefers-reduced-motion:reduce) { .trace { animation:none; stroke-dashoffset:0; } .node,.language { animation:none; opacity:1; } .scanner { display:none; } }
  </style>
  <defs><pattern id="grid" width="16" height="16" patternUnits="userSpaceOnUse"><path d="M16 0H0V16" fill="none" stroke="var(--line)" stroke-width=".6" opacity=".16"/></pattern></defs>
  <rect x="1" y="1" width="1164" height="468" rx="18" fill="var(--panel)" stroke="var(--line)" stroke-width="2"/>
  <rect x="1" y="1" width="1164" height="468" rx="18" fill="url(#grid)"/>
  <rect x="22" y="20" width="8" height="8" rx="2" fill="var(--violet)"/><text x="42" y="30" class="ui" font-size="15" font-weight="750" fill="var(--ink)">LAB TELEMETRY</text>
  <text x="1142" y="30" text-anchor="end" class="mono" font-size="10" font-weight="700" fill="var(--muted)"><tspan fill="var(--mint)">+${formatStat(totalAdditions)}</tspan><tspan> / </tspan><tspan fill="var(--coral)">-${formatStat(totalDeletions)}</tspan><tspan> / UTC+8</tspan></text><path d="M22 48h1122" stroke="var(--line)"/>
  <text x="32" y="77" class="mono" font-size="11" font-weight="750" fill="var(--muted)">7 DAY ENERGY TRACE</text>
  <path d="M32 ${centerY}h1102" stroke="var(--line)" stroke-dasharray="4 8"/><path d="${addArea}" fill="var(--mint)" opacity=".08"/><path d="${delArea}" fill="var(--coral)" opacity=".07"/>
  <path d="${addPath}" class="trace" pathLength="1" stroke="var(--mint)" stroke-width="3"/><path d="${delPath}" class="trace" pathLength="1" stroke="var(--coral)" stroke-width="2" style="animation-delay:.12s"/>
  ${pointMarkup}<path d="M22 283h1122" stroke="var(--line)"/>
  <text x="32" y="313" class="mono" font-size="11" font-weight="750" fill="var(--muted)">LANGUAGE CONSTELLATION</text>
  <text x="1134" y="313" text-anchor="end" class="mono" font-size="10" font-weight="650" fill="var(--muted)">${languageEntries.length} SIGNALS / ${formatBytes(totalBytes)} INDEXED</text>
  <path id="route" d="${route}" fill="none" stroke="var(--line)" stroke-width="1.5" stroke-dasharray="3 7"/>
  ${languageMarkup}<circle class="scanner" r="4" fill="var(--amber)"><animateMotion dur="12s" repeatCount="indefinite"><mpath href="#route"/></animateMotion></circle>
</svg>`;
}

async function generateTelemetry() {
    if (!TOKEN) throw new Error('Missing METRICS_TOKEN.');
    const now = new Date();
    const dailyData = [];
    const dailyMap = new Map();
    for (let index = DAYS - 1; index >= 0; index--) {
        const key = dayKey(new Date(now.getTime() - index * 86400000));
        const item = { key, dateStr: dayLabelFromKey(key), a: 0, d: 0 };
        dailyData.push(item);
        dailyMap.set(key, item);
    }
    const since = new Date(now.getTime() - DAYS * 86400000).toISOString();
    const repos = (await fetchAllPages('https://api.github.com/user/repos?visibility=all&affiliation=owner,collaborator,organization_member'))
        .filter((repo) => !repo.archived && !repo.disabled);
    const languageTotals = new Map();

    for (const repo of repos) {
        console.log(`Checking ${repo.full_name}${repo.private ? ' (private)' : ''}`);
        if (!repo.fork) {
            const languages = await fetchJson(`https://api.github.com/repos/${repo.full_name}/languages`);
            for (const [name, bytes] of Object.entries(languages)) {
                if (!IGNORED_LANGUAGES.has(name)) languageTotals.set(name, (languageTotals.get(name) || 0) + bytes);
            }
        }
        const commits = await fetchAllPages(`https://api.github.com/repos/${repo.full_name}/commits?author=${encodeURIComponent(USERNAME)}&since=${encodeURIComponent(since)}`);
        for (const commit of commits) {
            const detail = await fetchJson(`https://api.github.com/repos/${repo.full_name}/commits/${commit.sha}`);
            const item = dailyMap.get(dayKey(new Date(commit.commit.author.date)));
            if (item && detail.stats) { item.a += detail.stats.additions; item.d += detail.stats.deletions; }
        }
    }
    fs.writeFileSync('lab-telemetry.svg', renderTelemetrySvg(dailyData, languageTotals));
    console.log('Generated lab-telemetry.svg');
}

module.exports = { renderTelemetrySvg };
if (require.main === module) generateTelemetry().catch((error) => { console.error(error); process.exit(1); });
