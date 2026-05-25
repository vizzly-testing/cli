/**
 * BrowserIcon Component
 * BearDen Design System
 *
 * Displays browser logos using the browser-logos CDN.
 * Falls back to a generic globe icon for unknown browsers.
 */

import { GlobeAltIcon } from '@heroicons/react/24/outline';

let BROWSER_LOGOS_CDN =
  'https://cdnjs.cloudflare.com/ajax/libs/browser-logos/75.0.1';

/**
 * Map browser names to their CDN logo paths
 */
function getBrowserLogoUrl(browserName) {
  switch (browserName) {
    case 'chrome':
      return `${BROWSER_LOGOS_CDN}/chrome/chrome.svg`;
    case 'firefox':
      return `${BROWSER_LOGOS_CDN}/firefox/firefox.svg`;
    case 'safari':
      return `${BROWSER_LOGOS_CDN}/safari/safari.svg`;
    case 'safari-ios':
    case 'safari_ios':
    case 'ios':
    case 'mobile safari':
      return `${BROWSER_LOGOS_CDN}/safari-ios/safari-ios.svg`;
    case 'edge':
      return `${BROWSER_LOGOS_CDN}/edge/edge.svg`;
    case 'opera':
      return `${BROWSER_LOGOS_CDN}/opera/opera.svg`;
    case 'brave':
      return `${BROWSER_LOGOS_CDN}/brave/brave.svg`;
    case 'vivaldi':
      return `${BROWSER_LOGOS_CDN}/vivaldi/vivaldi.svg`;
    case 'chromium':
      return `${BROWSER_LOGOS_CDN}/chromium/chromium.svg`;
    case 'webkit':
      return `${BROWSER_LOGOS_CDN}/webkit/webkit.svg`;
    case 'samsung':
    case 'samsung internet':
    case 'samsung-internet':
      return `${BROWSER_LOGOS_CDN}/samsung-internet/samsung-internet.svg`;
    case 'chrome-android':
    case 'chrome_android':
    case 'android chrome':
      return `${BROWSER_LOGOS_CDN}/chrome/chrome.svg`;
    case 'firefox-android':
    case 'firefox_android':
    case 'android firefox':
      return `${BROWSER_LOGOS_CDN}/firefox/firefox.svg`;
    case 'android':
    case 'android browser':
      return `${BROWSER_LOGOS_CDN}/android/android.svg`;
    case 'ie':
    case 'internet explorer':
      return `${BROWSER_LOGOS_CDN}/archive/internet-explorer_9-11/internet-explorer_9-11.svg`;
    case 'tor':
      return `${BROWSER_LOGOS_CDN}/tor/tor.svg`;
    case 'duckduckgo':
      return `${BROWSER_LOGOS_CDN}/duckduckgo/duckduckgo.svg`;
    case 'yandex':
      return `${BROWSER_LOGOS_CDN}/yandex/yandex.svg`;
    case 'uc':
    case 'uc browser':
      return `${BROWSER_LOGOS_CDN}/uc/uc.svg`;
    default:
      return null;
  }
}

/**
 * Get text color class for a browser (useful for text labels)
 */
export function getBrowserColor(browser) {
  switch (browser?.toLowerCase()) {
    case 'chrome':
    case 'chrome-android':
    case 'chrome_android':
    case 'android chrome':
      return 'text-[var(--accent-media)]';
    case 'firefox':
    case 'firefox-android':
    case 'firefox_android':
    case 'android firefox':
      return 'text-[var(--accent-brand)]';
    case 'safari':
    case 'safari-ios':
    case 'safari_ios':
    case 'ios':
    case 'mobile safari':
      return 'text-[var(--text-tertiary)]';
    case 'edge':
      return 'text-[var(--accent-media)]';
    case 'opera':
      return 'text-[var(--accent-danger)]';
    case 'brave':
      return 'text-[var(--accent-brand)]';
    case 'vivaldi':
      return 'text-[var(--accent-danger)]';
    case 'chromium':
    case 'webkit':
      return 'text-[var(--accent-info)]';
    case 'samsung':
    case 'samsung internet':
    case 'samsung-internet':
      return 'text-[var(--accent-media)]';
    case 'android':
    case 'android browser':
      return 'text-[var(--accent-success)]';
    default:
      return 'text-[var(--text-tertiary)]';
  }
}

/**
 * BrowserIcon component
 *
 * @param {string} browser - Browser name (chrome, firefox, safari, etc.)
 * @param {string} className - CSS classes for sizing (default: 'w-4 h-4')
 * @param {string} fallbackClassName - Additional classes for the fallback icon
 */
export function BrowserIcon({
  browser,
  className = 'w-4 h-4',
  fallbackClassName = '',
}) {
  if (!browser) {
    return null;
  }

  let browserLower = browser.toLowerCase();
  let logoUrl = getBrowserLogoUrl(browserLower);

  if (logoUrl) {
    return (
      <img
        src={logoUrl}
        alt={`${browser} browser`}
        className={className}
        title={browser}
        onError={e => {
          // Fallback to generic icon if CDN fails
          e.target.style.display = 'none';
          e.target.nextSibling?.style.removeProperty('display');
        }}
      />
    );
  }

  // Fallback for unknown browsers
  return (
    <>
      <img style={{ display: 'none' }} alt="" />
      <GlobeAltIcon
        className={`${className} ${fallbackClassName}`}
        title={browser || 'Unknown browser'}
      />
    </>
  );
}
