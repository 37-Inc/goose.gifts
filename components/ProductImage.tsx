'use client';

import Image from 'next/image';

interface ProductImageProps {
  imageUrl: string;
  alt: string;
  className?: string;
  sizes?: string;
}

export function ProductImage({ imageUrl, alt, className = '', sizes }: ProductImageProps) {
  return (
    <Image
      src={imageUrl}
      alt={alt}
      fill
      className={className}
      sizes={sizes}
    />
  );
}
