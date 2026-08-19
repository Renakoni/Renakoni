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
let game = fs.readFileSync(inputPath, 'utf8');

game = game
    .replace(/^<svg[^>]*>/, '')
    .replace(/<\/svg>\s*$/, '')
    .replace(/<desc>.*?<\/desc>/s, '')
    .replace(/<metadata>.*?<\/metadata>/s, '')
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
      .ball, .paddle { filter: none; }
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
