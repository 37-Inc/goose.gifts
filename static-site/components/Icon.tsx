const paths = {
  gift: "M3 8h18v4H3z M5 12v9h14v-9 M12 8v13 M12 8H7a3 3 0 1 1 3-3l2 3Zm0 0h5a3 3 0 1 0-3-3l-2 3Z",
  briefcase: "M3 7h18v13H3z M8 7V4h8v3 M3 12l9 3 9-3 M12 12v5",
  coffee: "M3 8h13v8a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V8Zm13 0h2a3 3 0 0 1 0 6h-2 M5 3v2 M10 3v2",
  utensils: "M4 3v6a3 3 0 0 0 6 0V3 M7 3v18 M19 3c-4 3-4 8 0 9V3Zm0 9v9",
  fish: "M3 12c5-8 11-8 15 0-4 8-10 8-15 0Zm15 0 4-4v8l-4-4 M8 11h.01",
  cat: "M4 10V3l6 4h4l6-4v7a8 8 0 1 1-16 0Z M8 12h.01 M16 12h.01 M10 16l2 1 2-1",
  dog: "M7 5h10l4 6-4 2V9 M7 5l-4 6 4 2V9 M7 9v8a5 5 0 0 0 10 0V9 M10 14l2 2 2-2 M12 16v3",
  spark: "m12 2 2.5 7.5L22 12l-7.5 2.5L12 22l-2.5-7.5L2 12l7.5-2.5L12 2Z",
  cake: "M4 11h16v10H4z M4 15c2 3 4-3 6 0s4-3 6 0 4 0 4 0 M8 11V7 M16 11V7 M8 3v1 M16 3v1",
  sun: "M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z M12 2v2 M12 20v2 M2 12h2 M20 12h2 M5 5l1 1 M18 18l1 1 M5 19l1-1 M18 6l1-1",
  crown: "m3 6 4 5 5-7 5 7 4-5-2 13H5L3 6Z M5 16h14",
  toilet: "M4 3h7v10H4z M11 10h10v3a7 7 0 0 1-7 7v2h-4v-5 M4 13h17 M7 7h1",
  home: "m3 10 9-7 9 7 M5 9v12h14V9 M9 21v-8h6v8",
  stocking: "M8 3h9v9l4 4c3 5-3 8-7 5l-8-6V3h2Zm-2 4h11",
  glasses: "M3 9h7v7H3z M14 9h7v7h-7z M10 12h4 M3 9l2-5 M21 9l-2-5",
  heart: "M20 5c-3-3-7-1-8 1-1-2-5-4-8-1-5 5 3 11 8 15 5-4 13-10 8-15Z",
  message: "M3 4h18v13H9l-6 4V4Z M7 8h10 M7 12h6",
  lamp: "m7 3-4 10h18L17 3H7Z M12 13v8 M7 21h10",
  eye: "M2 12c5-9 15-9 20 0-5 9-15 9-20 0Zm13 0a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z",
  pencil: "m4 15 12-12 5 5L9 20l-6 1 1-6Z M13 6l5 5 M4 15l5 5",
  medical: "M5 3v6a5 5 0 0 0 10 0V3 M3 3h4 M13 3h4 M10 14v3a4 4 0 0 0 8 0v-3 M20 11a2 2 0 1 1-4 0 2 2 0 0 1 4 0Z",
  book: "M12 5C8 2 4 3 2 4v15c4-2 7-1 10 1 3-2 6-3 10-1V4c-2-1-6-2-10 1Zm0 0v15",
  trophy: "M7 3h10v7a5 5 0 0 1-10 0V3Zm0 2H3v3a4 4 0 0 0 4 4 M17 5h4v3a4 4 0 0 1-4 4 M12 15v6 M7 21h10",
  wine: "M7 3h10l1 6a6 6 0 0 1-12 0l1-6Z M6 8h12 M12 15v6 M8 21h8",
  bath: "M3 12h18v3a5 5 0 0 1-5 5H8a5 5 0 0 1-5-5v-3Zm1 0V5a2 2 0 0 1 4 0 M7 20v2 M17 20v2",
  palette: "M12 3a9 9 0 1 0 0 18h1a2 2 0 0 0 2-2c0-2-3-2-3-4 0-3 9 1 9-5 0-4-5-7-9-7Z M7 9h.01 M11 6h.01 M16 8h.01 M6 14h.01",
  pumpkin: "M12 7c-12-6-13 15-3 14h6c10 1 9-20-3-14Zm0 0V3h3 M9 8c-3 5-3 9 0 13 M15 8c3 5 3 9 0 13",
  tree: "m12 2-6 7h3l-5 6h4l-5 6h18l-5-6h4l-5-6h3l-6-7Zm0 19v2",
  gamepad: "M7 7h10c5 0 8 14 3 14l-4-4H8l-4 4C-1 21 2 7 7 7Z M7 10v5 M4.5 12.5h5 M16 11h.01 M19 14h.01",
  golf: "M8 21V3l11 4-11 4 M4 21h8",
  leaf: "M20 3C8 2 2 8 5 15s17 8 15-12ZM3 21 16 8",
  dice: "M4 3h16v18H4z M8 7h.01 M16 7h.01 M12 12h.01 M8 17h.01 M16 17h.01",
  chevron: "m9 5 7 7-7 7",
} as const;

export type IconName = keyof typeof paths;

/** Small, consistent line glyphs; never platform-dependent emoji. */
export function Icon({ name, className = "" }: { name: IconName; className?: string }) {
  return <svg className={`icon ${className}`} width="20" height="20" viewBox="0 0 24 24"
    fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
    aria-hidden="true" focusable="false"><path d={paths[name]} /></svg>;
}
