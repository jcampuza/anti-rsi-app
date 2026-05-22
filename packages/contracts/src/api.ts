export const API_ROUTES = {
  SNAPSHOT: "/snapshot",
  CONFIG: "/config",
  PROCESSES: "/processes",
  COMMAND: "/command",
  EVENTS: "/events",
} as const

export type ApiRoute = (typeof API_ROUTES)[keyof typeof API_ROUTES]

export interface ApiErrorBody {
  message: string
}
