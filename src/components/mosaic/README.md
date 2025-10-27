# Mosaic Layout System

A generic, developer-friendly window management system for React applications. Built on top of [react-mosaic-component](https://github.com/nomcopter/react-mosaic), this provides an easy-to-use API for creating flexible, resizable dashboard layouts.

## Features

- **Simple API** - Just register your components and go!
- **Type-Safe** - Full TypeScript support
- **Auto-Layout** - Automatically creates balanced layouts
- **Drag & Drop** - Repositionable windows
- **Resizable Panes** - User-controlled sizing
- **Custom Controls** - Easy toolbar customization
- **Theme Integration** - Works with Tailwind/shadcn
- **Layout Persistence** - Save layouts to localStorage
- **Shared State** - Works seamlessly with Zustand

## Quick Start

### Basic Usage

```tsx
import { MosaicLayout } from '@/components/mosaic';
import MyChart from './MyChart';

function Dashboard() {
  return (
    <MosaicLayout
      components={{
        'my-chart': {
          id: 'my-chart',
          title: 'My Chart',
          component: MyChart,
        },
      }}
    />
  );
}
```

### Multiple Components

```tsx
import { MosaicLayout } from '@/components/mosaic';
import { BarChart3, LineChart } from 'lucide-react';

const components = {
  'bar-chart': {
    id: 'bar-chart',
    title: 'Bar Chart',
    component: BrushedBarChart,
    icon: <BarChart3 className="h-4 w-4" />,
  },
  'line-chart': {
    id: 'line-chart',
    title: 'Line Chart',
    component: BrushedLineChart,
    icon: <LineChart className="h-4 w-4" />,
  },
  'heatmap': {
    id: 'heatmap',
    title: 'Heatmap',
    component: BrushedHeatmap,
  },
};

function Dashboard() {
  return <MosaicLayout components={components} />;
}
```

## Custom Initial Layout

By default, MosaicLayout creates a balanced layout. You can customize it:

```tsx
const customLayout = {
  direction: 'row',
  first: 'chart-1',
  second: {
    direction: 'column',
    first: 'chart-2',
    second: 'chart-3',
    splitPercentage: 60, // 60/40 split
  },
  splitPercentage: 50, // 50/50 split
};

<MosaicLayout
  components={components}
  initialLayout={customLayout}
/>
```

## Advanced Features

### Layout Persistence

Save user layouts to localStorage:

```tsx
import { AdvancedMosaicLayout } from '@/components/mosaic';

<AdvancedMosaicLayout
  components={components}
  persistLayout={true}
  persistKey="my-dashboard"
/>
```

### Custom Toolbar Controls

Add custom buttons to specific windows:

```tsx
import { Settings } from 'lucide-react';
import { AdditionalControlsButton } from '@/components/mosaic';

const components = {
  'my-chart': {
    id: 'my-chart',
    title: 'My Chart',
    component: MyChart,
    toolbarControls: [
      <AdditionalControlsButton
        key="settings"
        icon={<Settings className="h-4 w-4" />}
        tooltip="Chart Settings"
        onClick={() => console.log('Settings clicked')}
      />,
      <ExpandButton key="expand" />,
      <CloseButton key="close" />,
    ],
  },
};
```

### Component Props

Pass props to your components:

```tsx
const components = {
  'chart': {
    id: 'chart',
    title: 'Sales Chart',
    component: MyChart,
    props: {
      dataSource: 'sales',
      refreshInterval: 5000,
    },
  },
};
```

### Dynamic Titles

Use functions for dynamic titles:

```tsx
const components = {
  'chart': {
    id: 'chart',
    title: (props) => `Chart - ${props?.dataSource || 'Unknown'}`,
    component: MyChart,
    props: { dataSource: 'revenue' },
  },
};
```

### Non-Closable Windows

Prevent specific windows from being closed:

```tsx
const components = {
  'main-chart': {
    id: 'main-chart',
    title: 'Main Chart',
    component: MainChart,
    closable: false, // Can't be closed
  },
};
```

## API Reference

### MosaicLayout Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `components` | `Record<string, MosaicComponentConfig>` | **required** | Component registry |
| `initialLayout` | `MosaicNode<string> \| null` | auto-balanced | Initial layout structure |
| `emptyState` | `ReactNode` | default message | Custom empty state |
| `mosaicId` | `string` | `'mosaic-layout'` | Unique ID for drag-drop |
| `className` | `string` | `''` | Custom CSS class |
| `onChange` | `(node) => void` | - | Layout change callback |

### MosaicComponentConfig

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `id` | `string` | ✅ | Unique component ID |
| `title` | `string \| function` | ✅ | Window title |
| `component` | `ComponentType` | ✅ | React component |
| `props` | `any` | ❌ | Props for component |
| `icon` | `ReactNode` | ❌ | Icon for title |
| `closable` | `boolean` | ❌ | Allow closing (default: true) |

### AdvancedMosaicLayout Props

Extends `MosaicLayout` with:

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `persistLayout` | `boolean` | `false` | Enable localStorage persistence |
| `persistKey` | `string` | `'mosaic-layout'` | localStorage key |
| `enableDragAndDrop` | `boolean` | `true` | Enable/disable dragging |
| `defaultToolbarControls` | `ReactNode[]` | `[Expand, Close]` | Default controls |

### AdvancedMosaicComponentConfig

Extends `MosaicComponentConfig` with:

| Property | Type | Description |
|----------|------|-------------|
| `toolbarControls` | `ReactNode[]` | Custom toolbar buttons |
| `additionalControls` | `ReactNode[]` | Drawer controls |
| `renderBody` | `(Component, props) => ReactNode` | Custom render function |

## Examples

### Complete Chart Dashboard

```tsx
import { MosaicLayout } from '@/components/mosaic';
import { BarChart3, LineChart, Grid3x3 } from 'lucide-react';
import BrushedBarChart from './chart-components/BrushedBarChart';
import BrushedLineChart from './chart-components/BrushedLineChart';
import BrushedHeatmap from './chart-components/BrushedHeatmap';

export function ChartDashboard() {
  return (
    <div className="w-full h-screen">
      <MosaicLayout
        components={{
          'histogram': {
            id: 'histogram',
            title: 'Histogram',
            component: BrushedBarChart,
            icon: <BarChart3 className="h-4 w-4" />,
          },
          'trends': {
            id: 'trends',
            title: 'Trends',
            component: BrushedLineChart,
            icon: <LineChart className="h-4 w-4" />,
          },
          'heatmap': {
            id: 'heatmap',
            title: 'Heatmap',
            component: BrushedHeatmap,
            icon: <Grid3x3 className="h-4 w-4" />,
          },
        }}
        onChange={(layout) => {
          console.log('Layout changed:', layout);
        }}
      />
    </div>
  );
}
```

### With Zustand State Sharing

Your components automatically share Zustand state:

```tsx
// All charts use the same brush selection from Zustand
import { useBrushSelection } from '@/hooks/useBrushSelection';

function MyChart() {
  const brushSelection = useBrushSelection();
  // Charts automatically react to brush selection changes!
}

<MosaicLayout
  components={{
    'chart-1': { id: 'chart-1', title: 'Chart 1', component: MyChart },
    'chart-2': { id: 'chart-2', title: 'Chart 2', component: MyChart },
  }}
/>
```

## Styling

The mosaic system integrates with your Tailwind/shadcn theme automatically. All colors, borders, and shadows use CSS variables from your theme configuration.

### Custom Styling

Override specific styles:

```css
/* Custom styles */
.mosaic-layout-container {
  background: linear-gradient(to bottom, var(--background), var(--muted));
}

.mosaic-window-toolbar {
  backdrop-filter: blur(10px);
}
```

## Keyboard Shortcuts

- **Drag Window**: Click and drag window title bar
- **Resize**: Drag dividers between windows
- **Close**: Click close button (X)
- **Maximize**: Click maximize button

## Browser Support

- Chrome/Edge: ✅ Full support
- Firefox: ✅ Full support
- Safari: ✅ Full support

## Tips & Tricks

1. **Keep it Simple**: Start with basic `MosaicLayout`, upgrade to `AdvancedMosaicLayout` only when needed
2. **Component Keys**: Use descriptive IDs like `'revenue-chart'` instead of `'chart1'`
3. **Icons**: Add icons to improve visual identification
4. **Layout Persistence**: Enable for production dashboards
5. **Shared State**: Leverage Zustand for cross-component communication

## Troubleshooting

### Windows Not Rendering
- Check that component IDs match between `components` and `initialLayout`
- Verify components are properly exported

### Drag Not Working
- Ensure `enableDragAndDrop={true}` (default)
- Check that windows have `draggable={true}`

### Layout Not Persisting
- Verify `persistLayout={true}` is set
- Check localStorage quota (5MB limit)
- Use unique `persistKey` for each dashboard
