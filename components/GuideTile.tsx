import Link from 'next/link';
import { ProductImage } from '@/components/ProductImage';
import type { GuidePreview } from '@/lib/gift-guides';

/**
 * A visual directory tile for a gift guide: a representative product image
 * over the guide title. Used on the /gift-guides index. Falls back to a
 * text-forward tile when no preview image is available.
 */
export function GuideTile({
  href,
  title,
  preview,
  priority = false,
}: {
  href: string;
  title: string;
  preview?: GuidePreview;
  priority?: boolean;
}) {
  return (
    <Link href={href} className="group flex flex-col">
      <div className="relative aspect-square overflow-hidden rounded-2xl bg-zinc-50 ring-1 ring-zinc-950/[0.06] transition duration-300 group-hover:shadow-[0_12px_32px_-12px_rgba(0,0,0,0.16)] group-hover:ring-zinc-950/10">
        {preview ? (
          <div className="absolute inset-5 sm:inset-6">
            <ProductImage
              imageUrl={preview.imageUrl}
              alt={title}
              className="object-contain transition duration-300 ease-out group-hover:scale-[1.05]"
              sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
              priority={priority}
            />
          </div>
        ) : (
          <div className="flex h-full items-center justify-center px-4 text-center text-sm font-semibold text-zinc-400">
            {title}
          </div>
        )}
      </div>
      <h3 className="mt-3 px-0.5 text-[15px] font-semibold leading-snug tracking-[-0.01em] text-zinc-900 underline-offset-4 group-hover:text-red-600 group-hover:underline">
        {title}
      </h3>
    </Link>
  );
}
