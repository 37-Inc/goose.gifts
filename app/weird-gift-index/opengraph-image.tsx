import { ImageResponse } from 'next/og';

export const alt = 'The Weird Gift Index from goose.gifts';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          alignItems: 'stretch',
          background: '#18181b',
          color: '#ffffff',
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          justifyContent: 'space-between',
          padding: '64px 72px',
          width: '100%',
        }}
      >
        <div style={{ color: '#fdba74', display: 'flex', fontSize: 24, fontWeight: 700, letterSpacing: 4 }}>
          ORIGINAL CATALOG RESEARCH · 2026
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', fontSize: 92, fontWeight: 900, letterSpacing: -5, lineHeight: 0.96 }}>
            The Weird Gift Index
          </div>
          <div style={{ color: '#d4d4d8', display: 'flex', fontSize: 34, lineHeight: 1.25, marginTop: 30, maxWidth: 920 }}>
            Animals, pranks, bathroom humor, and the strange language of “funny” gifts.
          </div>
        </div>
        <div style={{ alignItems: 'center', display: 'flex', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', fontSize: 28, fontWeight: 800 }}>goose.gifts</div>
          <div style={{ color: '#a1a1aa', display: 'flex', fontSize: 22 }}>Transparent method · Aggregate data</div>
        </div>
      </div>
    ),
    size
  );
}
