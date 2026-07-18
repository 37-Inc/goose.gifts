'use client';

import type { MouseEvent, ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

interface RandomGiftLinkProps {
  children: ReactNode;
  className?: string;
}

export function RandomGiftLink({ children, className }: RandomGiftLinkProps) {
  const router = useRouter();

  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    if (
      event.button !== 0
      || event.metaKey
      || event.ctrlKey
      || event.shiftKey
      || event.altKey
    ) {
      return;
    }

    event.preventDefault();

    const seed = typeof window.crypto?.randomUUID === 'function'
      ? window.crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

    router.push(`/random-gift?spin=${encodeURIComponent(seed)}`);
  }

  return (
    <Link href="/random-gift" prefetch={false} className={className} onClick={handleClick}>
      {children}
    </Link>
  );
}
