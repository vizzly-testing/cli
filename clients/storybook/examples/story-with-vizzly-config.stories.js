/**
 * Example Storybook story with Vizzly configuration
 * Shows how to configure per-story settings
 */

export default {
  title: 'Button',
  component: Button,
};

// Story with custom viewports
export let Primary = {
  args: {
    label: 'Click me',
    variant: 'primary',
  },
  parameters: {
    vizzly: {
      // Only capture mobile and desktop for this story
      viewports: [
        { name: 'mobile', width: 375, height: 667 },
        { name: 'desktop', width: 1920, height: 1080 },
      ],
    },
  },
};

// Story with interaction hook
export let WithTooltip = {
  args: {
    label: 'Hover me',
  },
  parameters: {
    vizzly: {
      // Custom interaction before screenshot
      beforeScreenshot: async page => {
        await page.hover('button');
        await page.waitForSelector('.tooltip', { visible: true });
      },
    },
  },
};

// Story to skip
export let Deprecated = {
  args: {
    label: 'Old Button',
  },
  // Don't capture screenshots for this story
  tags: ['vizzly-skip'],
};

// Story with full page screenshot
export let LongContent = {
  args: {
    label: 'Scroll down',
  },
  parameters: {
    vizzly: {
      screenshot: {
        fullPage: true, // Capture entire scrollable page
      },
    },
  },
};

// Story with multiple configurations
export let Interactive = {
  args: {
    label: 'Interactive',
  },
  parameters: {
    vizzly: {
      viewports: [{ name: 'mobile', width: 375, height: 667 }],
      beforeScreenshot: async page => {
        // Click the button to show active state
        await page.click('button');
        await page.waitForTimeout(300); // Wait for animation
      },
      screenshot: {
        omitBackground: true, // Transparent background
      },
    },
  },
};
