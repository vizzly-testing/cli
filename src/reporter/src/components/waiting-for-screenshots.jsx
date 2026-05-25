import { BookOpenIcon, ClockIcon } from '@heroicons/react/24/outline';
import { useState } from 'react';
import CodeBlock from './code-block.jsx';

const frameworks = [
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

pnpm run build-storybook
pnpm exec vizzly storybook ./storybook-static`,
  },
];

export default function WaitingForScreenshots() {
  const [activeFramework, setActiveFramework] = useState('playwright');
  const currentFramework = frameworks.find(f => f.id === activeFramework);

  return (
    <div className="flex flex-col items-center justify-center py-12 px-6">
      <div className="max-w-2xl w-full">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-[var(--accent-warning-muted)] flex items-center justify-center mx-auto mb-5">
            <ClockIcon className="w-8 h-8 text-[var(--accent-warning)]" />
          </div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)] mb-2">
            Waiting for Screenshots
          </h1>
          <p className="text-[var(--text-tertiary)]">
            Run your tests to start capturing visual comparisons
          </p>
          <div className="mt-4 flex items-center justify-center gap-2 text-sm text-[var(--text-muted)]">
            <div className="w-2 h-2 rounded-full bg-[var(--accent-brand)] animate-pulse" />
            Listening for screenshots...
          </div>
        </div>

        {/* Framework Tabs */}
        <div className="vz-card overflow-hidden">
          <div className="border-b border-[var(--vz-border-subtle)] px-4 pt-4">
            <div className="flex items-center gap-1 overflow-x-auto scrollbar-hide -mb-px">
              {frameworks.map(framework => (
                <button
                  type="button"
                  key={framework.id}
                  onClick={() => setActiveFramework(framework.id)}
                  className={`px-4 py-2.5 text-sm font-medium rounded-t-lg transition-colors whitespace-nowrap ${
                    activeFramework === framework.id
                      ? 'bg-[var(--vz-raised)] text-[var(--text-primary)] border-t border-x border-[var(--vz-border-subtle)]'
                      : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--vz-raised)]'
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
            className="inline-flex items-center gap-2 text-sm text-[var(--text-tertiary)] hover:text-[var(--accent-warning)] transition-colors"
          >
            <BookOpenIcon className="w-4 h-4" />
            View full documentation
          </a>
        </div>
      </div>
    </div>
  );
}
