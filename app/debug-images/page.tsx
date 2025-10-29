import { getTrendingProducts } from '@/lib/db/operations';
import { getNewestBundles } from '@/lib/db/related-bundles';
import Image from 'next/image';

export const dynamic = 'force-dynamic';

export default async function DebugImagesPage() {
  const products = await getTrendingProducts(5);
  const bundles = await getNewestBundles(2);

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-8">Image Debug Page</h1>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold mb-4">Trending Products ({products.length})</h2>
        <div className="space-y-6">
          {products.map((product) => (
            <div key={product.id} className="border p-4 rounded">
              <h3 className="font-semibold mb-2">{product.title}</h3>
              <div className="grid grid-cols-2 gap-4 text-sm mb-4">
                <div>
                  <strong>ID:</strong> {product.id}
                </div>
                <div>
                  <strong>Source:</strong> {product.source}
                </div>
                <div className="col-span-2">
                  <strong>Image URL:</strong>
                  <div className="bg-gray-100 p-2 rounded mt-1 break-all">
                    {product.imageUrl || '(empty)'}
                  </div>
                </div>
                {product.imageUrl && (
                  <div className="col-span-2">
                    <strong>Domain:</strong> {new URL(product.imageUrl).hostname}
                  </div>
                )}
              </div>

              {product.imageUrl ? (
                <div className="space-y-4">
                  <div>
                    <h4 className="font-medium mb-2">Next.js Image Component:</h4>
                    <div className="relative w-64 h-64 bg-gray-100 border">
                      <Image
                        src={product.imageUrl}
                        alt={product.title}
                        fill
                        className="object-contain"
                        onError={(e) => {
                          console.error('Image failed to load:', product.imageUrl);
                          (e.target as HTMLImageElement).style.display = 'none';
                        }}
                      />
                    </div>
                  </div>

                  <div>
                    <h4 className="font-medium mb-2">Raw img tag (for comparison):</h4>
                    <img
                      src={product.imageUrl}
                      alt={product.title}
                      className="w-64 h-64 object-contain bg-gray-100 border"
                      onError={(e) => {
                        console.error('Raw img failed:', product.imageUrl);
                        (e.target as HTMLImageElement).style.display = 'none';
                      }}
                    />
                  </div>
                </div>
              ) : (
                <div className="text-red-500">No image URL in database</div>
              )}
            </div>
          ))}
        </div>
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold mb-4">Bundle Product Images</h2>
        <div className="space-y-6">
          {bundles.map((bundle) => (
            <div key={bundle.id} className="border p-4 rounded">
              <h3 className="font-semibold mb-2">{bundle.seoTitle}</h3>
              <div className="space-y-4">
                {bundle.giftIdeas.slice(0, 1).map((idea) =>
                  idea.products.slice(0, 2).map((product) => (
                    <div key={product.id} className="border-l-4 border-blue-500 pl-4">
                      <div className="text-sm mb-2">
                        <strong>Product:</strong> {product.title.substring(0, 60)}...
                      </div>
                      <div className="text-sm mb-2 bg-gray-100 p-2 rounded break-all">
                        <strong>URL:</strong> {product.imageUrl || '(empty)'}
                      </div>
                      {product.imageUrl && (
                        <>
                          <div className="text-sm mb-2">
                            <strong>Domain:</strong> {new URL(product.imageUrl).hostname}
                          </div>
                          <div className="relative w-48 h-48 bg-gray-100 border">
                            <Image
                              src={product.imageUrl}
                              alt={product.title}
                              fill
                              className="object-contain"
                            />
                          </div>
                        </>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-2xl font-semibold mb-4">Configuration Info</h2>
        <div className="bg-gray-100 p-4 rounded">
          <pre className="text-xs overflow-auto">
            {JSON.stringify(
              {
                nodeEnv: process.env.NODE_ENV,
                nextImageDomains: 'Check next.config.ts for remotePatterns',
              },
              null,
              2
            )}
          </pre>
        </div>
      </section>
    </div>
  );
}
