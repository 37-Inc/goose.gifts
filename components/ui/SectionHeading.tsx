import Link from 'next/link';
import type { ReactNode } from 'react';

/**
 * The quiet, divider-style section heading shared across goose.gifts pages
 * (matches the homepage feed). Replaces the old loud uppercase-red kickers.
 * Optional `aside` shows muted supporting text on the right (desktop only).
 */
export function SectionHeading({
  title,
  aside,
  id,
  className = '',
}: {
  title: ReactNode;
  aside?: ReactNode;
  id?: string;
  className?: string;
}) {
  return (
    <div
      className={`mb-7 flex items-baseline justify-between gap-4 border-b border-zinc-100 pb-4 ${className}`}
    >
      <h2 id={id} className="text-lg font-bold tracking-tight text-zinc-950 sm:text-xl">
        {title}
      </h2>
      {aside && (
        <div className="hidden shrink-0 text-sm text-zinc-400 sm:block">{aside}</div>
      )}
    </div>
  );
}

/**
 * A soft "browse" link card used for guide directories and related-guide
 * lists — borderless, rounded, subtle ring, red hover, matching product cards.
 */
export function BrowseCard({
  href,
  title,
  description,
}: {
  href: string;
  title: ReactNode;
  description?: ReactNode;
}) {
  return (
    <Link
      href={href}
      className="group rounded-2xl bg-zinc-50 px-4 py-3.5 ring-1 ring-zinc-950/[0.04] transition hover:bg-white hover:ring-zinc-950/10"
    >
      <span className="block text-sm font-semibold text-zinc-900 underline-offset-4 group-hover:text-red-600 group-hover:underline">
        {title}
      </span>
      {description && (
        <span className="mt-1 block text-sm leading-6 text-zinc-500">{description}</span>
      )}
    </Link>
  );
}
