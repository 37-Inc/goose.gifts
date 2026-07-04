import { notFound, permanentRedirect } from 'next/navigation';
import { getLegacyRedirectTarget } from '@/lib/legacy-redirects';

interface LegacySlugPageProps {
  params: Promise<{ slug: string }>;
}

export default async function LegacySlugPage({ params }: LegacySlugPageProps) {
  const { slug } = await params;
  const target = getLegacyRedirectTarget(slug);

  if (target) {
    permanentRedirect(target);
  }

  notFound();
}
