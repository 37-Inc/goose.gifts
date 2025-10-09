'use client';

import Image from 'next/image';
import { useState, useEffect, useRef } from 'react';

interface BundleImageProps {
  images: string[];
  alt: string;
}

interface CropPosition {
  x: number; // -50 to 50 (percentage offset from center)
  y: number; // -50 to 50 (percentage offset from center)
}

export function BundleImage({ images, alt }: BundleImageProps) {
  // Take up to 4 images for the 2x2 grid
  const displayImages = images.slice(0, 4);

  // If we don't have enough images, duplicate the first one to fill the grid
  while (displayImages.length < 4) {
    displayImages.push(displayImages[0] || '');
  }

  const [cropPositions, setCropPositions] = useState<CropPosition[]>(
    displayImages.map(() => ({ x: 0, y: 0 }))
  );

  useEffect(() => {
    // Calculate crop positions for each image
    const calculatePositions = async () => {
      const positions = await Promise.all(
        displayImages.map(async (imageUrl) => {
          if (!imageUrl) return { x: 0, y: 0 };
          return await getSmartCropPosition(imageUrl);
        })
      );
      setCropPositions(positions);
    };

    calculatePositions();
  }, [displayImages]);

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
                style={{
                  objectPosition: `${50 + cropPositions[index].x}% ${50 + cropPositions[index].y}%`,
                }}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Analyzes an image to find the center of the main product
 * Returns offset from center as percentage (-50 to 50)
 */
async function getSmartCropPosition(imageUrl: string): Promise<CropPosition> {
  return new Promise((resolve) => {
    const img = new window.Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve({ x: 0, y: 0 });
          return;
        }

        // Use a smaller canvas for faster processing
        const scale = 0.1;
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;

        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;

        let minX = canvas.width;
        let maxX = 0;
        let minY = canvas.height;
        let maxY = 0;

        // Threshold for detecting non-background pixels
        // We'll consider a pixel as "content" if it's not too close to white/light gray
        const isContentPixel = (r: number, g: number, b: number, a: number) => {
          if (a < 128) return false; // Transparent

          const brightness = (r + g + b) / 3;
          const variance = Math.max(Math.abs(r - g), Math.abs(g - b), Math.abs(r - b));

          // Not content if too bright (close to white) AND low variance
          return brightness < 240 || variance > 15;
        };

        // Find bounding box of content
        for (let y = 0; y < canvas.height; y++) {
          for (let x = 0; x < canvas.width; x++) {
            const i = (y * canvas.width + x) * 4;
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            const a = data[i + 3];

            if (isContentPixel(r, g, b, a)) {
              minX = Math.min(minX, x);
              maxX = Math.max(maxX, x);
              minY = Math.min(minY, y);
              maxY = Math.max(maxY, y);
            }
          }
        }

        // Calculate center of content
        const contentCenterX = (minX + maxX) / 2;
        const contentCenterY = (minY + maxY) / 2;

        // Calculate offset from image center as percentage
        const imageCenterX = canvas.width / 2;
        const imageCenterY = canvas.height / 2;

        const offsetX = ((contentCenterX - imageCenterX) / canvas.width) * 100;
        const offsetY = ((contentCenterY - imageCenterY) / canvas.height) * 100;

        // Clamp to reasonable range
        const clampedX = Math.max(-30, Math.min(30, offsetX));
        const clampedY = Math.max(-30, Math.min(30, offsetY));

        resolve({ x: clampedX, y: clampedY });
      } catch (error) {
        console.warn('Smart crop failed for image:', imageUrl, error);
        resolve({ x: 0, y: 0 });
      }
    };

    img.onerror = () => {
      resolve({ x: 0, y: 0 });
    };

    // Add cache busting and handle CORS
    img.src = imageUrl;
  });
}
