/**
 * Multi-armed bandit algorithm for trending product rotation
 *
 * Strategy: Thompson Sampling (Bayesian approach)
 * - Automatically balances exploration (testing new products) vs exploitation (showing winners)
 * - Products with high CTR get shown more often, but new products still get chances
 * - Recency decay ensures products don't stay trending forever
 */

import type { Product } from '@/lib/types';
import { scoreProductForTrending } from './product-scoring';

interface ProductWithStats extends Product {
  clickCount?: number;
  impressionCount?: number;
  lastClickedAt?: Date | null;
}

/**
 * Calculate CTR (Click-Through Rate)
 */
function calculateCTR(clicks: number, impressions: number): number {
  if (impressions === 0) return 0;
  return clicks / impressions;
}

/**
 * Calculate recency score (products clicked recently rank higher)
 * Decay over 7 days
 */
function calculateRecencyScore(lastClickedAt: Date | null): number {
  if (!lastClickedAt) return 0;

  const now = new Date();
  const hoursSinceClick = (now.getTime() - new Date(lastClickedAt).getTime()) / (1000 * 60 * 60);
  const daysSinceClick = hoursSinceClick / 24;

  // Exponential decay: full score at 0 days, 0.5 at 3.5 days, ~0 at 7 days
  const recencyScore = Math.exp(-daysSinceClick / 3.5);

  return recencyScore * 30; // Max 30 points for recency
}

/**
 * Thompson Sampling: Sample from Beta distribution
 * Returns a random sample that represents our belief about the product's CTR
 */
function thompsonSample(clicks: number, impressions: number): number {
  // Beta distribution parameters (Bayesian prior)
  // Start with weak prior: alpha=1, beta=1 (uniform distribution)
  const alpha = clicks + 1;
  const beta = (impressions - clicks) + 1;

  // Sample from Beta distribution using approximation
  // For simplicity, use mean + random variation
  const mean = alpha / (alpha + beta);
  const variance = (alpha * beta) / ((alpha + beta) ** 2 * (alpha + beta + 1));
  const stdDev = Math.sqrt(variance);

  // Add randomness (normal approximation)
  const randomFactor = (Math.random() - 0.5) * 2 * stdDev;
  const sample = Math.max(0, Math.min(1, mean + randomFactor));

  return sample;
}

/**
 * Score products using multi-armed bandit + traditional scoring
 */
export function scoreProductsForRotation(products: ProductWithStats[]): Array<ProductWithStats & { rotationScore: number }> {
  return products.map(product => {
    // 1. Base score from traditional algorithm (commission, clickbait, etc.)
    const baseScore = scoreProductForTrending(product);

    // 2. CTR-based score (actual performance data)
    const clicks = product.clickCount || 0;
    const impressions = product.impressionCount || 0;

    let ctrScore = 0;
    if (impressions >= 10) {
      // Products with enough data: use Thompson sampling
      const sampledCTR = thompsonSample(clicks, impressions);
      ctrScore = sampledCTR * 100; // Max 100 points
    } else {
      // New products or low impressions: give them a chance (exploration)
      // Use optimistic initial values (assume 5% CTR)
      ctrScore = 5 + (clicks / Math.max(impressions, 1)) * 10;
    }

    // 3. Recency score (prevent stale trending products)
    const recencyScore = calculateRecencyScore(product.lastClickedAt || null);

    // 4. Combined score
    // Weight: 40% base algorithm, 40% CTR performance, 20% recency
    const rotationScore = (baseScore * 0.4) + (ctrScore * 0.4) + (recencyScore * 0.2);

    return {
      ...product,
      rotationScore: Math.round(rotationScore * 100) / 100, // Round to 2 decimals
    };
  });
}

/**
 * Select top products with diversity (category balance)
 */
export function selectRotatedProducts(
  products: Array<ProductWithStats & { rotationScore: number }>,
  limit: number = 12
): ProductWithStats[] {
  // Sort by rotation score
  const sorted = [...products].sort((a, b) => b.rotationScore - a.rotationScore);

  // Strategy: 70% exploitation (top performers), 30% exploration (randomize from next tier)
  const exploitCount = Math.floor(limit * 0.7); // 8 products
  const exploreCount = limit - exploitCount; // 4 products

  // Take top performers
  const topPerformers = sorted.slice(0, exploitCount);

  // Randomly sample from next 20 products for exploration
  const explorationPool = sorted.slice(exploitCount, exploitCount + 20);
  const explored: Array<ProductWithStats & { rotationScore: number }> = [];

  // Weighted random sampling (higher scores more likely)
  for (let i = 0; i < exploreCount && explorationPool.length > 0; i++) {
    // Calculate weights (score^2 for exponential preference)
    const totalWeight = explorationPool.reduce((sum, p) => sum + (p.rotationScore ** 2), 0);
    let random = Math.random() * totalWeight;

    let selectedIndex = 0;
    for (let j = 0; j < explorationPool.length; j++) {
      random -= explorationPool[j].rotationScore ** 2;
      if (random <= 0) {
        selectedIndex = j;
        break;
      }
    }

    explored.push(explorationPool[selectedIndex]);
    explorationPool.splice(selectedIndex, 1);
  }

  // Combine and shuffle to avoid obvious patterns
  const selected = [...topPerformers, ...explored];

  // Fisher-Yates shuffle
  for (let i = selected.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [selected[i], selected[j]] = [selected[j], selected[i]];
  }

  return selected.slice(0, limit);
}

/**
 * Main function: Get trending products with rotation
 */
export function getTrendingProductsWithRotation(
  products: ProductWithStats[],
  limit: number = 12
): ProductWithStats[] {
  // Score all products
  const scored = scoreProductsForRotation(products);

  // Select with exploration/exploitation strategy
  return selectRotatedProducts(scored, limit);
}
