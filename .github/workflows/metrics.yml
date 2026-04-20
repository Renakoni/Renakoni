const fs = require('fs');

// 请确保这是你准确的 GitHub 用户名
const USERNAME = 'Renakoni'; 
const TOKEN = process.env.METRICS_TOKEN;

async function generateDailySVG() {
    console.log("🚀 开始拉取最近 14 天的【每日】代码数据...");
    
    const DAYS = 14; // 统计最近 14 天
    const dailyData = [];
    const now = new Date();
    
    // 1. 初始化过去 14 天的数据面板
    for (let i = DAYS - 1; i >= 0; i--) {
        const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
        const dateStr = `${d.getMonth() + 1}/${d.getDate()}`;
        dailyData.push({ dateStr: dateStr, a: 0, d: 0 });
    }

    // 计算 14 天前的时间戳
    const sinceDate = new Date(now.getTime() - DAYS * 24 * 60 * 60 * 1000).toISOString();

    // 2. 获取所有公开仓库
    const reposRes = await fetch(`https://api.github.com/users/${USERNAME}/repos?per_page=100`, {
        headers: { 'Authorization': `Bearer ${TOKEN}` }
    });
    const repos = await reposRes.json();

    // 3. 遍历仓库，抓取最近 14 天的具体 Commit
    for (const repo of repos) {
        console.log(`正在检查仓库: ${repo.name}`);
        // 查找属于你并且在 14 天内的提交
        const commitsRes = await fetch(`https://api.github.com/repos/${USERNAME}/${repo.name}/commits?author=${USERNAME}&since=${sinceDate}&per_page=100`, {
            headers: { 'Authorization': `Bearer ${TOKEN}` }
        });

        if (commitsRes.status === 200) {
            const commits = await commitsRes.json();
            
            // 遍历这 14 天内的每一个 Commit，去查它具体增删了多少行
            for (const c of commits) {
                const detailRes = await fetch(`https://api.github.com/repos/${USERNAME}/${repo.name}/commits/${c.sha}`, {
                    headers: { 'Authorization': `Bearer ${TOKEN}` }
                });
                
                if (detailRes.status === 200) {
                    const detail = await detailRes.json();
                    const stats = detail.stats; // 包含 additions 和 deletions
                    
                    const commitDate = new Date(c.commit.author.date);
                    const dateStr = `${commitDate.getMonth() + 1}/${commitDate.getDate()}`;
                    
                    // 找到对应的那一天，累加行数
                    const dayItem = dailyData.find(d => d.dateStr === dateStr);
                    if (dayItem && stats) {
                        dayItem.a += stats.additions;
                        dayItem.d += stats.deletions;
                    }
                }
            }
        }
    }

    // 4. 准备画图
    console.log("✅ 数据统计完成，正在生成 SVG...");
    
    // 找出增删行数的最大值，用来计算柱子高度比例 (保底为 10，防止除以 0)
    const maxVal = Math.max(...dailyData.map(d => Math.max(d.a, d.d)), 10);
    const chartHeight = 100; // 上下半区的高度
    let barsSvg = '';
    
    const barWidth = 22;
    const spacing = 18;
    const startX = 40;
    const centerY = 160; // 0轴的位置

    dailyData.forEach((day, index) => {
        const x = startX + index * (barWidth + spacing);
        
        // 计算柱子高度
        const addHeight = Math.max((day.a / maxVal) * chartHeight, day.a > 0 ? 2 : 0);
        const delHeight = Math.max((day.d / maxVal) * chartHeight, day.d > 0 ? 2 : 0);
        
        // 绿色增加柱 (向上)
        barsSvg += `<rect x="${x}" y="${centerY - addHeight}" width="${barWidth}" height="${addHeight}" fill="#3fb950" rx="3" />`;
        // 红色删除柱 (向下)
        barsSvg += `<rect x="${x}" y="${centerY + 1}" width="${barWidth}" height="${delHeight}" fill="#f85149" rx="3" />`;
        
        // 底部日期标签
        barsSvg += `<text x="${x + barWidth/2}" y="${centerY + chartHeight + 25}" class="text label" text-anchor="middle">${day.dateStr}</text>`;
        
        // 如果当天有数据，在柱子旁边显示具体数字
        if (day.a > 0) {
            barsSvg += `<text x="${x + barWidth/2}" y="${centerY - addHeight - 8}" class="text stat add" text-anchor="middle">+${day.a}</text>`;
        }
        if (day.d > 0) {
            barsSvg += `<text x="${x + barWidth/2}" y="${centerY + delHeight + 16}" class="text stat del" text-anchor="middle">-${day.d}</text>`;
        }
    });

    // 5. 拼装 SVG
    const svgContent = `
    <svg width="640" height="320" xmlns="http://www.w3.org/2000/svg">
        <style>
            .text { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
            .title { font-weight: bold; font-size: 18px; fill: #c9d1d9; }
            .subtitle { font-size: 12px; fill: #8b949e; }
            .label { font-size: 10px; fill: #8b949e; }
            .axis { stroke: #30363d; stroke-width: 1; }
            .stat { font-size: 10px; font-weight: bold; }
            .add { fill: #3fb950; }
            .del { fill: #f85149; }
        </style>
        <rect width="100%" height="100%" fill="#0d1117" rx="10" stroke="#30363d" stroke-width="2"/>
        
        <text x="25" y="40" class="text title">🚀 每日代码工作量 (Daily Workload)</text>
        <text x="25" y="60" class="text subtitle">最近 14 天的实际代码增删行数</text>
        
        <line x1="25" y1="${centerY}" x2="615" y2="${centerY}" class="axis" stroke-dasharray="4" />
        
        ${barsSvg}
    </svg>`;

    fs.writeFileSync('workload-chart.svg', svgContent);
    console.log("🎉 每日柱状图已生成: workload-chart.svg");
}

generateDailySVG();
