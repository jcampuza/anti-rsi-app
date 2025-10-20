import { cva } from 'class-variance-authority'

export const buttonVariants = cva(
  'rounded-md px-4 py-2 font-semibold border-0 transition-[background] duration-150 text-sm disabled:cursor-not-allowed disabled:opacity-60 cursor-pointer',
  {
    variants: {
      variant: {
        primary: 'bg-primary hover:bg-primary/90 text-primary-foreground',
        secondary: 'bg-secondary hover:bg-secondary/90 text-secondary-foreground',
        link: 'text-foreground transition-all duration-200 hover:bg-secondary/25 hover:shadow',
        destructive: 'bg-destructive hover:bg-destructive/90 text-destructive-foreground'
      }
    },
    defaultVariants: {
      variant: 'primary'
    }
  }
)

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'destructive'
}

export function Button({ variant, ...props }: ButtonProps) {
  return <button className={buttonVariants({ variant })} {...props} />
}
