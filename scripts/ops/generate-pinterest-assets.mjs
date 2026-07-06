import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const outputDir = path.join(root, 'docs/ops/pinterest-assets/batch-1');
const logoPath = path.join(root, 'public/sillygoose.png');
const rsvg = '/opt/homebrew/bin/rsvg-convert';
const magick = '/opt/homebrew/bin/magick';

if (!existsSync(logoPath)) {
  throw new Error(`Missing logo: ${logoPath}`);
}

if (!existsSync(rsvg)) {
  throw new Error(`Missing rsvg-convert: ${rsvg}`);
}

if (!existsSync(magick)) {
  throw new Error(`Missing ImageMagick: ${magick}`);
}

mkdirSync(outputDir, { recursive: true });

const logoData = readFileSync(logoPath).toString('base64');
const logoHref = `data:image/png;base64,${logoData}`;

const cards = [
  {
    file: '01-white-elephant-gifts',
    kicker: 'Gift Exchange Guide',
    title: ['Funny White', 'Elephant Gifts'],
    hook: 'weird picks people actually steal',
    board: 'Funny White Elephant Gifts',
    accent: '#dc2626',
    accent2: '#f59e0b',
    soft: '#fff7ed',
    icon: 'gift',
  },
  {
    file: '02-funny-gifts-for-coworkers',
    kicker: 'Office-Safe Finds',
    title: ['Funny Gifts', 'for Coworkers'],
    hook: 'office-safe picks for bad meetings',
    board: 'Funny Gifts for Coworkers',
    accent: '#0f766e',
    accent2: '#f97316',
    soft: '#ecfeff',
    icon: 'desk',
  },
  {
    file: '03-weird-kitchen-gadgets',
    kicker: 'Kitchen Gift Guide',
    title: ['Weird Kitchen', 'Gadgets'],
    hook: 'useful once, funny forever',
    board: 'Weird Kitchen Gadgets',
    accent: '#b91c1c',
    accent2: '#eab308',
    soft: '#fefce8',
    icon: 'mug',
  },
  {
    file: '04-novelty-desk-toys',
    kicker: 'Workspace Distractions',
    title: ['Novelty', 'Desk Toys'],
    hook: 'for bored hands and bad meetings',
    board: 'Novelty Desk Toys',
    accent: '#2563eb',
    accent2: '#f97316',
    soft: '#eff6ff',
    icon: 'spark',
  },
  {
    file: '05-weird-home-decor',
    kicker: 'Home Gift Guide',
    title: ['Weird Home', 'Decor Gifts'],
    hook: 'for rooms that need a double take',
    board: 'Weird Home Decor',
    accent: '#7c3aed',
    accent2: '#16a34a',
    soft: '#f5f3ff',
    icon: 'home',
  },
];

function xml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function titleSvg(lines) {
  return lines
    .map((line, index) => `<tspan x="86" dy="${index === 0 ? 0 : 108}">${xml(line)}</tspan>`)
    .join('');
}

function iconSvg(type, accent, accent2) {
  if (type === 'gift') {
    return `
      <g transform="translate(635 972)" fill="none" stroke="${accent}" stroke-width="16" stroke-linecap="round" stroke-linejoin="round">
        <rect x="16" y="74" width="248" height="180" rx="22" fill="#ffffff"/>
        <path d="M140 74v180M16 126h248"/>
        <path d="M140 74c-70-78-148-42-104 18 28 38 75 18 104-18Z" fill="${accent2}" opacity="0.92"/>
        <path d="M140 74c70-78 148-42 104 18-28 38-75 18-104-18Z" fill="${accent2}" opacity="0.92"/>
      </g>`;
  }

  if (type === 'desk') {
    return `
      <g transform="translate(635 988)" fill="none" stroke="${accent}" stroke-width="16" stroke-linecap="round" stroke-linejoin="round">
        <rect x="28" y="36" width="234" height="144" rx="24" fill="#ffffff"/>
        <path d="M70 216h150M100 180v36M190 180v36"/>
        <circle cx="92" cy="108" r="18" fill="${accent2}" stroke="none"/>
        <path d="M132 108h78"/>
      </g>`;
  }

  if (type === 'mug') {
    return `
      <g transform="translate(650 975)" fill="none" stroke="${accent}" stroke-width="16" stroke-linecap="round" stroke-linejoin="round">
        <path d="M38 76h178v132a50 50 0 0 1-50 50H88a50 50 0 0 1-50-50Z" fill="#ffffff"/>
        <path d="M216 118h34a42 42 0 0 1 0 84h-34"/>
        <path d="M84 34c-20-26 20-36 0-62M138 34c-20-26 20-36 0-62" stroke="${accent2}"/>
      </g>`;
  }

  if (type === 'spark') {
    return `
      <g transform="translate(660 968)" fill="none" stroke="${accent}" stroke-width="16" stroke-linecap="round" stroke-linejoin="round">
        <path d="M128 16l28 78 78 28-78 28-28 78-28-78-78-28 78-28Z" fill="#ffffff"/>
        <circle cx="242" cy="54" r="18" fill="${accent2}" stroke="none"/>
        <circle cx="54" cy="218" r="14" fill="${accent2}" stroke="none"/>
      </g>`;
  }

  return `
    <g transform="translate(642 982)" fill="none" stroke="${accent}" stroke-width="16" stroke-linecap="round" stroke-linejoin="round">
      <path d="M34 128 146 38l112 90v138H66V128Z" fill="#ffffff"/>
      <path d="M112 266v-82h68v82"/>
      <path d="M56 112v-58h52v18" stroke="${accent2}"/>
    </g>`;
}

function cardSvg(card) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="1500" viewBox="0 0 1000 1500">
  <rect width="1000" height="1500" fill="${card.soft}"/>
  <rect x="0" y="0" width="1000" height="34" fill="${card.accent}"/>
  <circle cx="910" cy="132" r="180" fill="${card.accent2}" opacity="0.16"/>
  <circle cx="88" cy="1356" r="210" fill="${card.accent}" opacity="0.11"/>
  <path d="M0 1230 C220 1124 338 1284 546 1188 C720 1108 812 1034 1000 1116 L1000 1500 L0 1500 Z" fill="#ffffff" opacity="0.78"/>

  <image href="${logoHref}" x="66" y="72" width="150" height="150"/>
  <text x="236" y="135" font-family="Helvetica, Arial, sans-serif" font-size="42" font-weight="700" fill="#18181b">goose.gifts</text>
  <text x="236" y="182" font-family="Helvetica, Arial, sans-serif" font-size="24" font-weight="700" fill="${card.accent}">${xml(card.kicker)}</text>

  <text x="86" y="398" font-family="Helvetica, Arial, sans-serif" font-size="95" font-weight="800" fill="#18181b">${titleSvg(card.title)}</text>

  <rect x="86" y="690" width="828" height="184" rx="34" fill="#18181b"/>
  <text x="136" y="772" font-family="Helvetica, Arial, sans-serif" font-size="40" font-weight="800" fill="#ffffff">"${xml(card.hook)}"</text>
  <text x="136" y="826" font-family="Helvetica, Arial, sans-serif" font-size="26" font-weight="700" fill="${card.accent2}">A goose.gifts guide</text>

  ${iconSvg(card.icon, card.accent, card.accent2)}

  <rect x="86" y="1010" width="410" height="72" rx="36" fill="${card.accent}"/>
  <text x="132" y="1058" font-family="Helvetica, Arial, sans-serif" font-size="28" font-weight="800" fill="#ffffff">Browse the guide</text>

  <text x="86" y="1318" font-family="Helvetica, Arial, sans-serif" font-size="26" font-weight="700" fill="#52525b">${xml(card.board)}</text>
  <text x="86" y="1362" font-family="Helvetica, Arial, sans-serif" font-size="24" font-weight="700" fill="#18181b">goose.gifts</text>
  <rect x="86" y="1392" width="828" height="4" rx="2" fill="${card.accent}"/>
</svg>
`;
}

const pngFiles = [];

for (const card of cards) {
  const svgPath = path.join(outputDir, `${card.file}.svg`);
  const pngPath = path.join(outputDir, `${card.file}.png`);
  writeFileSync(svgPath, cardSvg(card));
  execFileSync(rsvg, ['-w', '1000', '-h', '1500', '-o', pngPath, svgPath], { stdio: 'inherit' });
  pngFiles.push(pngPath);
}

execFileSync(
  magick,
  [
    'montage',
    ...pngFiles,
    '-thumbnail',
    '260x390',
    '-geometry',
    '+18+18',
    '-background',
    '#ffffff',
    '-tile',
    '5x1',
    path.join(outputDir, 'batch-1-contact-sheet.png'),
  ],
  { stdio: 'inherit' },
);

console.log(`Generated ${cards.length} Pinterest assets in ${outputDir}`);
