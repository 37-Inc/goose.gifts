'use client';

import Image from 'next/image';

interface BundleImageProps {
  images: string[];
  alt: string;
}

export function BundleImage({ images, alt }: BundleImageProps) {
  // Take up to 4 images for the 2x2 grid
  const displayImages = images.slice(0, 4);

  // If we don't have enough images, duplicate the first one to fill the grid
  while (displayImages.length < 4) {
    displayImages.push(displayImages[0] || '');
  }

  return (
    <div className="relative bg-zinc-50 overflow-hidden" style={{ aspectRatio: '1.91/1' }}>
      <div className="grid grid-cols-2 grid-rows-2 w-full h-full gap-[1px] bg-white">
        {displayImages.map((imageUrl, index) => (
          <div key={index} className="relative bg-zinc-50 overflow-hidden">
            {imageUrl && (
              <Image
                src={imageUrl}
                alt={`${alt} - Product ${index + 1}`}
                fill
                className="object-cover scale-110 group-hover:scale-125 transition-transform duration-300"
                sizes="(max-width: 640px) 50vw, (max-width: 1024px) 25vw, 12.5vw"
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
