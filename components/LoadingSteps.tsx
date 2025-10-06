'use client';

import { useEffect, useState } from 'react';
import { GIFT_CONCEPTS_COUNT } from '@/lib/config';

interface LoadingStep {
  label: string;
  duration: number; // milliseconds
}

const steps: LoadingStep[] = [
  { label: 'Analyzing recipient', duration: 3000 },
  { label: 'Generating gift concepts', duration: 8000 },
  { label: 'Searching products', duration: 12000 },
  { label: 'Curating bundles', duration: 15000 }, // Increased to match actual LLM processing time
];

const gooseMessages = [
  '🪿 The goose is loose and finding gifts...',
  '🪿 Honking at Amazon for the best deals...',
  '🪿 Waddle-ing through product catalogs...',
  '🪿 Flapping through funny gift ideas...',
  '🪿 Pecking out the perfect bundles...',
];

// Generate concept title templates based on theme
// Currently unused but kept for potential future use
// const generateMockConceptTitles = (_description: string) => {
//   const themes = [
//     'The Perfect [X] Kit',
//     '[X]-tastic Bundle',
//     'Ultimate [X] Package',
//     '[X] Lover\'s Dream',
//     'The [X] Collection',
//   ];
//
//   return themes.map((template, i) =>
//     template.replace('[X]', `Concept ${i + 1}`)
//   );
// };

interface LoadingStepsProps {
  recipientDescription?: string;
}

export function LoadingSteps({ recipientDescription = '' }: LoadingStepsProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [progress, setProgress] = useState(0);
  const [conceptTitles, setConceptTitles] = useState<string[]>([]);
  const [productCount, setProductCount] = useState(0);
  const [searchCount, setSearchCount] = useState(0);
  const [gooseMessage, setGooseMessage] = useState(gooseMessages[0]);

  // Generate random max values for realistic variation
  const [maxSearchCount] = useState(() => Math.floor(Math.random() * 5) + 10); // 10-14 queries
  const [maxProductCount] = useState(() => Math.floor(Math.random() * 50) + 90); // 90-139 products

  useEffect(() => {
    const totalDuration = steps.reduce((sum, step) => sum + step.duration, 0);
    let elapsed = 0;

    const interval = setInterval(() => {
      elapsed += 100;
      const newProgress = Math.min((elapsed / totalDuration) * 100, 95);
      setProgress(newProgress);

      // Update current step
      let cumulativeDuration = 0;
      for (let i = 0; i < steps.length; i++) {
        cumulativeDuration += steps[i].duration;
        if (elapsed <= cumulativeDuration) {
          setCurrentStep(i);
          break;
        }
      }

      if (elapsed >= totalDuration) {
        clearInterval(interval);
      }
    }, 100);

    return () => clearInterval(interval);
  }, []);

  // Generate concept titles during step 1 (Generating gift concepts)
  useEffect(() => {
    if (currentStep === 1) {
      const allTemplates = [
        'Crafting punny bundle',
        'Creating clever combo',
        'Dreaming up bundle',
        'Concocting gift set',
        'Finalizing bundle',
        'Assembling surprise package',
        'Curating perfect picks',
      ];

      // Randomly select GIFT_CONCEPTS_COUNT templates
      const shuffled = [...allTemplates].sort(() => Math.random() - 0.5);
      const selectedTemplates = shuffled.slice(0, GIFT_CONCEPTS_COUNT);

      const placeholderTitles = Array.from({ length: GIFT_CONCEPTS_COUNT }, (_, i) => {
        return `${selectedTemplates[i]} #${i + 1}...`;
      });

      const titles: string[] = [];
      const titleInterval = setInterval(() => {
        if (titles.length < GIFT_CONCEPTS_COUNT) {
          titles.push(placeholderTitles[titles.length]);
          setConceptTitles([...titles]);
        } else {
          clearInterval(titleInterval);
        }
      }, 1500); // Show a new concept every 1.5s

      return () => clearInterval(titleInterval);
    }
  }, [currentStep]);

  // Increment product count during step 2 (Searching products)
  useEffect(() => {
    if (currentStep === 2) {
      const countInterval = setInterval(() => {
        setProductCount(prev => Math.min(prev + Math.floor(Math.random() * 15) + 5, maxProductCount));
        setSearchCount(prev => Math.min(prev + 1, maxSearchCount));
      }, 800);

      return () => clearInterval(countInterval);
    }
  }, [currentStep, maxProductCount, maxSearchCount]);

  // Rotate goose messages
  useEffect(() => {
    const messageInterval = setInterval(() => {
      setGooseMessage(gooseMessages[Math.floor(Math.random() * gooseMessages.length)]);
    }, 4000);

    return () => clearInterval(messageInterval);
  }, []);

  // Get dynamic subtitle for current step
  const getStepSubtitle = (stepIndex: number) => {
    switch (stepIndex) {
      case 0:
        return recipientDescription
          ? `Looking for gifts for: "${recipientDescription.slice(0, 60)}${recipientDescription.length > 60 ? '...' : ''}"`
          : 'Understanding the perfect recipient...';
      case 1:
        return 'Crafting punny bundles with clever themes...';
      case 2:
        return searchCount > 0
          ? `🔍 Searching ${searchCount} queries... ${productCount} products found`
          : 'Scouring Amazon & Etsy for perfect items...';
      case 3:
        return `🎯 AI curating the best items for each bundle...`;
      default:
        return '';
    }
  };

  return (
    <div className="w-full max-w-2xl mx-auto">
      {/* Progress bar */}
      <div className="mb-8">
        <div className="h-1.5 w-full bg-zinc-200 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-[#f59e42] to-[#f7a854] transition-all duration-300 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Steps */}
      <div className="space-y-6">
        {steps.map((step, index) => (
          <div
            key={index}
            className={`transition-all duration-300 ${
              index === currentStep
                ? 'opacity-100'
                : index < currentStep
                ? 'opacity-60'
                : 'opacity-30'
            }`}
          >
            <div className="flex items-start gap-3">
              {/* Step indicator */}
              <div
                className={`flex-shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all duration-300 ${
                  index < currentStep
                    ? 'bg-zinc-900 border-zinc-900'
                    : index === currentStep
                    ? 'border-[#f59e42] bg-white'
                    : 'border-zinc-300 bg-white'
                }`}
              >
                {index < currentStep && (
                  <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                    <path
                      fillRule="evenodd"
                      d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                )}
                {index === currentStep && (
                  <div className="w-2 h-2 bg-[#f59e42] rounded-full pulse-subtle" />
                )}
              </div>

              <div className="flex-1 min-w-0">
                {/* Step label */}
                <div
                  className={`text-sm font-semibold transition-colors ${
                    index === currentStep
                      ? 'text-zinc-900'
                      : index < currentStep
                      ? 'text-zinc-500'
                      : 'text-zinc-400'
                  }`}
                >
                  {step.label}
                </div>

                {/* Dynamic subtitle */}
                {index <= currentStep && (
                  <div className="text-xs text-zinc-500 mt-1 leading-relaxed">
                    {getStepSubtitle(index)}
                  </div>
                )}

                {/* Concept titles - show during step 1 */}
                {index === 1 && currentStep === 1 && conceptTitles.length > 0 && (
                  <div className="mt-3 space-y-1.5">
                    {conceptTitles.map((title, i) => (
                      <div
                        key={i}
                        className="text-xs text-zinc-600 flex items-center gap-2 animate-in"
                      >
                        <span className="text-green-600">✓</span>
                        <span>{title}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Goose message */}
      <div className="mt-10 text-center">
        <p className="text-xs text-zinc-500 transition-all duration-500">
          {gooseMessage}
        </p>
      </div>
    </div>
  );
}
