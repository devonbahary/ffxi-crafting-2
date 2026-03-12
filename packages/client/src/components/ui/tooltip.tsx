import * as TooltipPrimitive from '@radix-ui/react-tooltip';

export const TooltipProvider = ({ children, ...props }: React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Provider>) => (
    <TooltipPrimitive.Provider delayDuration={0} {...props}>
        {children}
    </TooltipPrimitive.Provider>
);

export const Tooltip = TooltipPrimitive.Root;

export const TooltipTrigger = TooltipPrimitive.Trigger;

export const TooltipContent = ({
    children,
    sideOffset = 4,
    ...props
}: React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>) => (
    <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
            sideOffset={sideOffset}
            className="z-50 rounded-md border bg-popover px-3 py-2 text-sm text-popover-foreground shadow-md animate-in fade-in-0 zoom-in-95"
            {...props}
        >
            {children}
            <TooltipPrimitive.Arrow className="fill-popover" />
        </TooltipPrimitive.Content>
    </TooltipPrimitive.Portal>
);
