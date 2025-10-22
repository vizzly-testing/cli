import { useState, useCallback } from 'react';
import { acceptBaseline } from '../services/api-client.js';
import { useToast } from '../components/ui/toast.jsx';

export default function useBaselineActions(onUpdate) {
  let [loadingStates, setLoadingStates] = useState({});
  let { addToast } = useToast();

  let accept = useCallback(
    async comparisonId => {
      setLoadingStates(prev => ({ ...prev, [comparisonId]: 'accepting' }));

      try {
        await acceptBaseline(comparisonId);

        // Update comparison status to passed instead of removing
        if (onUpdate) {
          onUpdate(prevData => ({
            ...prevData,
            comparisons: prevData.comparisons.map(c =>
              c.id === comparisonId
                ? { ...c, status: 'passed', diffPercentage: 0, diff: null }
                : c
            ),
          }));
        }

        setLoadingStates(prev => {
          let next = { ...prev };
          delete next[comparisonId];
          return next;
        });
      } catch (err) {
        console.error('Failed to accept baseline:', err);
        addToast('Failed to accept baseline. Please try again.', 'error');
        setLoadingStates(prev => {
          let next = { ...prev };
          delete next[comparisonId];
          return next;
        });
      }
    },
    [onUpdate, addToast]
  );

  let reject = useCallback(
    comparisonId => {
      setLoadingStates(prev => ({ ...prev, [comparisonId]: 'rejected' }));

      if (onUpdate) {
        onUpdate(prevData => ({
          ...prevData,
          comparisons: prevData.comparisons.map(c =>
            c.id === comparisonId ? { ...c, userAction: 'rejected' } : c
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
