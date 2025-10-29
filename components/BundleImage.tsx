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
    // Skip if not in browser environment
    if (typeof window === 'undefined') {
      return;
    }

    // Calculate crop positions for each image
    const calculatePositions = async () => {
      try {
        const positions = await Promise.all(
          displayImages.map(async (imageUrl) => {
            if (!imageUrl) return { x: 0, y: 0 };
            try {
              return await getSmartCropPosition(imageUrl);
            } catch (error) {
              console.warn('Failed to get crop position for image:', imageUrl, error);
              return { x: 0, y: 0 };
            }
          })
        );
        setCropPositions(positions);
      } catch (error) {
        console.warn('Failed to calculate crop positions:', error);
        // Keep default positions if calculation fails
      }
    };

    calculatePositions();
  }, [displayImages]);

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
                  className="object-cover scale-110 [@media(hover:hover)]:group-hover:scale-[1.15] transition-transform duration-500 ease-out"
                  sizes="(max-width: 640px) 50vw, 33vw"
                  style={{
                    objectPosition: `${50 + cropPositions[index].x}% ${35 + cropPositions[index].y}%`,
                  }}
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

/**
 * Analyzes an image to find the center of the main product
 * Returns offset from center as percentage (-50 to 50)
 * Results are cached in localStorage to reduce Vercel image transformations
 */
async function getSmartCropPosition(imageUrl: string): Promise<CropPosition> {
  // Check cache first
  const cacheKey = `crop-${imageUrl}`;
  try {
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      const parsed = JSON.parse(cached);
      return { x: parsed.x, y: parsed.y };
    }
  } catch (error) {
    // localStorage might be disabled or full, continue without cache
    console.debug('Cache read failed:', error);
  }

  return new Promise((resolve) => {
    // Safety check: ensure we're in a browser environment with required APIs
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      resolve({ x: 0, y: 0 });
      return;
    }

    // Set a timeout to prevent hanging if image loading is blocked
    const timeout = setTimeout(() => {
      resolve({ x: 0, y: 0 });
    }, 3000);

    try {
      const img = new window.Image();
      img.crossOrigin = 'anonymous';

      img.onload = () => {
        clearTimeout(timeout);
        try {
          // Check if canvas API is available (may be blocked by content blockers)
          if (typeof document.createElement !== 'function') {
            resolve({ x: 0, y: 0 });
            return;
          }

          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d', { willReadFrequently: true });

          // Canvas may be blocked by Safari content blockers
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

        // Find bounding box of content, ignoring edge regions where banners typically appear
        // Top 30% for banner text, bottom 8% for safety, left/right 15% for side badges
        const edgeMarginTop = Math.floor(canvas.height * 0.30);
        const edgeMarginBottom = Math.floor(canvas.height * 0.08);
        const edgeMarginLeft = Math.floor(canvas.width * 0.15);
        const edgeMarginRight = Math.floor(canvas.width * 0.15);

        // First pass: collect all content pixels with their density
        const contentPixels: { x: number; y: number }[] = [];

        for (let y = edgeMarginTop; y < canvas.height - edgeMarginBottom; y++) {
          for (let x = edgeMarginLeft; x < canvas.width - edgeMarginRight; x++) {
            const i = (y * canvas.width + x) * 4;
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            const a = data[i + 3];

            if (isContentPixel(r, g, b, a)) {
              contentPixels.push({ x, y });
            }
          }
        }

        // If we found content, find the densest region (this is where the product likely is)
        // We'll use a weighted center based on pixel density
        if (contentPixels.length > 0) {
          let totalX = 0;
          let totalY = 0;

          contentPixels.forEach(pixel => {
            totalX += pixel.x;
            totalY += pixel.y;

            // Update bounding box
            minX = Math.min(minX, pixel.x);
            maxX = Math.max(maxX, pixel.x);
            minY = Math.min(minY, pixel.y);
            maxY = Math.max(maxY, pixel.y);
          });

          // Use weighted average for better centering on dense product regions
          const avgX = totalX / contentPixels.length;
          const avgY = totalY / contentPixels.length;

          // Blend the bounding box center with the weighted average (70% bbox, 30% weighted)
          const bboxCenterX = (minX + maxX) / 2;
          const bboxCenterY = (minY + maxY) / 2;

          minX = bboxCenterX;
          maxX = bboxCenterX;
          minY = bboxCenterY;
          maxY = bboxCenterY;
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

        const position = { x: clampedX, y: clampedY };

        // Cache the result
        try {
          localStorage.setItem(cacheKey, JSON.stringify(position));
        } catch (error) {
          // localStorage might be full or disabled, continue without caching
          console.debug('Cache write failed:', error);
        }

        resolve(position);
      } catch (error) {
        console.warn('Smart crop failed for image:', imageUrl, error);
        resolve({ x: 0, y: 0 });
      }
    };

    img.onerror = () => {
      clearTimeout(timeout);
      resolve({ x: 0, y: 0 });
    };

    // Add cache busting and handle CORS
    img.src = imageUrl;
  } catch (error) {
      // Catch any errors from Image constructor or property access
      clearTimeout(timeout);
      console.warn('Failed to initialize smart crop for image:', imageUrl, error);
      resolve({ x: 0, y: 0 });
    }
  });
}
