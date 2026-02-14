import { QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import ReactDOM from 'react-dom/client';
import AppRouter from './components/app-router.jsx';
import { ToastProvider } from './components/ui/toast.jsx';
import { queryClient } from './lib/query-client.js';
import { SSEProvider } from './providers/sse-provider.jsx';
import './reporter.css';

let initializeReporter = () => {
  let root = document.getElementById('vizzly-reporter-root');

  if (!root) {
    root = document.createElement('div');
    root.id = 'vizzly-reporter-root';
    document.body.appendChild(root);
  }

  ReactDOM.createRoot(root).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <SSEProvider>
          <ToastProvider>
            <AppRouter />
          </ToastProvider>
        </SSEProvider>
      </QueryClientProvider>
    </StrictMode>
  );
};

// Initialize immediately if DOM is already loaded, otherwise wait
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeReporter);
} else {
  initializeReporter();
}
