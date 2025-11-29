import { useState } from 'react';
import { ClockIcon, BookOpenIcon } from '@heroicons/react/24/outline';
import CodeBlock from './code-block.jsx';

let frameworks = [
  {
    id: 'playwright',
    name: 'Playwright',
    code: `import { vizzlyScreenshot } from '@vizzly-testing/cli/client';

test('homepage', async ({ page }) => {
  await page.goto('/');
  const screenshot = await page.screenshot();
  await vizzlyScreenshot('homepage', screenshot);
});`,
  },
  {
    id: 'vitest',
    name: 'Vitest',
    code: `// Uses native Vitest browser mode API
import { expect, test } from 'vitest';
import { page } from '@vitest/browser/context';

test('homepage', async () => {
  await page.goto('/');
  await expect(page).toMatchScreenshot('homepage.png');
});`,
  },
  {
    id: 'cypress',
    name: 'Cypress',
    code: `import { vizzlyScreenshot } from '@vizzly-testing/cli/client';

it('homepage', () => {
  cy.visit('/');
  cy.screenshot().then((screenshot) => {
    vizzlyScreenshot('homepage', screenshot);
  });
});`,
  },
  {
    id: 'puppeteer',
    name: 'Puppeteer',
    code: `import { vizzlyScreenshot } from '@vizzly-testing/cli/client';

test('homepage', async () => {
  await page.goto('http://localhost:3000');
  const screenshot = await page.screenshot();
  await vizzlyScreenshot('homepage', screenshot);
});`,
  },
  {
    id: 'ruby',
    name: 'Ruby',
    code: `require 'vizzly'

RSpec.describe 'Homepage' do
  it 'looks correct' do
    visit '/'
    screenshot = page.driver.browser.screenshot_as(:png)
    Vizzly.screenshot('homepage', screenshot)
  end
end`,
  },
  {
    id: 'ios',
    name: 'iOS',
    code: `import XCTest
import Vizzly

class VisualTests: XCTestCase {
  func testHomepage() {
    let app = XCUIApplication()
    app.launch()

    let screenshot = app.screenshot().pngRepresentation
    Vizzly.screenshot("homepage", screenshot)
  }
}`,
  },
  {
    id: 'storybook',
    name: 'Storybook',
    code: `# No code changes needed!
# Just run the CLI against your Storybook build:

npm run build-storybook
npx vizzly storybook ./storybook-static`,
  },
];

export default function WaitingForScreenshots() {
  let [activeFramework, setActiveFramework] = useState('playwright');
  let currentFramework = frameworks.find(f => f.id === activeFramework);

  return (
    <div className="flex flex-col items-center justify-center py-12 px-6">
      <div className="max-w-2xl w-full">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-amber-500/10 flex items-center justify-center mx-auto mb-5">
            <ClockIcon className="w-8 h-8 text-amber-400" />
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">
            Waiting for Screenshots
          </h1>
          <p className="text-slate-400">
            Run your tests to start capturing visual comparisons
          </p>
          <div className="mt-4 flex items-center justify-center gap-2 text-sm text-slate-500">
            <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
            Listening for screenshots...
          </div>
        </div>

        {/* Framework Tabs */}
        <div className="vz-card overflow-hidden">
          <div className="border-b border-slate-700/50 px-4 pt-4">
            <div className="flex items-center gap-1 overflow-x-auto scrollbar-hide -mb-px">
              {frameworks.map(framework => (
                <button
                  key={framework.id}
                  onClick={() => setActiveFramework(framework.id)}
                  className={`px-4 py-2.5 text-sm font-medium rounded-t-lg transition-colors whitespace-nowrap ${
                    activeFramework === framework.id
                      ? 'bg-slate-800 text-white border-t border-x border-slate-700/50'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
                  }`}
                >
                  {framework.name}
                </button>
              ))}
            </div>
          </div>

          <div className="p-4">
            <CodeBlock code={currentFramework?.code || ''} />
          </div>
        </div>

        {/* Docs Link */}
        <div className="mt-6 text-center">
          <a
            href="https://docs.vizzly.dev/"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-amber-400 transition-colors"
          >
            <BookOpenIcon className="w-4 h-4" />
            View full documentation
          </a>
        </div>
      </div>
    </div>
  );
}
