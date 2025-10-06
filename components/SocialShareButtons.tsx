'use client';

interface SocialShareButtonsProps {
  url: string;
  title: string;
  description: string;
  slug: string;
}

export function SocialShareButtons({ url, title, description, slug }: SocialShareButtonsProps) {
  const shareText = `${title} - ${description}`;

  const handleShare = async (platform: 'twitter' | 'facebook' | 'pinterest') => {
    // Track share event
    try {
      await fetch('/api/track-share', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, platform }),
      });
    } catch (error) {
      console.error('Error tracking share:', error);
    }

    // Open share dialog
    let shareUrl = '';
    switch (platform) {
      case 'twitter':
        shareUrl = `https://twitter.com/intent/tweet?url=${encodeURIComponent(url)}&text=${encodeURIComponent(shareText)}`;
        break;
      case 'facebook':
        shareUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`;
        break;
      case 'pinterest':
        shareUrl = `https://pinterest.com/pin/create/button/?url=${encodeURIComponent(url)}&description=${encodeURIComponent(shareText)}`;
        break;
    }

    window.open(shareUrl, '_blank', 'width=600,height=400');
  };

  return (
    <div className="flex items-center gap-3">
      <span className="text-sm text-zinc-600 font-medium">Share:</span>

      {/* Twitter */}
      <button
        onClick={() => handleShare('twitter')}
        className="flex items-center gap-2 px-3 py-2 bg-[#1DA1F2] text-white rounded-lg hover:bg-[#1a8cd8] transition-colors text-sm font-medium"
        aria-label="Share on Twitter"
      >
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
        </svg>
        Tweet
      </button>

      {/* Facebook */}
      <button
        onClick={() => handleShare('facebook')}
        className="flex items-center gap-2 px-3 py-2 bg-[#1877F2] text-white rounded-lg hover:bg-[#166fe5] transition-colors text-sm font-medium"
        aria-label="Share on Facebook"
      >
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
          <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
        </svg>
        Share
      </button>

      {/* Pinterest */}
      <button
        onClick={() => handleShare('pinterest')}
        className="flex items-center gap-2 px-3 py-2 bg-[#E60023] text-white rounded-lg hover:bg-[#d50020] transition-colors text-sm font-medium"
        aria-label="Share on Pinterest"
      >
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
          <path d="M12 0a12 12 0 0 0-4.37 23.17c-.07-.63-.13-1.6.03-2.29l1.15-4.88s-.29-.59-.29-1.45c0-1.36.79-2.38 1.77-2.38.83 0 1.24.63 1.24 1.38 0 .84-.53 2.1-.81 3.26-.23.98.49 1.77 1.46 1.77 1.75 0 3.1-1.85 3.1-4.51 0-2.36-1.69-4-4.11-4-2.8 0-4.45 2.1-4.45 4.28 0 .85.33 1.76.74 2.25.08.1.09.19.07.29l-.28 1.14c-.04.18-.15.22-.34.13-1.23-.57-2-2.36-2-3.8 0-3.09 2.25-5.93 6.48-5.93 3.4 0 6.05 2.43 6.05 5.67 0 3.38-2.13 6.1-5.09 6.1-.99 0-1.93-.52-2.25-1.13l-.61 2.33c-.22.85-.82 1.92-1.22 2.57.92.28 1.9.44 2.91.44 6.627 0 12-5.373 12-12S18.627 0 12 0z"/>
        </svg>
        Pin
      </button>
    </div>
  );
}
