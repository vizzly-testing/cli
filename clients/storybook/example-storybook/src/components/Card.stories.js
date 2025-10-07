import { Card } from './Card.jsx';

export default {
  title: 'Components/Card',
  component: Card,
};

export let Default = {
  args: {
    title: 'Welcome',
    content: 'This is a simple card component for displaying content.',
  },
};

export let LongContent = {
  args: {
    title: 'Long Content Card',
    content:
      'This card has much longer content to test how the component handles text wrapping and layout with more information displayed.',
  },
};
