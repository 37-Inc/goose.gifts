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
  title: "goose.gifts - AI-Powered Funny Gift Finder",
  description: "Discover hilarious, pun-driven gift ideas powered by AI. Perfect for any occasion!",
  keywords: [
    "AI gift finder",
    "funny gift ideas",
    "gag gifts",
    "humorous presents",
    "quirky gifts",
    "gift generator",
    "white elephant gifts",
    "secret santa ideas",
    "funny gift bundles",
    "personalized gifts",
    "joke gifts",
    "AI gift recommendations"
  ],
  metadataBase: new URL(process.env.NEXT_PUBLIC_BASE_URL || 'https://goose.gifts'),
  openGraph: {
    title: "goose.gifts - AI-Powered Funny Gift Finder",
    description: "Discover hilarious, pun-driven gift ideas powered by AI",
    url: '/',
    siteName: 'goose.gifts',
    type: "website",
    images: [
      {
        url: '/sillygoose-og.png',
        width: 1200,
        height: 630,
        alt: 'goose.gifts - AI-Powered Funny Gift Finder',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: "goose.gifts - AI-Powered Funny Gift Finder",
    description: "Discover hilarious, pun-driven gift ideas powered by AI",
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
    description: 'AI-powered funny gift finder - discover hilarious, pun-driven gift ideas',
    potentialAction: {
      '@type': 'SearchAction',
      target: `${baseUrl}/?q={search_term_string}`,
      'query-input': 'required name=search_term_string',
    },
  };

  const organizationSchema = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'goose.gifts',
    url: baseUrl,
    logo: `${baseUrl}/sillygoose.png`,
    description: 'AI-powered gift finder for funny, creative gift ideas',
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

        {/* Google Analytics */}
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
