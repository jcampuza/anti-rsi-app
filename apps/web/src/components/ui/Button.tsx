import { cva } from "class-variance-authority"

export const buttonVariants = cva(
  "cursor-pointer rounded-md border px-4 py-2 text-sm font-semibold transition-[background,border-color,color,box-shadow,transform] duration-150 disabled:cursor-not-allowed disabled:opacity-60",
  {
    variants: {
      variant: {
        primary:
          "border-white/10 bg-primary text-primary-foreground shadow-[0_14px_32px_rgba(17,24,39,0.35)] hover:border-white/20 hover:bg-primary/90",
        secondary:
          "border-border bg-secondary text-secondary-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] hover:border-white/[0.15] hover:bg-white/[0.08]",
        link: "border-transparent text-muted-foreground hover:bg-white/[0.06] hover:text-foreground",
        destructive:
          "border-red-400/20 bg-destructive text-destructive-foreground hover:border-red-300/30 hover:bg-destructive/90",
      },
    },
    defaultVariants: {
      variant: "primary",
    },
  },
)

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "destructive"
}

export function Button({ variant, ...props }: ButtonProps) {
  return <button className={buttonVariants({ variant })} {...props} />
}
