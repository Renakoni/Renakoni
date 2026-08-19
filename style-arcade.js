const fs = require('fs');
const path = require('path');

const [theme, inputPath, outputPath] = process.argv.slice(2);

if (!['light', 'dark'].includes(theme) || !inputPath || !outputPath) {
    console.error('Usage: node style-arcade.js <light|dark> <input.svg> <output.svg>');
    process.exit(1);
}

const palettes = {
    light: {
        shell: '#e8e5ef',
        shellLine: '#bbb5ca',
        shellInk: '#302d3b',
        muted: '#706a7e',
        screen: '#dfe8dd',
        screenLine: '#aab8a7',
        empty: '#cbd6c8',
        low: '#8fc8b0',
        mid: '#56a795',
        high: '#286f73',
        paddle: '#d96850',
        ball: '#d3a63e',
        control: '#7769ad',
    },
    dark: {
        shell: '#191923',
        shellLine: '#3b3949',
        shellInk: '#f0edf3',
        muted: '#aaa5ba',
        screen: '#20242e',
        screenLine: '#4a4f60',
        empty: '#2c3240',
        low: '#355c61',
        mid: '#4c8b86',
        high: '#8bd4b7',
        paddle: '#ff8d72',
        ball: '#f2cb68',
        control: '#9a89dc',
    },
};

const colors = palettes[theme];

const timing = {
    roundStart: 900,
    dropPause: 1000,
    serve: 300,
    paddleReturn: 350,
    paddleBlend: 600,
    roundEnd: 900,
};

const toNumber = (value) => Number.parseFloat(value);
const formatNumber = (value) => Number(value.toFixed(6)).toString();
const easeOutQuart = (value) => 1 - (1 - value) ** 4;

const readAnimation = (element, tagName = 'animateTransform') => {
    const tag = element.match(new RegExp(`<${tagName}\\b[\\s\\S]*?\\/>`))?.[0];
    if (!tag) return null;

    const duration = toNumber(tag.match(/\bdur="([0-9.]+)ms"/)?.[1]);
    const keyTimes = tag.match(/\bkeyTimes="([^"]+)"/)?.[1].split(';').map(toNumber);
    const values = tag.match(/\bvalues="([^"]+)"/)?.[1].split(';');
    if (!duration || !keyTimes || !values || keyTimes.length !== values.length) return null;

    return { tag, duration, keyTimes, values };
};

const setAttribute = (tag, name, value) => tag.replace(new RegExp(`\\b${name}="[^"]*"`), `${name}="${value}"`);

const normalizePoints = (points) => {
    const sorted = points
        .filter((point) => Number.isFinite(point.time))
        .sort((a, b) => a.time - b.time || (a.priority ?? 0) - (b.priority ?? 0));
    const result = [];

    for (const point of sorted) {
        const previous = result.at(-1);
        if (previous && Math.abs(previous.time - point.time) < 0.001) {
            result[result.length - 1] = point;
        } else {
            result.push(point);
        }
    }
    return result;
};

const writeAnimation = (animation, points, duration) => {
    const normalized = normalizePoints(points);
    let tag = setAttribute(animation.tag, 'dur', `${duration}ms`);
    tag = setAttribute(tag, 'keyTimes', normalized.map((point) => formatNumber(point.time / duration)).join(';'));
    return setAttribute(tag, 'values', normalized.map((point) => point.value).join(';'));
};

// Stretch every SMIL timeline at ball resets so bricks freeze while the next serve is staged.
const addRoundPauses = (svg) => {
    const ballElement = svg.match(/<circle[^>]*\bid="ball"[^>]*>[\s\S]*?<\/circle>/)?.[0];
    const paddleElement = svg.match(/<rect[^>]*\bid="paddle"[^>]*>[\s\S]*?<\/rect>/)?.[0];
    if (!ballElement || !paddleElement) return svg;

    const ballAnimation = readAnimation(ballElement);
    const paddleAnimation = readAnimation(paddleElement);
    if (!ballAnimation || !paddleAnimation || ballAnimation.duration !== paddleAnimation.duration) return svg;

    const ballPoints = ballAnimation.values.map((value, index) => {
        const [x, y] = value.split(',').map(toNumber);
        return { time: ballAnimation.keyTimes[index] * ballAnimation.duration, value, x, y };
    });
    const paddleY = toNumber(paddleElement.match(/\by="([0-9.]+)"/)?.[1]);
    const ballRadius = toNumber(ballElement.match(/\br="([0-9.]+)"/)?.[1]);
    const paddleWidth = toNumber(paddleElement.match(/\bwidth="([0-9.]+)"/)?.[1]);
    if (![paddleY, ballRadius, paddleWidth].every(Number.isFinite)) return svg;

    const drops = [];
    for (let index = 1; index < ballPoints.length; index++) {
        const previous = ballPoints[index - 1];
        const current = ballPoints[index];
        const distance = Math.hypot(current.x - previous.x, current.y - previous.y);
        if (distance > 60 && previous.y > paddleY + ballRadius && current.y < paddleY - 20) {
            drops.push({ resetTime: current.time, previousTime: previous.time });
        }
    }

    const originalDuration = ballAnimation.duration;
    const duration = timing.roundStart + originalDuration + drops.length * timing.dropPause + timing.roundEnd;
    const centerX = 1166 / 2;
    const paddleCenterX = (1166 - paddleWidth) / 2;
    const servePosition = `${formatNumber(centerX)},${formatNumber(paddleY - ballRadius - 2)}`;
    const warp = (time) =>
        timing.roundStart + time + drops.filter((drop) => drop.resetTime <= time + 0.001).length * timing.dropPause;
    const playEnd = warp(originalDuration);

    const ballTimeline = ballPoints.map((point) => ({ time: warp(point.time), value: point.value }));
    ballTimeline.push({ time: 0, value: servePosition, priority: 1 });
    ballTimeline.push({ time: timing.roundStart - timing.serve, value: servePosition, priority: 1 });
    for (const drop of drops) {
        ballTimeline.push({ time: warp(drop.resetTime) - timing.serve, value: servePosition, priority: 1 });
    }
    ballTimeline.push({ time: duration, value: ballPoints.at(-1).value, priority: 1 });

    const opacityTimeline = [
        { time: 0, value: '0' },
        { time: timing.roundStart - timing.serve, value: '1' },
    ];
    for (const drop of drops) {
        opacityTimeline.push({ time: warp(drop.previousTime), value: '0' });
        opacityTimeline.push({ time: warp(drop.resetTime) - timing.serve, value: '1' });
    }
    opacityTimeline.push({ time: playEnd, value: '0' });
    opacityTimeline.push({ time: duration, value: '0' });

    const ballTransform = writeAnimation(ballAnimation, ballTimeline, duration);
    const normalizedOpacity = normalizePoints(opacityTimeline);
    const ballOpacity = `<animate attributeName="opacity" calcMode="discrete" dur="${duration}ms" repeatCount="indefinite"
            keyTimes="${normalizedOpacity.map((point) => formatNumber(point.time / duration)).join(';')}"
            values="${normalizedOpacity.map((point) => point.value).join(';')}"/>`;
    const updatedBall = ballElement.replace(ballAnimation.tag, `${ballOpacity}\n\t\t${ballTransform}`);

    const originalPaddlePoints = paddleAnimation.values.map((value, index) => ({
        time: paddleAnimation.keyTimes[index] * originalDuration,
        x: toNumber(value.split(',')[0]),
    }));
    const paddleXAt = (time) => {
        const nextIndex = originalPaddlePoints.findIndex((point) => point.time >= time);
        if (nextIndex <= 0) return originalPaddlePoints[Math.max(nextIndex, 0)].x;
        if (nextIndex === -1) return originalPaddlePoints.at(-1).x;
        const previous = originalPaddlePoints[nextIndex - 1];
        const next = originalPaddlePoints[nextIndex];
        const progress = (time - previous.time) / Math.max(next.time - previous.time, 1);
        return previous.x + (next.x - previous.x) * progress;
    };
    const blendPaddleX = (time, x) => {
        const drop = [...drops].reverse().find((candidate) => candidate.resetTime <= time);
        if (!drop || time >= drop.resetTime + timing.paddleBlend) return x;
        const progress = (time - drop.resetTime) / timing.paddleBlend;
        return paddleCenterX + (x - paddleCenterX) * easeOutQuart(progress);
    };

    const paddleTimeline = originalPaddlePoints.map((point) => ({
        time: warp(point.time),
        value: `${formatNumber(blendPaddleX(point.time, point.x))},0`,
    }));
    paddleTimeline.push({ time: 0, value: `${formatNumber(paddleCenterX)},0`, priority: 1 });
    paddleTimeline.push({ time: timing.roundStart - timing.serve, value: `${formatNumber(paddleCenterX)},0`, priority: 1 });

    for (const drop of drops) {
        const returnStart = warp(drop.previousTime);
        const startX = paddleXAt(drop.previousTime);
        for (const progress of [0, 0.35, 0.65, 1]) {
            const eased = easeOutQuart(progress);
            const x = startX + (paddleCenterX - startX) * eased;
            paddleTimeline.push({
                time: returnStart + timing.paddleReturn * progress,
                value: `${formatNumber(x)},0`,
                priority: 1,
            });
        }
        paddleTimeline.push({
            time: warp(drop.resetTime) - timing.serve,
            value: `${formatNumber(paddleCenterX)},0`,
            priority: 1,
        });
        paddleTimeline.push({
            time: warp(drop.resetTime),
            value: `${formatNumber(paddleCenterX)},0`,
            priority: 1,
        });
        const blendEnd = Math.min(drop.resetTime + timing.paddleBlend, originalDuration);
        paddleTimeline.push({
            time: warp(blendEnd),
            value: `${formatNumber(paddleXAt(blendEnd))},0`,
            priority: 1,
        });
    }

    const finalPaddleX = paddleXAt(originalDuration);
    for (const progress of [0, 0.35, 0.65, 1]) {
        const eased = easeOutQuart(progress);
        const x = finalPaddleX + (paddleCenterX - finalPaddleX) * eased;
        paddleTimeline.push({
            time: playEnd + timing.paddleReturn * progress,
            value: `${formatNumber(x)},0`,
            priority: 1,
        });
    }
    paddleTimeline.push({ time: duration, value: `${formatNumber(paddleCenterX)},0`, priority: 1 });

    const paddleTransform = writeAnimation(paddleAnimation, paddleTimeline, duration);
    const updatedPaddle = paddleElement.replace(paddleAnimation.tag, paddleTransform);

    const ballPlaceholder = '__ARCADE_BALL__';
    const paddlePlaceholder = '__ARCADE_PADDLE__';
    let updated = svg.replace(ballElement, ballPlaceholder).replace(paddleElement, paddlePlaceholder);
    updated = updated.replace(/<animate\b[\s\S]*?\/>/g, (tag) => {
        const animation = readAnimation(tag, 'animate');
        if (!animation || animation.duration !== originalDuration) return tag;
        const points = animation.keyTimes.map((keyTime, index) => ({
            time: warp(keyTime * originalDuration),
            value: animation.values[index],
        }));
        points.push({ time: 0, value: animation.values[0], priority: 1 });
        points.push({ time: duration, value: animation.values.at(-1), priority: 1 });
        return writeAnimation(animation, points, duration);
    });

    console.log(`Segmented breakout into ${drops.length + 1} serves with ${drops.length} ball drops`);
    return updated.replace(ballPlaceholder, updatedBall).replace(paddlePlaceholder, updatedPaddle);
};

let game = fs.readFileSync(inputPath, 'utf8');

game = game
    .replace(/^<svg[^>]*>/, '')
    .replace(/<\/svg>\s*$/, '')
    .replace(/<desc>.*?<\/desc>/s, '')
    .replace(/<metadata>.*?<\/metadata>/s, '');

game = addRoundPauses(game);

game = game
    .replace(/<rect width="100%" height="100%" fill="#[0-9a-fA-F]{6}"\/>/, `<rect width="1166" height="209" fill="${colors.screen}"/>`)
    .replaceAll('#57606a', colors.muted)
    .replaceAll('#8b949e', colors.muted)
    .replaceAll('#ebedf0', colors.empty)
    .replaceAll('#161b22', colors.empty)
    .replaceAll('#9be9a8', colors.low)
    .replaceAll('#0e4429', colors.low)
    .replaceAll('#40c463', colors.mid)
    .replaceAll('#30a14e', colors.mid)
    .replaceAll('#39d353', colors.high)
    .replaceAll('#216e39', colors.high)
    .replaceAll('#000000', colors.paddle)
    .replaceAll('#ffffff', colors.ball)
    .replaceAll('#0d1117', colors.screen)
    .replaceAll('#aaaaaa', colors.ball)
    .replace('<rect id="paddle"', '<rect class="paddle" id="paddle"')
    .replace('<circle id="ball"', '<circle class="ball" id="ball"')
    .replaceAll('<text ', '<text class="game-label" ');

const svg = `<svg width="1166" height="326" viewBox="0 0 1166 326" xmlns="http://www.w3.org/2000/svg" role="img" aria-labelledby="title desc">
  <title id="title">Renakoni contribution breakout</title>
  <desc id="desc">An animated breakout game built from Renakoni's GitHub contribution grid.</desc>
  <defs>
    <clipPath id="screen-clip">
      <rect x="24" y="62" width="1118" height="201" rx="11"/>
    </clipPath>
    <pattern id="shell-grid" width="16" height="16" patternUnits="userSpaceOnUse">
      <path d="M16 0H0V16" fill="none" stroke="${colors.shellLine}" stroke-width="0.6" opacity="0.18"/>
    </pattern>
    <filter id="soft-glow" x="-100%" y="-100%" width="300%" height="300%">
      <feGaussianBlur stdDeviation="3" result="blur"/>
      <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>
  <style>
    text { letter-spacing: 0; }
    .ui { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    .mono, .game-label { font-family: ui-monospace, SFMono-Regular, Consolas, monospace; }
    .game-label { font-weight: 600; }
    .ball { fill: ${colors.ball}; filter: url(#soft-glow); }
    .paddle { fill: ${colors.paddle}; filter: url(#soft-glow); }
    .scan { animation: scan 5s linear infinite; }
    @keyframes scan { from { transform: translateY(0); } to { transform: translateY(198px); } }
    @media (prefers-reduced-motion: reduce) {
      .scan { animation: none; opacity: 0; }
      .ball, .paddle { display: none; filter: none; }
      animate, animateTransform { display: none; }
    }
  </style>

  <rect x="1" y="1" width="1164" height="324" rx="19" fill="${colors.shell}" stroke="${colors.shellLine}" stroke-width="2"/>
  <rect x="1" y="1" width="1164" height="324" rx="19" fill="url(#shell-grid)"/>

  <rect x="24" y="18" width="8" height="8" rx="2" fill="${colors.paddle}"/>
  <text x="44" y="29" class="ui" font-size="15" font-weight="750" fill="${colors.shellInk}">RENAKONI</text>
  <text x="148" y="29" class="mono" font-size="11" font-weight="650" fill="${colors.muted}">AFTER CLASS LAB</text>
  <text x="1142" y="29" text-anchor="end" class="mono" font-size="11" font-weight="650" fill="${colors.muted}">PLAYER 01 / AUTOSAVE ON</text>

  <g clip-path="url(#screen-clip)">
    <g transform="translate(24 62) scale(0.95883)">${game}</g>
    <rect class="scan" x="24" y="62" width="1118" height="2" fill="${colors.ball}" opacity="0.12"/>
  </g>
  <rect x="24" y="62" width="1118" height="201" rx="11" fill="none" stroke="${colors.screenLine}" stroke-width="2"/>
  <path d="M36 251h1094" stroke="${colors.screenLine}" stroke-width="1" opacity="0.35"/>

  <g transform="translate(35 279)" fill="${colors.control}">
    <rect x="13" y="0" width="13" height="39" rx="3"/>
    <rect x="0" y="13" width="39" height="13" rx="3"/>
    <rect x="16" y="16" width="7" height="7" rx="2" fill="${colors.shell}" opacity="0.55"/>
  </g>
  <text x="90" y="294" class="mono" font-size="10" font-weight="650" fill="${colors.muted}">MOVE</text>
  <text x="90" y="309" class="mono" font-size="10" font-weight="650" fill="${colors.muted}">BUILD</text>

  <text x="583" y="295" text-anchor="middle" class="mono" font-size="11" font-weight="650" fill="${colors.muted}">CONTRIBUTION BREAKOUT / 52 WEEK LOOP</text>
  <path d="M477 307h212" stroke="${colors.shellLine}" stroke-width="2" stroke-linecap="round"/>

  <g transform="translate(1054 288)">
    <circle cx="0" cy="0" r="12" fill="${colors.paddle}"/>
    <circle cx="42" cy="0" r="12" fill="${colors.ball}"/>
    <text x="0" y="4" text-anchor="middle" class="mono" font-size="9" font-weight="800" fill="${colors.shell}">A</text>
    <text x="42" y="4" text-anchor="middle" class="mono" font-size="9" font-weight="800" fill="${colors.shell}">B</text>
  </g>
</svg>`;

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, svg);
console.log(`Styled ${theme} arcade SVG: ${outputPath}`);
