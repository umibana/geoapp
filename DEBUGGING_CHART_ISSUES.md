# Debugging Chart Components - Empty Charts Issue

## What I Added

I've added comprehensive logging to help debug why the charts are appearing empty:

### Components Updated with Logging:

1. **[BrushedBarChart.tsx](src/components/chart-components/BrushedBarChart.tsx)** - Lines 18-40, 124
2. **[BrushedBoxPlot.tsx](src/components/chart-components/BrushedBoxPlot.tsx)** - Lines 18-39, 155
3. **[BrushedHeatmap.tsx](src/components/chart-components/BrushedHeatmap.tsx)** - Lines 18-39, 128

### Logging Added:

Each component now logs:
1. **Component render** - When the component renders
2. **Brush selection presence** - Whether there's an active brush selection
3. **Statistics structure** - Full statistics object
4. **Data availability** - Whether specific data (histograms, boxPlots, heatmap) exists
5. **Data details** - Count of items (bins, columns, cells)
6. **chartOptions result** - Whether chart options were successfully generated

### Visual Feedback Added:

All three components now show a clear message when `chartOptions` is null:
```
⚠️ No chart data available. Check console for details.
```

## How to Debug

### Step 1: Make a Brush Selection
1. Go to DatasetViewer
2. Enable brush mode (click "Modo Dibujo")
3. Draw a rectangle on the scatter plot
4. Click "✓ Aplicar Selección"
5. **Watch the console** for logs from DatasetViewer:
   ```
   ✅ Backend filtering completed in XXXms
   📊 Filtered to XXX points
   📊 Response statistics: {
     hasHistograms: true/false,
     histogramKeys: [...],
     hasBoxPlots: true/false,
     boxPlotsCount: X,
     hasHeatmap: true/false
   }
   ```

### Step 2: View Charts in Mosaic Demo
1. Navigate to `/mosaic-demo`
2. **Watch the console** for logs from each chart component

### Expected Console Output for Each Chart:

#### BrushedBarChart:
```
🔍 BrushedBarChart: Checking for statistics
📊 activeBrushSelection: {datasetId: "...", statistics: {...}}
📊 Has statistics? true
📊 Has histograms? true
📈 Looking for histogram for column: z
📊 Available histograms: ['x', 'y', 'z']
✅ Histogram found with 30 bins
📊 Total count: 1000
📈 BrushedBarChart render - chartOptions: true
```

#### BrushedBoxPlot:
```
🔍 BrushedBoxPlot: Checking for statistics
📊 activeBrushSelection: {datasetId: "...", statistics: {...}}
📊 Has statistics? true
📊 Has boxPlots? true
📊 Box plots array: [{column_name: "x", ...}, ...]
📊 Box plots length: 3
✅ Box plots found: 3 columns
📈 BrushedBoxPlot render - chartOptions: true
```

#### BrushedHeatmap:
```
🔍 BrushedHeatmap: Checking for statistics
📊 activeBrushSelection: {datasetId: "...", statistics: {...}}
📊 Has statistics? true
📊 Has heatmap? true
📊 Heatmap object: {cells: [...], grid_size_x: 50, ...}
📊 Heatmap cells count: 2500
✅ Heatmap found with 2500 cells
📈 BrushedHeatmap render - chartOptions: true
```

### Step 3: Identify the Issue

Look for these specific log patterns:

#### Issue 1: No Statistics at All
```
📊 activeBrushSelection: {datasetId: "...", statistics: undefined}
📊 Has statistics? false
❌ No statistics or histograms found
```
**Cause**: DatasetViewer didn't populate statistics when creating brush selection
**Fix**: Check DatasetViewer.tsx line 447-453 - statistics should be populated from response

#### Issue 2: Statistics Exist But Data is Empty
```
📊 Has statistics? true
📊 Has histograms? true
📊 Available histograms: []
❌ Histogram not found or empty for column: z
```
**Cause**: Backend computed statistics but returned empty arrays
**Fix**: Check backend logs to see if computation methods are being called

#### Issue 3: Data Type Mismatch
```
📊 Available histograms: ['x', 'y', 'z']
📈 Looking for histogram for column: value_column
❌ Histogram not found or empty for column: value_column
```
**Cause**: Column name mismatch between frontend and backend
**Fix**: Verify column names match exactly

#### Issue 4: Statistics Not Populated from Response
```javascript
// In DatasetViewer console:
📊 Response statistics: {
  hasHistograms: false,  // ❌ Should be true!
  histogramKeys: [],
  hasBoxPlots: false,    // ❌ Should be true!
  boxPlotsCount: 0,
  hasHeatmap: false      // ❌ Should be true!
}
```
**Cause**: Backend not computing statistics or gRPC response not including them
**Fix**: Check backend/project_manager.py get_dataset_data() method

## Quick Diagnostic Checklist

Run through this checklist using the console logs:

- [ ] **Backend Response Has Statistics** - DatasetViewer logs show `hasHistograms: true`, `hasBoxPlots: true`, `hasHeatmap: true`
- [ ] **Statistics Stored in Zustand** - Chart components receive `activeBrushSelection.statistics`
- [ ] **Histogram Data Present** - BrushedBarChart logs show `Available histograms: ['x', 'y', 'z']`
- [ ] **Box Plot Data Present** - BrushedBoxPlot logs show `Box plots length: 3`
- [ ] **Heatmap Data Present** - BrushedHeatmap logs show `Heatmap cells count: 2500`
- [ ] **Chart Options Generated** - All charts log `chartOptions: true`

If all checkboxes pass, charts should render correctly.

## Common Issues and Solutions

### Issue: "No statistics or histograms found"

**Symptom**: Chart shows "⚠️ No chart data available"
**Console**: `❌ No statistics or histograms found`

**Solutions**:
1. Check if you made a brush selection (go to DatasetViewer first)
2. Check DatasetViewer console for "Response statistics" log
3. If backend response has statistics, check line 447 in DatasetViewer.tsx

### Issue: "Histogram not found for column: X"

**Symptom**: Chart shows "⚠️ No chart data available"
**Console**: `❌ Histogram not found or empty for column: z`

**Solutions**:
1. Check console for "Available histograms:" - see what columns are actually there
2. Verify backend computed histogram for the correct columns
3. Check column name spelling matches exactly

### Issue: Backend not computing statistics

**Symptom**: DatasetViewer logs show all false:
```
📊 Response statistics: {
  hasHistograms: false,
  hasBoxPlots: false,
  hasHeatmap: false
}
```

**Solutions**:
1. Check backend logs for errors during computation
2. Verify backend/project_manager.py get_dataset_data() is calling compute_* methods
3. Check backend/database.py compute_histogram(), compute_boxplot(), compute_heatmap() methods
4. Verify Protocol Buffer response includes statistics fields

## Next Steps

1. **Run the app**: `npm run dev`
2. **Make a brush selection** in DatasetViewer
3. **Navigate to mosaic demo**: `/mosaic-demo`
4. **Copy all console output** and share it

The logs will tell us exactly where the problem is:
- If statistics aren't in the response → backend issue
- If statistics are in response but not in Zustand → DatasetViewer issue
- If statistics are in Zustand but charts don't render → chart component issue

Share the console output and we'll know exactly what's wrong!
