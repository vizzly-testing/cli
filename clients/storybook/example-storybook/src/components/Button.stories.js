import { Button } from './Button.jsx';

export default {
  title: 'Components/Button',
  component: Button,
  parameters: {
    vizzly: {
      viewports: [
        { name: 'mobile', width: 375, height: 667 },
        { name: 'desktop', width: 1920, height: 1080 },
      ],
    },
  },
};

export let Primary = {
  args: {
    label: 'Primary Button',
    variant: 'primary',
  },
};

export let Secondary = {
  args: {
    label: 'Secondary Button',
    variant: 'secondary',
  },
};

export let Danger = {
  args: {
    label: 'Danger Button',
    variant: 'danger',
  },
};
