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
            {imageUrl && (
              <>
                <Image
                  src={imageUrl}
                  alt={`${alt} - Product ${index + 1}`}
                  fill
                  className="object-cover scale-110 group-hover:scale-[1.15] transition-transform duration-500 ease-out"
                  sizes="(max-width: 640px) 50vw, 33vw"
                />
                {/* Subtle inner shadow for depth */}
                <div className="absolute inset-0 shadow-inner pointer-events-none opacity-20"></div>
              </>
            )}
          </div>
        ))}
      </div>

      {/* Gradient overlay for extra polish */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/0 via-black/0 to-black/5 pointer-events-none"></div>
    </div>
  );
}
