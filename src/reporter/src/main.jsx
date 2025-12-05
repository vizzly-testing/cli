import { QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import ReactDOM from 'react-dom/client';
import AppRouter from './components/app-router.jsx';
import { ToastProvider } from './components/ui/toast.jsx';
import { queryClient } from './lib/query-client.js';
import './reporter.css';

const initializeReporter = () => {
  let root = document.getElementById('vizzly-reporter-root');

  if (!root) {
    root = document.createElement('div');
    root.id = 'vizzly-reporter-root';
    document.body.appendChild(root);
  }

  // Get initial data from window or fetch from API
  const initialData = window.VIZZLY_REPORTER_DATA || null;

  ReactDOM.createRoot(root).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <AppRouter initialData={initialData} />
        </ToastProvider>
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
