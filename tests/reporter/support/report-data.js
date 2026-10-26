import { readFileSync } from 'node:fs';

export let comparisonIds = {
  pricing: 'pricing-page-firefox-1920x1080',
  checkout: 'checkout-form-safari-1280x720',
  new: 'dashboard-widget-chrome-1920x1080',
};

export function reportFixture(name = 'mixed-state') {
  return JSON.parse(
    readFileSync(new URL(`../fixtures/${name}.json`, import.meta.url), 'utf8')
  );
}

export function reviewFixture() {
  let data = reportFixture();
  let pricing = data.comparisons.find(
    item => item.id === comparisonIds.pricing
  );
  pricing.diffClusters = [
    {
      boundingBox: { x: 200, y: 300, width: 1000, height: 100 },
      pixelCount: 5000,
    },
    {
      boundingBox: { x: 400, y: 2800, width: 600, height: 90 },
      pixelCount: 900,
    },
  ];
  pricing.diffCount = 5900;
  pricing.properties.metadata = { component: 'PricingCard' };
  pricing.properties.suite = 'Checkout';
  pricing.properties.url = 'https://example.test/pricing';
  let checkout = data.comparisons.find(
    item => item.id === comparisonIds.checkout
  );
  checkout.properties = {
    browser: 'safari',
    viewport_width: 1280,
    viewport_height: 720,
  };
  data.comparisons.push({
    ...pricing,
    id: 'pricing-page-chromium-1920x1080',
    properties: { ...pricing.properties, browser: 'chromium' },
  });
  return data;
}
