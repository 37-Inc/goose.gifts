export interface GiftGuideFaq {
  question: string;
  answer: string;
}

interface GiftGuideFaqSource {
  title: string;
  intro: string;
  faqs?: GiftGuideFaq[];
}

export function getGiftGuideFaqs(guide: GiftGuideFaqSource): GiftGuideFaq[] {
  if (guide.faqs) return guide.faqs;

  const title = guide.title.toLowerCase();

  return [
    {
      question: `What makes a good ${title}?`,
      answer: `${guide.intro} Look for a gift with a clear joke, a real use case, and enough specificity that it feels chosen for the recipient.`,
    },
    {
      question: `Are the ${title} on goose.gifts real products?`,
      answer: 'Yes. goose.gifts uses active catalog items with product images and outbound affiliate links. Some products show Check price because the retailer has the current price.',
    },
    {
      question: `How often is this ${title} page updated?`,
      answer: 'The page is backed by the live goose.gifts catalog. Products can change as discovery, enrichment, engagement, and product-quality checks update the catalog.',
    },
  ];
}
