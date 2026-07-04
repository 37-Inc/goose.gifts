import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Script from "next/script";
import { Analytics } from "@vercel/analytics/react";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "Funny Gag Gifts & White Elephant Ideas | goose.gifts",
  description: "Find funny gag gifts, white elephant ideas, novelty products, and weird presents from a fast catalog built for people who are hard to shop for.",
  keywords: [
    "gag gifts",
    "funny gag gifts",
    "white elephant gifts",
    "weird gifts",
    "novelty gifts",
    "funny gifts for coworkers",
    "funny gifts for dads",
    "secret santa ideas",
    "gift ideas for hard to shop for people",
    "quirky gifts",
    "joke gifts",
    "funny gift bundles",
    "AI gift finder"
  ],
  metadataBase: new URL(process.env.NEXT_PUBLIC_BASE_URL || 'https://goose.gifts'),
  openGraph: {
    title: "Funny Gag Gifts & White Elephant Ideas | goose.gifts",
    description: "Find funny gag gifts, white elephant ideas, novelty products, and weird presents.",
    url: '/',
    siteName: 'goose.gifts',
    type: "website",
    images: [
      {
        url: '/sillygoose-og.png',
        width: 1200,
        height: 630,
        alt: 'goose.gifts funny gag gift catalog',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: "Funny Gag Gifts & White Elephant Ideas | goose.gifts",
    description: "Find funny gag gifts, white elephant ideas, novelty products, and weird presents.",
    images: ['/sillygoose-og.png'],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://goose.gifts';

  const websiteSchema = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'goose.gifts',
    url: baseUrl,
    description: 'Funny gag gift catalog for white elephant ideas, novelty products, and weird presents',
    potentialAction: {
      '@type': 'SearchAction',
      target: `${baseUrl}/search?q={search_term_string}`,
      'query-input': 'required name=search_term_string',
    },
  };

  const organizationSchema = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'goose.gifts',
    url: baseUrl,
    logo: `${baseUrl}/sillygoose.png`,
    description: 'Funny gag gift catalog and gift finder for weird, useful, and ridiculous presents',
  };

  return (
    <html lang="en">
      <body className={`${inter.variable} font-sans antialiased min-h-screen`}>
        {/* JSON-LD Structured Data */}
        <Script
          id="website-schema"
          type="application/ld+json"
          strategy="afterInteractive"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteSchema) }}
        />
        <Script
          id="organization-schema"
          type="application/ld+json"
          strategy="afterInteractive"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationSchema) }}
        />

        {/* Google Analytics & Google Ads */}
        <Script
          src="https://www.googletagmanager.com/gtag/js?id=G-6RR3HPR747"
          strategy="afterInteractive"
        />
        <Script id="google-analytics" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', 'G-6RR3HPR747');
            gtag('config', 'AW-17626116539');
          `}
        </Script>

        <main className="min-h-screen">
          {children}
        </main>

        {/* Affiliate Disclosure Footer */}
        <footer className="border-t border-zinc-200 bg-white py-12">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
            <p className="text-xs text-zinc-500 text-center leading-relaxed">
              We participate in affiliate programs. Purchases through our links support this project at no cost to you.
            </p>
            <p className="text-xs text-zinc-400 text-center mt-6">
              © {new Date().getFullYear()} goose.gifts
            </p>
          </div>
        </footer>

        <Analytics />
      </body>
    </html>
  );
}
