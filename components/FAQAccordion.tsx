'use client';

import { useState } from 'react';

interface FAQItem {
  question: string;
  answer: string;
}

interface FAQAccordionProps {
  faqs: FAQItem[];
}

export function FAQAccordion({ faqs }: FAQAccordionProps) {
  const [openIndex, setOpenIndex] = useState<number>(0); // First item open by default

  const toggleItem = (index: number) => {
    setOpenIndex(openIndex === index ? -1 : index);
  };

  return (
    <div className="space-y-3">
      {faqs.map((faq, index) => (
        <div
          key={index}
          className="border border-zinc-200 rounded-lg overflow-hidden bg-white"
        >
          <button
            onClick={() => toggleItem(index)}
            className="w-full px-6 py-4 text-left flex items-center justify-between hover:bg-zinc-50 transition-colors"
            aria-expanded={openIndex === index}
          >
            <span className="font-medium text-zinc-900 pr-8">{faq.question}</span>
            <svg
              className={`w-5 h-5 text-zinc-500 flex-shrink-0 transition-transform duration-200 ${
                openIndex === index ? 'rotate-180' : ''
              }`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {openIndex === index && (
            <div className="px-6 pb-4 text-zinc-600 leading-relaxed">
              {faq.answer}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
