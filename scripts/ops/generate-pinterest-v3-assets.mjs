#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const outputDir = path.join(root, 'docs/ops/pinterest-assets/batch-1-v3');
const logoPath = path.join(root, 'public/sillygoose.png');
const rsvg = '/opt/homebrew/bin/rsvg-convert';
const magick = '/opt/homebrew/bin/magick';
const siteUrl = 'https://www.goose.gifts';

if (!existsSync(logoPath)) throw new Error(`Missing logo: ${logoPath}`);
if (!existsSync(rsvg)) throw new Error(`Missing rsvg-convert: ${rsvg}`);
if (!existsSync(magick)) throw new Error(`Missing ImageMagick: ${magick}`);

mkdirSync(outputDir, { recursive: true });

const logoHref = `data:image/png;base64,${readFileSync(logoPath).toString('base64')}`;

const boardIds = {
  'Funny White Elephant Gifts': '1107815277030422220',
  'Funny Gifts for Coworkers': '1107815277030422223',
  'Weird Kitchen Gadgets': '1107815277030422224',
  'Novelty Desk Toys': '1107815277030422225',
  'Weird Home Decor': '1107815277030422226',
};

const cards = [
  {
    file: '01-white-elephant-gifts',
    guide: 'white-elephant-gifts',
    board: 'Funny White Elephant Gifts',
    eyebrow: 'white elephant field note',
    headline: ['THIS IS HOW', 'THE GIFT EXCHANGE', 'GETS LOUD'],
    annotation: 'steal-worthy weirdness',
    bg: '#f8f0df',
    ink: '#171717',
    accent: '#df342c',
    accent2: '#00a6a6',
    accent3: '#f4c542',
    heroZoom: 1,
    heroPattern: /Socks With a Side/i,
    supportPatterns: [/Socks With a Side/i, /Coaster/i, /Mystic Pickle/i, /Squirrel Hot Tub/i],
    skipPatterns: [/Fanny/i, /Belly/i, /Dad Bod/i],
    title: 'White Elephant Gifts That Make the Room Pay Attention',
    description: 'A sharper goose.gifts edit of funny white elephant gifts: oddball picks, party steals, and gift exchange ideas people actually remember.',
    altText: 'Pinterest-style collage of funny white elephant gift ideas from goose.gifts with product photos and a bold editorial headline.',
  },
  {
    file: '02-funny-gifts-for-coworkers',
    guide: 'funny-gifts-for-coworkers',
    board: 'Funny Gifts for Coworkers',
    eyebrow: 'office-safe field note',
    headline: ['FOR THE MEETING', 'THAT SHOULD HAVE', 'BEEN AN EMAIL'],
    annotation: 'desk-safe, still unhinged',
    bg: '#e9f5ef',
    ink: '#121615',
    accent: '#087f6f',
    accent2: '#ff4f70',
    accent3: '#f6cf4a',
    heroZoom: 1.72,
    heroPattern: /Screaming Goat/i,
    supportPatterns: [/Putting Around/i, /Stress Cube/i, /HR Approved/i, /Pens with Puns/i],
    title: 'Funny Coworker Gifts for Meetings That Should Have Been Emails',
    description: 'Office-safe funny gifts for coworkers, from tiny desk distractions to meeting jokes that feel more memorable than another mug.',
    altText: 'Funny coworker gift collage from goose.gifts featuring playful office products and a bold meeting joke headline.',
  },
  {
    file: '03-weird-kitchen-gadgets',
    guide: 'weird-kitchen-gadgets',
    board: 'Weird Kitchen Gadgets',
    eyebrow: 'kitchen counter field note',
    headline: ['KITCHEN GIFTS', 'THAT LOOK FAKE', "BUT AREN'T"],
    annotation: 'useful once, funny forever',
    bg: '#fff0e2',
    ink: '#18130f',
    accent: '#cc2f22',
    accent2: '#119c8d',
    accent3: '#ffd15c',
    heroZoom: 1.08,
    heroPattern: /Alligator Oven Mitt/i,
    supportPatterns: [/Alligator/i, /Crab Spoon Holder/i, /Avo-Cat/i, /Ramen Noodle/i],
    title: 'Weird Kitchen Gadgets That Look Fake but Are Real',
    description: 'Funny kitchen gadget gifts with real visual punch: odd utensils, chaotic counter helpers, and cooking gifts that start conversations.',
    altText: 'Weird kitchen gadget gift collage from goose.gifts with bold text and product photos of unusual cooking tools.',
  },
  {
    file: '04-novelty-desk-toys',
    guide: 'novelty-desk-toys',
    board: 'Novelty Desk Toys',
    eyebrow: 'desk object field note',
    headline: ['BUSY-LOOKING', 'NOTHING FOR', 'YOUR DESK'],
    annotation: 'tiny distractions, premium nonsense',
    bg: '#edf2ff',
    ink: '#101522',
    accent: '#2457d6',
    accent2: '#ff7a30',
    accent3: '#d5ef4a',
    heroZoom: 1,
    heroPattern: /Hype Button|Desktop Therapist|Kinetic Desk Toy/i,
    supportPatterns: [/Putting Around/i, /Stress Cube/i, /Gravity Bird/i, /Bowling at Your Desk/i],
    title: 'Novelty Desk Toys for Busy-Looking Nothing',
    description: 'Funny desk toys and office distractions for bored hands, bad calls, home offices, and people who need a better tiny object nearby.',
    altText: 'Novelty desk toy collage from goose.gifts with funny office gift products and bold editorial typography.',
  },
  {
    file: '05-weird-home-decor',
    guide: 'weird-home-decor-gifts',
    board: 'Weird Home Decor',
    eyebrow: 'home decor field note',
    headline: ['YOUR LIVING ROOM', 'JUST GOT A', 'PLOT TWIST'],
    annotation: 'decor with a second take',
    bg: '#f4f5ed',
    ink: '#171717',
    accent: '#34403a',
    accent2: '#f06f3d',
    accent3: '#54b88b',
    heroZoom: 1.16,
    heroPattern: /Big Eye/i,
    supportPatterns: [/Optical Illusion/i, /Skull/i, /Funny Face Sun/i, /Donut Switch Plate/i],
    title: 'Weird Home Decor Gifts With a Plot Twist',
    description: 'Odd home decor gifts for people who want shelves, walls, and rooms with more personality than another beige thing.',
    altText: 'Weird home decor gift collage from goose.gifts with product photos and a bold living room plot twist headline.',
  },
];

function xml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function decodeHtml(value) {
  return String(value)
    .replaceAll('&quot;', '"')
    .replaceAll('&#34;', '"')
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>');
}

function dataUri(bytes, contentType) {
  return `data:${contentType || 'image/jpeg'};base64,${Buffer.from(bytes).toString('base64')}`;
}

async function fetchGuideProducts(slug) {
  const response = await fetch(`${siteUrl}/gift-guides/${slug}`);
  if (!response.ok) throw new Error(`Failed to fetch guide ${slug}: ${response.status}`);

  const html = await response.text();
  const itemListScript = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
    .map((match) => decodeHtml(match[1]))
    .find((text) => text.includes('"@type":"ItemList"'));

  if (!itemListScript) throw new Error(`No ItemList JSON-LD found for ${slug}`);

  const parsed = JSON.parse(itemListScript);
  const graph = Array.isArray(parsed['@graph']) ? parsed['@graph'] : [parsed];
  const itemList = graph.find((entry) => entry?.['@type'] === 'ItemList');
  if (!itemList) throw new Error(`No ItemList object found for ${slug}`);

  return (itemList.itemListElement || [])
    .map((entry) => entry.item)
    .filter((product) => product?.image && product?.name);
}

async function fetchImageDataUri(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to fetch image ${url}: ${response.status}`);

  const contentType = response.headers.get('content-type') || 'image/jpeg';
  const bytes = await response.arrayBuffer();
  return dataUri(bytes, contentType);
}

function shortProductName(name) {
  return String(name)
    .replace(/\s*\|.*$/, '')
    .replace(/\s*[-–].*$/, '')
    .replace(/\bAmazon\.com:?\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 42);
}

function addProduct(selected, product) {
  if (!product?.name || !product?.image) return;
  if (selected.some((item) => item.name === product.name || item.image === product.image)) return;
  selected.push(product);
}

function findProduct(products, pattern, skipPatterns = []) {
  return products.find((product) => {
    if (!pattern.test(product.name)) return false;
    return !skipPatterns.some((skipPattern) => skipPattern.test(product.name));
  });
}

function selectProducts(card, products) {
  const selected = [];
  addProduct(selected, findProduct(products, card.heroPattern, card.skipPatterns || []));

  for (const pattern of card.supportPatterns) {
    addProduct(selected, findProduct(products, pattern, card.skipPatterns || []));
  }

  for (const product of products) {
    if (selected.length >= 4) break;
    if ((card.skipPatterns || []).some((pattern) => pattern.test(product.name))) continue;
    addProduct(selected, product);
  }

  if (selected.length < 4) {
    throw new Error(`Expected four distinct products for ${card.guide}, got ${selected.length}`);
  }

  return selected.slice(0, 4);
}

function textBlock(lines, { x, y, size, lineHeight, weight = 900, fill, anchor = 'start', family = 'Helvetica, Arial, sans-serif' }) {
  return `<text x="${x}" y="${y}" text-anchor="${anchor}" font-family="${family}" font-size="${size}" font-weight="${weight}" letter-spacing="0" fill="${fill}">${
    lines.map((line, index) => `<tspan x="${x}" dy="${index === 0 ? 0 : lineHeight}">${xml(line)}</tspan>`).join('')
  }</text>`;
}

function productFrame({ product, index, x, y, w, h, rotate, stroke, fill = '#ffffff', label, labelFill, imageScale = 1 }) {
  const clipId = `clip-${index}`;
  const centerX = x + w / 2;
  const centerY = y + h / 2;
  const labelText = label ? String(label) : '';
  const labelSvg = labelText
    ? `<text x="${x + 22}" y="${y + h + 42}" font-family="Helvetica, Arial, sans-serif" font-size="24" font-weight="900" letter-spacing="0" fill="${labelFill || '#171717'}">${xml(labelText)}</text>`
    : '';
  const imageInset = 12;
  const imageW = (w - imageInset * 2) * imageScale;
  const imageH = (h - imageInset * 2) * imageScale;
  const imageX = x + imageInset - (imageW - (w - imageInset * 2)) / 2;
  const imageY = y + imageInset - (imageH - (h - imageInset * 2)) / 2;

  return `
    <g transform="rotate(${rotate} ${centerX} ${centerY})">
      <rect x="${x - 18}" y="${y - 18}" width="${w + 36}" height="${labelText ? h + 92 : h + 36}" rx="34" fill="${fill}" stroke="${stroke}" stroke-width="7"/>
      <clipPath id="${clipId}">
        <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="24"/>
      </clipPath>
      <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="24" fill="#ffffff"/>
      <image href="${product.imageDataUri}" x="${imageX}" y="${imageY}" width="${imageW}" height="${imageH}" preserveAspectRatio="xMidYMid meet" clip-path="url(#${clipId})"/>
      ${labelSvg}
    </g>`;
}

function dots(accent, ink) {
  const parts = [];
  for (let y = 1040; y <= 1390; y += 38) {
    for (let x = 710; x <= 930; x += 38) {
      parts.push(`<circle cx="${x}" cy="${y}" r="4" fill="${(x + y) % 76 === 0 ? accent : ink}" opacity="${(x + y) % 76 === 0 ? '0.75' : '0.18'}"/>`);
    }
  }
  return parts.join('');
}

function cardSvg(card, products) {
  const [hero, supportA, supportB, supportC] = products;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="1500" viewBox="0 0 1000 1500">
  <defs>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="20" stdDeviation="18" flood-color="#000000" flood-opacity="0.24"/>
    </filter>
    <filter id="softShadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="10" stdDeviation="10" flood-color="#000000" flood-opacity="0.16"/>
    </filter>
  </defs>

  <rect width="1000" height="1500" fill="${card.bg}"/>
  <rect x="0" y="0" width="1000" height="42" fill="${card.accent}"/>
  <rect x="64" y="78" width="220" height="42" rx="21" fill="${card.ink}"/>
  <text x="92" y="107" font-family="Helvetica, Arial, sans-serif" font-size="18" font-weight="900" letter-spacing="0" fill="#ffffff">goose.gifts</text>
  <text x="312" y="107" font-family="Helvetica, Arial, sans-serif" font-size="22" font-weight="900" letter-spacing="0" fill="${card.accent}">${xml(card.eyebrow)}</text>
  <image href="${logoHref}" x="840" y="70" width="96" height="96" opacity="0.98"/>

  <path d="M64 203 H934" stroke="${card.ink}" stroke-width="3" stroke-linecap="round" opacity="0.20"/>
  ${textBlock(card.headline, { x: 64, y: 296, size: 74, lineHeight: 82, fill: card.ink })}

  <rect x="64" y="520" width="430" height="74" rx="37" fill="${card.accent3}" stroke="${card.ink}" stroke-width="5"/>
  <text x="92" y="568" font-family="Helvetica, Arial, sans-serif" font-size="29" font-weight="900" letter-spacing="0" fill="${card.ink}">${xml(card.annotation)}</text>

  <path d="M646 232 C754 182 860 242 888 350 C918 464 820 554 710 506 C606 460 548 278 646 232Z" fill="${card.accent2}" opacity="0.22"/>
  <path d="M44 1230 C178 1118 318 1252 468 1158 C602 1074 774 1082 956 1188 L956 1500 H44 Z" fill="#ffffff" opacity="0.38"/>
  ${dots(card.accent, card.ink)}

  <g filter="url(#shadow)">
    ${productFrame({ product: hero, index: 0, x: 120, y: 640, w: 606, h: 548, rotate: -2, stroke: card.ink, label: 'main character gift', labelFill: card.ink, imageScale: card.heroZoom })}
  </g>

  <g filter="url(#softShadow)">
    ${productFrame({ product: supportA, index: 1, x: 668, y: 522, w: 228, h: 216, rotate: 5, stroke: card.accent })}
    ${productFrame({ product: supportB, index: 2, x: 696, y: 802, w: 218, h: 208, rotate: -4, stroke: card.accent2 })}
    ${productFrame({ product: supportC, index: 3, x: 600, y: 1090, w: 246, h: 222, rotate: 4, stroke: card.accent3 })}
  </g>

  <rect x="64" y="1304" width="420" height="3" fill="${card.ink}" opacity="0.5"/>
  <text x="64" y="1362" font-family="Helvetica, Arial, sans-serif" font-size="31" font-weight="900" letter-spacing="0" fill="${card.ink}">${xml(card.board)}</text>
  <text x="64" y="1404" font-family="Helvetica, Arial, sans-serif" font-size="22" font-weight="800" letter-spacing="0" fill="${card.ink}" opacity="0.65">curated funny gifts at goose.gifts</text>
</svg>
`;
}

async function buildProductImages(card) {
  const guideProducts = await fetchGuideProducts(card.guide);
  const selectedProducts = selectProducts(card, guideProducts);
  const productsWithImages = [];

  for (const product of selectedProducts) {
    productsWithImages.push({
      name: product.name,
      shortName: shortProductName(product.name),
      image: product.image,
      imageDataUri: await fetchImageDataUri(product.image),
    });
  }

  return productsWithImages;
}

function trackingUrl(card) {
  const url = new URL(`/gift-guides/${card.guide}`, siteUrl);
  url.searchParams.set('utm_source', 'pinterest');
  url.searchParams.set('utm_medium', 'social');
  url.searchParams.set('utm_campaign', 'pinterest_api_trial_v3');
  url.searchParams.set('utm_content', card.file.replace(/^\d+-/, '').replaceAll('-', '_'));
  return url.toString();
}

const manifest = {
  batch: 'batch-1-v3',
  generatedAt: new Date().toISOString(),
  note: 'Editorial/product-joke Pinterest trial batch. Use Sandbox while the app is on Trial access.',
  assets: [],
};

const pngFiles = [];

for (const card of cards) {
  const products = await buildProductImages(card);
  const svgPath = path.join(outputDir, `${card.file}.svg`);
  const pngPath = path.join(outputDir, `${card.file}.png`);

  writeFileSync(svgPath, cardSvg(card, products));
  execFileSync(rsvg, ['-w', '1000', '-h', '1500', '-o', pngPath, svgPath], { stdio: 'inherit' });
  pngFiles.push(pngPath);

  manifest.assets.push({
    file: card.file,
    boardName: card.board,
    productionBoardId: boardIds[card.board],
    guide: card.guide,
    title: card.title,
    description: card.description,
    altText: card.altText,
    link: trackingUrl(card),
    imagePath: path.relative(root, pngPath),
    svgPath: path.relative(root, svgPath),
    products: products.map((product) => ({
      name: product.name,
      shortName: product.shortName,
      image: product.image,
    })),
  });
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
    path.join(outputDir, 'batch-1-v3-contact-sheet.png'),
  ],
  { stdio: 'inherit' },
);

writeFileSync(path.join(outputDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Generated ${cards.length} v3 Pinterest assets in ${outputDir}`);
