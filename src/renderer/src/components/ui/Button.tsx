import { cva } from 'class-variance-authority'

export const buttonVariants = cva(
  'rounded-md px-4 py-2 font-semibold border-0 transition-[background] duration-150 text-sm disabled:cursor-not-allowed disabled:opacity-60',
  {
    variants: {
      variant: {
        primary: 'bg-primary hover:bg-primary/90 text-foreground',
        secondary: 'bg-secondary hover:bg-secondary/90 text-secondary-foreground'
      }
    },
    defaultVariants: {
      variant: 'primary'
    }
  }
)

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary'
}

export function Button({ variant, ...props }: ButtonProps) {
  return <button className={buttonVariants({ variant })} {...props} />
}
