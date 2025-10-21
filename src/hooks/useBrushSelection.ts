import { useMemo } from 'react';
import { useBrushStore } from '@/stores/brushStore';

/**
 * Shared hook for accessing active brush selection
 * Reusable across all chart components
 */
export const useBrushSelection = () => {
  const allSelections = useBrushStore((state) => state.selections);
  const activeDatasetId = useBrushStore((state) => state.activeDatasetId);

  const activeBrushSelection = useMemo(() => {
    if (!activeDatasetId) return null;
    return allSelections.get(activeDatasetId) || null;
  }, [allSelections, activeDatasetId]);

  return activeBrushSelection;
};
