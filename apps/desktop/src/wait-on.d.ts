declare module "wait-on" {
  interface WaitOnOptions {
    resources: string[]
    cwd?: string
  }

  export default function waitOn(options: WaitOnOptions): Promise<void>
}
