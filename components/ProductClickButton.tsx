'use client';

import { useEffect } from 'react';
import type { MouseEvent, ReactNode } from 'react';
import type { Product } from '@/lib/types';
import {
  captureOutboundProductClick,
  captureSelectItem,
} from '@/lib/client-analytics';
import { getClickAttribution } from '@/lib/client-attribution';

interface ProductClickButtonProps {
  product: Product;
  clickSource: string;
  contextSlug?: string;
  children: ReactNode;
  className: string;
}

function openOutbound(url: string) {
  window.open(url, '_blank', 'noopener,noreferrer');
}

export function ProductClickButton({
  product,
  clickSource,
  contextSlug,
  children,
  className,
}: ProductClickButtonProps) {
  useEffect(() => {
    fetch('/api/track-impression', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        productIds: [product.id],
        source: clickSource,
        contextSlug,
      }),
    }).catch(() => {});
  }, [clickSource, contextSlug, product.id]);

  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    const attribution = getClickAttribution();

    fetch('/api/track-click', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        productId: product.id,
        source: clickSource,
        contextSlug,
        attribution,
      }),
    }).catch(() => {});

    captureSelectItem({
      clickSource,
      contextSlug,
      productId: product.id,
      productSource: product.source,
      index: 0,
    });

    let opened = false;
    const openOnce = () => {
      if (!opened) {
        opened = true;
        openOutbound(product.affiliateUrl);
      }
    };

    // Open inside the original user gesture so browser popup protection cannot
    // block the affiliate destination. The analytics callback remains an
    // idempotent delivery safety net.
    openOnce();
    captureOutboundProductClick({
      clickSource,
      contextSlug,
      productId: product.id,
      productSource: product.source,
      affiliateUrl: product.affiliateUrl,
      attribution,
      callback: openOnce,
    });
  };

  return (
    <a
      href={product.affiliateUrl}
      target="_blank"
      rel="noopener noreferrer"
      onClick={handleClick}
      className={className}
    >
      {children}
    </a>
  );
}
