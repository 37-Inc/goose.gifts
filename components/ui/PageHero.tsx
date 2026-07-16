import type { ReactNode } from 'react';

/**
 * The hand-drawn red underline accent used across goose.gifts headings.
 * Wrap a keyword: <HeroUnderline>least serious</HeroUnderline>.
 */
export function HeroUnderline({ children }: { children: ReactNode }) {
  return (
    <span className="relative inline-block whitespace-nowrap">
      {children}
      <svg
        className="absolute -bottom-1.5 left-0 w-full text-red-500 sm:-bottom-2"
        viewBox="0 0 220 12"
        fill="none"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <path
          d="M3 8.5C40 3.5 80 3 110 5.5C145 8.5 180 8 217 4"
          stroke="currentColor"
          strokeWidth="5"
          strokeLinecap="round"
        />
      </svg>
    </span>
  );
}

/**
 * Centered page hero shared by the homepage, guides, and random-gift pages.
 * `title` is a node so callers can wrap a word in <HeroUnderline>. Optional
 * `children` render as a centered action row beneath the subtitle.
 */
export function PageHero({
  title,
  subtitle,
  children,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <section className="mx-auto max-w-2xl px-4 pb-2 pt-10 text-center sm:pt-14">
      <h1 className="text-balance text-4xl font-extrabold tracking-tight text-zinc-950 sm:text-[2.75rem] sm:leading-[1.15]">
        {title}
      </h1>
      {subtitle && (
        <p className="mx-auto mt-4 max-w-xl text-pretty text-base leading-7 text-zinc-500 sm:text-lg">
          {subtitle}
        </p>
      )}
      {children && (
        <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
          {children}
        </div>
      )}
    </section>
  );
}
