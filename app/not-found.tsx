import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-pink-50 to-orange-50 flex items-center justify-center px-4">
      <div className="text-center">
        <h1 className="text-6xl font-bold text-gray-800 mb-4">404</h1>
        <h2 className="text-2xl font-semibold text-gray-700 mb-4">
          Gift Ideas Not Found
        </h2>
        <p className="text-gray-600 mb-8 max-w-md mx-auto">
          Looks like this gift idea page doesn&apos;t exist or has been removed.
          Why not create your own hilarious gift ideas?
        </p>
        <Link
          href="/"
          className="inline-block bg-gradient-to-r from-purple-600 to-pink-600 text-white font-bold px-8 py-3 rounded-lg hover:from-purple-700 hover:to-pink-700 transition-all shadow-lg"
        >
          Go to Homepage
        </Link>
      </div>
    </div>
  );
}
