import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const outputDir = path.join(root, 'docs/ops/pinterest-assets/batch-1');
const v2OutputDir = path.join(root, 'docs/ops/pinterest-assets/batch-1-v2');
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
mkdirSync(v2OutputDir, { recursive: true });

const logoData = readFileSync(logoPath).toString('base64');
const logoHref = `data:image/png;base64,${logoData}`;
const siteUrl = 'https://www.goose.gifts';

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
    guide: 'white-elephant-gifts',
    v2Title: ['WHITE ELEPHANT', 'GIFTS PEOPLE', 'FIGHT OVER'],
    v2Hook: 'weird, useful, steal-worthy',
    preferredProductPatterns: [
      /Socks With a Side/i,
      /Emergency Humor Box/i,
      /Coastin' Through Life/i,
      /Mystic Pickle/i,
      /Squirrel Hot Tub/i,
    ],
    skipFallbackProductPatterns: [
      /Fanny/i,
      /Belly/i,
      /Dad Bag/i,
      /Funny White Elephant Gifts for Men Women/i,
    ],
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
    guide: 'funny-gifts-for-coworkers',
    v2Title: ['COWORKER GIFTS', 'THAT WON’T GET', 'YOU FIRED'],
    v2Hook: 'office-safe, still funny',
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
    guide: 'weird-kitchen-gadgets',
    v2Title: ['KITCHEN GADGETS', 'THAT LOOK FAKE', 'BUT AREN’T'],
    v2Hook: 'giftable weirdness for cooks',
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
    guide: 'novelty-desk-toys',
    v2Title: ['DESK TOYS FOR', 'MEETINGS THAT', 'SHOULD’VE ENDED'],
    v2Hook: 'tiny distractions, big relief',
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
    guide: 'weird-home-decor-gifts',
    v2Title: ['HOME DECOR', 'THAT MAKES', 'PEOPLE STARE'],
    v2Hook: 'odd shelf pieces and room jokes',
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

function dataUri(bytes, contentType) {
  return `data:${contentType || 'image/jpeg'};base64,${Buffer.from(bytes).toString('base64')}`;
}

function decodeHtml(value) {
  return String(value)
    .replaceAll('&quot;', '"')
    .replaceAll('&#34;', '"')
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>');
}

async function fetchGuideProducts(slug) {
  const response = await fetch(`${siteUrl}/gift-guides/${slug}`);
  if (!response.ok) {
    throw new Error(`Failed to fetch guide ${slug}: ${response.status}`);
  }

  const html = await response.text();
  const jsonMatches = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
  const itemListScript = jsonMatches
    .map((match) => decodeHtml(match[1]))
    .find((text) => text.includes('"@type":"ItemList"'));

  if (!itemListScript) {
    throw new Error(`No ItemList JSON-LD found for ${slug}`);
  }

  const parsed = JSON.parse(itemListScript);
  const graph = Array.isArray(parsed['@graph']) ? parsed['@graph'] : [parsed];
  const itemList = graph.find((entry) => entry?.['@type'] === 'ItemList');

  if (!itemList) {
    throw new Error(`No ItemList object found for ${slug}`);
  }

  return (itemList.itemListElement || [])
    .map((entry) => entry.item)
    .filter((product) => product?.image && product?.name);
}

async function fetchImageDataUri(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch image ${url}: ${response.status}`);
  }

  const contentType = response.headers.get('content-type') || 'image/jpeg';
  const bytes = await response.arrayBuffer();
  return dataUri(bytes, contentType);
}

function productTiles(products) {
  const slots = [
    { x: 72, y: 628, w: 268, h: 268, r: -6 },
    { x: 366, y: 586, w: 268, h: 268, r: 5 },
    { x: 660, y: 638, w: 268, h: 268, r: -4 },
    { x: 166, y: 946, w: 268, h: 268, r: 4 },
    { x: 516, y: 938, w: 268, h: 268, r: -6 },
  ];

  if (products.length < slots.length) {
    throw new Error(`Expected ${slots.length} distinct product images, got ${products.length}`);
  }

  return slots
    .map((slot, index) => {
      const product = products[index];

      return `
        <g transform="rotate(${slot.r} ${slot.x + slot.w / 2} ${slot.y + slot.h / 2})">
          <rect x="${slot.x - 18}" y="${slot.y - 18}" width="${slot.w + 36}" height="${slot.h + 36}" rx="32" fill="#ffffff" stroke="#18181b" stroke-width="8"/>
          <clipPath id="clip-${index}">
            <rect x="${slot.x}" y="${slot.y}" width="${slot.w}" height="${slot.h}" rx="22"/>
          </clipPath>
          <rect x="${slot.x}" y="${slot.y}" width="${slot.w}" height="${slot.h}" rx="22" fill="#ffffff"/>
          <image href="${product.imageDataUri}" x="${slot.x}" y="${slot.y}" width="${slot.w}" height="${slot.h}" preserveAspectRatio="xMidYMid meet" clip-path="url(#clip-${index})"/>
        </g>`;
    })
    .join('');
}

function shortProductName(name) {
  return String(name)
    .replace(/\s*\|.*$/, '')
    .replace(/\s*[-–].*$/, '')
    .replace(/\bAmazon\.com:?\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 30);
}

function v2TitleSvg(lines) {
  return lines
    .map((line, index) => `<tspan x="70" dy="${index === 0 ? 0 : 74}">${xml(line)}</tspan>`)
    .join('');
}

function v2CardSvg(card, products) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="1500" viewBox="0 0 1000 1500">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${card.accent}"/>
      <stop offset="100%" stop-color="#18181b"/>
    </linearGradient>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="18" stdDeviation="14" flood-color="#000000" flood-opacity="0.30"/>
    </filter>
  </defs>

  <rect width="1000" height="1500" fill="url(#bg)"/>
  <path d="M-30 294 C188 132 418 426 632 224 C776 88 890 74 1030 136 L1030 0 L-30 0 Z" fill="${card.accent2}" opacity="0.28"/>
  <path d="M-30 1314 C220 1168 392 1412 622 1240 C782 1120 906 1118 1030 1198 L1030 1500 L-30 1500 Z" fill="#ffffff" opacity="0.12"/>

  <rect x="52" y="54" width="896" height="1368" rx="54" fill="#ffffff" opacity="0.96"/>
  <rect x="52" y="54" width="896" height="1368" rx="54" fill="none" stroke="#18181b" stroke-width="10"/>

  <image href="${logoHref}" x="72" y="86" width="104" height="104"/>
  <text x="190" y="137" font-family="Helvetica, Arial, sans-serif" font-size="34" font-weight="900" fill="#18181b">goose.gifts</text>
  <text x="190" y="178" font-family="Helvetica, Arial, sans-serif" font-size="24" font-weight="900" fill="${card.accent}">${xml(card.kicker)}</text>

  <text x="70" y="294" font-family="Helvetica, Arial, sans-serif" font-size="68" font-weight="900" fill="#18181b">${v2TitleSvg(card.v2Title)}</text>
  <rect x="70" y="500" width="860" height="72" rx="36" fill="#18181b"/>
  <text x="112" y="548" font-family="Helvetica, Arial, sans-serif" font-size="31" font-weight="900" fill="#ffffff">${xml(card.v2Hook)}</text>

  <g filter="url(#shadow)">
    ${productTiles(products)}
  </g>

  <rect x="70" y="1260" width="520" height="82" rx="41" fill="${card.accent}"/>
  <text x="116" y="1314" font-family="Helvetica, Arial, sans-serif" font-size="32" font-weight="900" fill="#ffffff">See the full list</text>
  <text x="70" y="1374" font-family="Helvetica, Arial, sans-serif" font-size="28" font-weight="900" fill="#18181b">${xml(card.board)}</text>
</svg>
`;
}

function selectProductsForCard(card, guideProducts) {
  const selected = [];
  const selectedNames = new Set();
  const selectedImages = new Set();

  const addProduct = (product) => {
    if (!product?.name || selectedNames.has(product.name)) return;
    if (!product?.image || selectedImages.has(product.image)) return;
    selected.push(product);
    selectedNames.add(product.name);
    selectedImages.add(product.image);
  };

  if (card.preferredProductPatterns) {
    for (const pattern of card.preferredProductPatterns) {
      addProduct(guideProducts.find((product) => pattern.test(product.name)));
    }
  }

  for (const product of guideProducts) {
    if (selected.length >= 5) break;
    if (card.skipFallbackProductPatterns?.some((pattern) => pattern.test(product.name))) continue;
    addProduct(product);
  }

  return selected.slice(0, 5);
}

async function generateV2Assets() {
  const pngFiles = [];

  for (const card of cards) {
    const guideProducts = await fetchGuideProducts(card.guide);
    const selectedProducts = selectProductsForCard(card, guideProducts);
    const productsWithImages = [];

    for (const product of selectedProducts.slice(0, 5)) {
      try {
        productsWithImages.push({
          name: product.name,
          shortName: shortProductName(product.name),
          imageDataUri: await fetchImageDataUri(product.image),
        });
      } catch (error) {
        console.warn(`Skipping image for ${product.name}: ${error.message}`);
      }
    }

    if (productsWithImages.length < 5) {
      throw new Error(`Not enough distinct product images for ${card.guide}`);
    }

    const svgPath = path.join(v2OutputDir, `${card.file}.svg`);
    const pngPath = path.join(v2OutputDir, `${card.file}.png`);
    writeFileSync(svgPath, v2CardSvg(card, productsWithImages));
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
      path.join(v2OutputDir, 'batch-1-v2-contact-sheet.png'),
    ],
    { stdio: 'inherit' },
  );

  console.log(`Generated ${cards.length} v2 Pinterest assets in ${v2OutputDir}`);
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

await generateV2Assets();
