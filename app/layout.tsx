import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Image from "next/image";
import Link from "next/link";
import Script from "next/script";
import { Analytics } from "@vercel/analytics/react";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

const socialLinks = [
  { label: 'X', href: process.env.NEXT_PUBLIC_X_URL || process.env.NEXT_PUBLIC_TWITTER_URL },
  { label: 'TikTok', href: process.env.NEXT_PUBLIC_TIKTOK_URL },
  { label: 'Pinterest', href: process.env.NEXT_PUBLIC_PINTEREST_URL },
  { label: 'Instagram', href: process.env.NEXT_PUBLIC_INSTAGRAM_URL },
  { label: 'Facebook', href: process.env.NEXT_PUBLIC_FACEBOOK_URL },
].filter((link): link is { label: string; href: string } => Boolean(link.href));

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
    "funny gifts under 25",
    "ridiculous gifts"
  ],
  icons: {
    icon: '/sillygoose.png',
    apple: '/sillygoose.png',
  },
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

        <footer className="border-t border-zinc-200 bg-white">
          <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
            <div className="flex flex-col gap-8 md:flex-row md:items-start md:justify-between">
              <div className="max-w-sm">
                <Link href="/" className="inline-flex items-center gap-3">
                  <Image
                    src="/sillygoose.png"
                    alt=""
                    width={36}
                    height={36}
                    className="h-9 w-9"
                  />
                  <span className="text-lg font-black tracking-tight text-zinc-950">
                    goose.gifts
                  </span>
                </Link>
                <p className="mt-3 text-sm leading-6 text-zinc-600">
                  Funny, weird, and actually purchasable gift ideas for people who are hard to shop for.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-8 text-sm sm:flex sm:gap-12">
                <div>
                  <h2 className="font-semibold text-zinc-950">Explore</h2>
                  <div className="mt-3 flex flex-col gap-2 text-zinc-600">
                    <Link href="/" className="hover:text-red-700">Fresh finds</Link>
                    <Link href="/#catalog-search" className="hover:text-red-700">Search gifts</Link>
                  </div>
                </div>

                {socialLinks.length > 0 && (
                  <div>
                    <h2 className="font-semibold text-zinc-950">Social</h2>
                    <div className="mt-3 flex flex-col gap-2 text-zinc-600">
                      {socialLinks.map((link) => (
                        <a
                          key={link.label}
                          href={link.href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="hover:text-red-700"
                        >
                          {link.label}
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="mt-10 flex flex-col gap-3 border-t border-zinc-200 pt-6 text-xs leading-5 text-zinc-500 sm:flex-row sm:items-center sm:justify-between">
              <p>
                As affiliates, we may earn from qualifying purchases at no extra cost to you.
              </p>
              <p className="text-zinc-400">
                © {new Date().getFullYear()} goose.gifts
              </p>
            </div>
          </div>
        </footer>

        <Analytics />
      </body>
    </html>
  );
}
