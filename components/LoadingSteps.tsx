'use client';

import { useEffect, useState } from 'react';

interface LoadingStep {
  label: string;
  duration: number; // milliseconds
}

const steps: LoadingStep[] = [
  { label: 'Analyzing recipient', duration: 3000 },
  { label: 'Generating gift concepts', duration: 8000 },
  { label: 'Searching products', duration: 12000 },
  { label: 'Curating bundles', duration: 5000 },
];

export function LoadingSteps() {
  const [currentStep, setCurrentStep] = useState(0);
  const [progress, setProgress] = useState(0);

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

  return (
    <div className="w-full max-w-md mx-auto">
      {/* Progress bar */}
      <div className="mb-8">
        <div className="h-1 w-full bg-zinc-200 rounded-full overflow-hidden">
          <div
            className="h-full bg-zinc-900 transition-all duration-300 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Steps */}
      <div className="space-y-4">
        {steps.map((step, index) => (
          <div
            key={index}
            className={`flex items-center gap-3 transition-all duration-300 ${
              index === currentStep
                ? 'opacity-100'
                : index < currentStep
                ? 'opacity-40'
                : 'opacity-20'
            }`}
          >
            {/* Step indicator */}
            <div
              className={`flex-shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all duration-300 ${
                index < currentStep
                  ? 'bg-zinc-900 border-zinc-900'
                  : index === currentStep
                  ? 'border-zinc-900 bg-white'
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
                <div className="w-2 h-2 bg-zinc-900 rounded-full pulse-subtle" />
              )}
            </div>

            {/* Step label */}
            <span
              className={`text-sm font-medium transition-colors ${
                index === currentStep
                  ? 'text-zinc-900'
                  : index < currentStep
                  ? 'text-zinc-500'
                  : 'text-zinc-400'
              }`}
            >
              {step.label}
            </span>
          </div>
        ))}
      </div>

      {/* Time estimate */}
      <p className="text-center text-xs text-zinc-400 mt-8">
        This usually takes 20-30 seconds
      </p>
    </div>
  );
}
