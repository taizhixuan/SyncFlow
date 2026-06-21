import type { Preview } from '@storybook/react-vite';
// Pull in the app's Tailwind entry so stories render with real design tokens.
import '../src/styles/index.css';

const preview: Preview = {
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
  },
};

export default preview;
