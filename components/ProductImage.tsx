'use client';

import Image from 'next/image';
import { useState } from 'react';
import { cleanAmazonImageUrl } from '@/lib/image-utils';

interface ProductImageProps {
  imageUrl: string;
  alt: string;
  className?: string;
  sizes?: string;
}

export function ProductImage({ imageUrl, alt, className = '', sizes }: ProductImageProps) {
  const [error, setError] = useState(false);

  // Clean Amazon image URLs at display time to fix old stored URLs with transformation suffixes
  const cleanedImageUrl = imageUrl ? cleanAmazonImageUrl(imageUrl) : imageUrl;

  if (!cleanedImageUrl || cleanedImageUrl === '' || error) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-zinc-100 text-zinc-400">
        <div className="text-center p-4">
          <svg className="w-12 h-12 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <p className="text-xs">Image unavailable</p>
        </div>
      </div>
    );
  }

  return (
    <Image
      src={cleanedImageUrl}
      alt={alt}
      fill
      className={className}
      sizes={sizes}
      onError={() => {
        console.error(`Failed to load image: ${cleanedImageUrl}`);
        setError(true);
      }}
    />
  );
}
