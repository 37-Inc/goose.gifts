'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { capturePageView } from '@/lib/client-analytics';

export function AnalyticsProvider() {
  const pathname = usePathname();

  useEffect(() => {
    capturePageView(pathname);
  }, [pathname]);

  return null;
}
