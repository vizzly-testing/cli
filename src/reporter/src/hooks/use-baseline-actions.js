import { useState, useCallback } from 'react';
import { acceptBaseline } from '../services/api-client.js';
import { useToast } from '../components/ui/toast.jsx';

export default function useBaselineActions(onUpdate) {
  let [loadingStates, setLoadingStates] = useState({});
  let { addToast } = useToast();

  let accept = useCallback(
    async screenshotName => {
      setLoadingStates(prev => ({ ...prev, [screenshotName]: 'accepting' }));

      try {
        await acceptBaseline(screenshotName);

        // Update comparison status to passed instead of removing
        if (onUpdate) {
          onUpdate(prevData => ({
            ...prevData,
            comparisons: prevData.comparisons.map(c =>
              c.name === screenshotName
                ? { ...c, status: 'passed', diffPercentage: 0, diff: null }
                : c
            ),
          }));
        }

        setLoadingStates(prev => {
          let next = { ...prev };
          delete next[screenshotName];
          return next;
        });
      } catch (err) {
        console.error('Failed to accept baseline:', err);
        addToast('Failed to accept baseline. Please try again.', 'error');
        setLoadingStates(prev => {
          let next = { ...prev };
          delete next[screenshotName];
          return next;
        });
      }
    },
    [onUpdate]
  );

  let reject = useCallback(
    screenshotName => {
      setLoadingStates(prev => ({ ...prev, [screenshotName]: 'rejected' }));

      if (onUpdate) {
        onUpdate(prevData => ({
          ...prevData,
          comparisons: prevData.comparisons.map(c =>
            c.name === screenshotName ? { ...c, userAction: 'rejected' } : c
          ),
        }));
      }
    },
    [onUpdate]
  );

  return {
    accept,
    reject,
    loadingStates,
  };
}
