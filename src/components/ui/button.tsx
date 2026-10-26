import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:pointer-events-none disabled:opacity-40",
  {
    variants: {
      variant: {
        primary: "bg-ink text-on-ink hover:bg-ink-soft",
        field: "bg-field text-on-field hover:bg-ink",
        secondary: "border border-line bg-card text-ink hover:bg-paper",
        ghost: "bg-transparent text-ink hover:bg-card",
        danger: "border border-line bg-card text-danger hover:bg-danger-soft",
      },
      size: {
        sm: "h-9 min-h-9 px-3 text-xs",
        md: "h-11 min-h-11 px-4 text-sm",
        lg: "h-12 min-h-12 px-5 text-base",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

type Props = ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants> & { asChild?: boolean };

export function Button({ className, variant, size, asChild, type, ...props }: Props) {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp
      className={cn(buttonVariants({ variant, size }), className)}
      {...(asChild ? {} : { type: type ?? "button" })}
      {...props}
    />
  );
}
