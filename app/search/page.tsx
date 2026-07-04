import { redirect } from 'next/navigation';

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[] }>;
}) {
  const params = await searchParams;
  const query = Array.isArray(params.q) ? params.q[0] : params.q;

  if (query && query.trim()) {
    redirect(`/?q=${encodeURIComponent(query.trim())}`);
  }

  redirect('/');
}
