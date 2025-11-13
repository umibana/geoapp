import React from 'react';
import { MosaicContext, MosaicWindowContext } from 'react-mosaic-component';
import { X, Maximize2, Minimize2, SplitSquareHorizontal, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

/**
 * Custom close button for mosaic windows
 */
export const CloseButton: React.FC = () => {
  const { mosaicActions } = React.useContext(MosaicContext);
  const { mosaicWindowActions } = React.useContext(MosaicWindowContext);

  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="mosaic-control-button h-7 w-7"
            onClick={() => mosaicActions.remove(mosaicWindowActions.getPath())}
          >
            <X className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          <p>Close window</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

/**
 * Custom expand/collapse button for mosaic windows
 */
export const ExpandButton: React.FC = () => {
  const { mosaicActions } = React.useContext(MosaicContext);
  const { mosaicWindowActions } = React.useContext(MosaicWindowContext);
  const [isExpanded, setIsExpanded] = React.useState(false);

  const handleToggleExpand = () => {
    const path = mosaicWindowActions.getPath();
    if (isExpanded) {
      // Collapse back to original size
      mosaicActions.updateTree([{ path, spec: { splitPercentage: { $set: 50 } } }]);
    } else {
      // Expand to 90%
      mosaicActions.expand(path, 90);
    }
    setIsExpanded(!isExpanded);
  };

  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="mosaic-control-button h-7 w-7"
            onClick={handleToggleExpand}
          >
            {isExpanded ? (
              <Minimize2 className="h-4 w-4" />
            ) : (
              <Maximize2 className="h-4 w-4" />
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          <p>{isExpanded ? 'Restore size' : 'Maximize window'}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

/**
 * Custom split button for creating new windows
 */
export const SplitButton: React.FC<{ newWindowId?: string }> = ({ newWindowId }) => {
  const { mosaicActions } = React.useContext(MosaicContext);
  const { mosaicWindowActions } = React.useContext(MosaicWindowContext);

  const handleSplit = () => {
    const path = mosaicWindowActions.getPath();

    // Create a new window by splitting horizontally
    mosaicActions.split(path, newWindowId);
  };

  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="mosaic-control-button h-7 w-7"
            onClick={handleSplit}
          >
            <SplitSquareHorizontal className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          <p>Split window</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

/**
 * Additional controls button (can be used for settings, etc.)
 */
export const AdditionalControlsButton: React.FC<{
  onClick?: () => void;
  icon?: React.ReactNode;
  tooltip?: string;
}> = ({ onClick, icon = <Settings className="h-4 w-4" />, tooltip = 'Settings' }) => {
  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="mosaic-control-button h-7 w-7"
            onClick={onClick}
          >
            {icon}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          <p>{tooltip}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

/**
 * Default toolbar controls array
 */
export const DEFAULT_TOOLBAR_CONTROLS = [
  <ExpandButton key="expand" />,
  <CloseButton key="close" />,
];

export default {
  CloseButton,
  ExpandButton,
  SplitButton,
  AdditionalControlsButton,
  DEFAULT_TOOLBAR_CONTROLS,
};
