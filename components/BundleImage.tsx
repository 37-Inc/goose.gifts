'use client';

import Image from 'next/image';
import { useState } from 'react';

interface BundleImageProps {
  images: string[];
  alt: string;
}

export function BundleImage({ images, alt }: BundleImageProps) {
  // Take up to 4 images for the 2x2 grid, filter out empty URLs
  const validImages = images.filter(img => img && img !== '');
  const displayImages = validImages.slice(0, 4);

  // If we don't have enough images, duplicate the first one to fill the grid
  while (displayImages.length < 4 && displayImages.length > 0) {
    displayImages.push(displayImages[0]);
  }

  const [imageErrors, setImageErrors] = useState<Record<number, boolean>>({});

  const handleImageError = (index: number, imageUrl: string) => {
    console.error(`Failed to load bundle image ${index}: ${imageUrl}`);
    setImageErrors(prev => ({ ...prev, [index]: true }));
  };

  return (
    <div className="relative bg-zinc-50 overflow-hidden" style={{ aspectRatio: '1.91/1' }}>
      {/* Image Grid */}
      <div className="grid grid-cols-2 grid-rows-2 w-full h-full gap-1 bg-zinc-100 p-0.5">
        {displayImages.map((imageUrl, index) => (
          <div
            key={index}
            className="relative bg-white overflow-hidden rounded-sm"
            style={{
              transitionDelay: `${index * 30}ms`,
            }}
          >
            {imageUrl && !imageErrors[index] ? (
              <>
                <Image
                  src={imageUrl}
                  alt={`${alt} - Product ${index + 1}`}
                  fill
                  className="object-cover scale-110 [@media(hover:hover)]:group-hover:scale-[1.15] transition-transform duration-500 ease-out"
                  sizes="(max-width: 640px) 50vw, 33vw"
                  onError={() => handleImageError(index, imageUrl)}
                />
                {/* Subtle inner shadow for depth */}
                <div className="absolute inset-0 shadow-inner pointer-events-none opacity-20"></div>
              </>
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-zinc-100">
                <svg className="w-6 h-6 text-zinc-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
            )}
          </div>
        ))}
        {displayImages.length === 0 && (
          <div className="col-span-2 row-span-2 flex items-center justify-center bg-zinc-100">
            <div className="text-center text-zinc-400">
              <svg className="w-16 h-16 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <p className="text-sm">No images available</p>
            </div>
          </div>
        )}
      </div>

      {/* Gradient overlay for extra polish */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/0 via-black/0 to-black/5 pointer-events-none"></div>
    </div>
  );
}
