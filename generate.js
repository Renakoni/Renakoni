const fs = require('fs');

const USERNAME = 'Renakoni';
const TOKEN = process.env.METRICS_TOKEN;
const DAYS = 7;
const TZ_OFFSET_HOURS = 8; // Asia/Shanghai, for matching your local daily view

const headers = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
};

function shiftedDate(date) {
    return new Date(date.getTime() + TZ_OFFSET_HOURS * 60 * 60 * 1000);
}

function dayKey(date) {
    const d = shiftedDate(date);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

function dayLabelFromKey(key) {
    const [, month, day] = key.split('-');
    return `${Number(month)}/${Number(day)}`;
}

function formatStat(value) {
    if (value >= 1000) return `${(value / 1000).toFixed(1)}k`;
    return String(value);
}

async function fetchJson(url) {
    const res = await fetch(url, { headers });
    if (!res.ok) {
        const body = await res.text();
        throw new Error(`GitHub API ${res.status} for ${url}: ${body.slice(0, 300)}`);
    }
    return res.json();
}

async function fetchAllPages(url) {
    const items = [];
    for (let page = 1; ; page++) {
        const sep = url.includes('?') ? '&' : '?';
        const pageItems = await fetchJson(`${url}${sep}per_page=100&page=${page}`);
        if (!Array.isArray(pageItems) || pageItems.length === 0) break;
        items.push(...pageItems);
        if (pageItems.length < 100) break;
    }
    return items;
}

async function generateDailySVG() {
    if (!TOKEN) {
        throw new Error('Missing METRICS_TOKEN. Add a GitHub token with access to the repositories you want to count.');
    }

    console.log(`Fetching daily code stats for the last ${DAYS} days...`);

    const dailyData = [];
    const dailyMap = new Map();
    const now = new Date();

    for (let i = DAYS - 1; i >= 0; i--) {
        const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
        const key = dayKey(d);
        const item = { key, dateStr: dayLabelFromKey(key), a: 0, d: 0 };
        dailyData.push(item);
        dailyMap.set(key, item);
    }

    const sinceDate = new Date(now.getTime() - DAYS * 24 * 60 * 60 * 1000).toISOString();

    const repos = await fetchAllPages(
        'https://api.github.com/user/repos?visibility=all&affiliation=owner,collaborator,organization_member'
    );

    console.log(`Found ${repos.length} accessible repositories.`);

    for (const repo of repos) {
        if (repo.archived || repo.disabled) continue;

        const fullName = repo.full_name;
        console.log(`Checking ${fullName}${repo.private ? ' (private)' : ''}`);

        const commits = await fetchAllPages(
            `https://api.github.com/repos/${fullName}/commits?author=${encodeURIComponent(USERNAME)}&since=${encodeURIComponent(sinceDate)}`
        );

        for (const commit of commits) {
            const detail = await fetchJson(`https://api.github.com/repos/${fullName}/commits/${commit.sha}`);
            const stats = detail.stats;
            if (!stats) continue;

            const commitDate = new Date(commit.commit.author.date);
            const item = dailyMap.get(dayKey(commitDate));
            if (!item) continue;

            item.a += stats.additions;
            item.d += stats.deletions;
        }
    }

    console.log('Stats:', dailyData.map((d) => `${d.dateStr}: +${d.a}/-${d.d}`).join(', '));

    const maxVal = Math.max(...dailyData.map((d) => Math.max(d.a, d.d)), 10);
    const chartHeight = 86;
    let barsSvg = '';

    const barWidth = 38;
    const spacing = 32;
    const startX = 60;
    const centerY = 176;

    dailyData.forEach((day, index) => {
        const x = startX + index * (barWidth + spacing);

        const addHeight = Math.max((day.a / maxVal) * chartHeight, day.a > 0 ? 2 : 0);
        const delHeight = Math.max((day.d / maxVal) * chartHeight, day.d > 0 ? 2 : 0);

        barsSvg += `<rect x="${x}" y="${centerY - addHeight}" width="${barWidth}" height="${addHeight}" fill="#3fb950" rx="3" />`;
        barsSvg += `<rect x="${x}" y="${centerY + 1}" width="${barWidth}" height="${delHeight}" fill="#f85149" rx="3" />`;
        barsSvg += `<text x="${x + barWidth / 2}" y="${centerY + chartHeight + 25}" class="text label" text-anchor="middle">${day.dateStr}</text>`;

        if (day.a > 0) {
            barsSvg += `<text x="${x + barWidth / 2}" y="${centerY - addHeight - 8}" class="text stat add" text-anchor="middle">+${formatStat(day.a)}</text>`;
        }
        if (day.d > 0) {
            barsSvg += `<text x="${x + barWidth / 2}" y="${centerY + delHeight + 16}" class="text stat del" text-anchor="middle">-${formatStat(day.d)}</text>`;
        }
    });

    const svgContent = `
    <svg width="640" height="320" xmlns="http://www.w3.org/2000/svg">
        <style>
            .text { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
            .title { font-weight: 650; font-size: 17px; fill: #e6edf3; }
            .legend { font-size: 11px; fill: #8b949e; }
            .label { font-size: 10px; fill: #8b949e; }
            .axis { stroke: #30363d; stroke-width: 1; }
            .stat { font-size: 10px; font-weight: 650; }
            .add { fill: #3fb950; }
            .del { fill: #f85149; }
        </style>
        <rect width="100%" height="100%" fill="#0d1117" rx="8" stroke="#30363d" stroke-width="1"/>
        <rect x="1" y="1" width="638" height="62" fill="#111820" rx="8"/>

        <text x="25" y="39" class="text title">7-Day Code Activity</text>
        <text x="486" y="39" class="text legend">+ additions</text>
        <text x="568" y="39" class="text legend">- deletions</text>
        <line x1="25" y1="${centerY}" x2="615" y2="${centerY}" class="axis" stroke-dasharray="4" />

        ${barsSvg}
    </svg>`;

    fs.writeFileSync('workload-chart.svg', svgContent);
    console.log('Generated workload-chart.svg');
}

generateDailySVG().catch((error) => {
    console.error(error);
    process.exit(1);
});
