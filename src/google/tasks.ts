import { requestUrl } from "obsidian"

export const GOOGLE_TASKS_API_URL = "https://tasks.googleapis.com/tasks/v1"
export const DEFAULT_TASKS_MAX_RESULTS = 100
export const DEFAULT_TASK_LIST_ID = "@default"

export interface GoogleTaskLink {
  type?: string
  description?: string
  link?: string
}

export interface GoogleTask {
  id: string
  title?: string
  notes?: string
  status?: "needsAction" | "completed"
  due?: string
  completed?: string
  updated?: string
  deleted?: boolean
  hidden?: boolean
  parent?: string
  position?: string
  links?: GoogleTaskLink[]
}

export interface FetchTasksOptions {
  accessToken: string
  taskListId?: string
  maxResults?: number
  showCompleted?: boolean
  showHidden?: boolean
  dueMin?: Date
  dueMax?: Date
}

const tasksErrorMessage = (status: number, json: unknown): string => {
  const message = (json as { error?: { message?: unknown } } | undefined)?.error?.message

  return typeof message === "string" ? `Google Tasks request failed: ${message}` : `Google Tasks request failed (${status}).`
}

export const fetchTasks = async ({
  accessToken,
  taskListId = DEFAULT_TASK_LIST_ID,
  maxResults = DEFAULT_TASKS_MAX_RESULTS,
  showCompleted,
  showHidden,
  dueMin,
  dueMax,
}: FetchTasksOptions): Promise<GoogleTask[]> => {
  const url = new URL(`${GOOGLE_TASKS_API_URL}/lists/${encodeURIComponent(taskListId)}/tasks`)
  url.searchParams.set("maxResults", String(maxResults))
  if (showCompleted !== undefined) url.searchParams.set("showCompleted", String(showCompleted))
  if (showHidden !== undefined) url.searchParams.set("showHidden", String(showHidden))
  if (dueMin) url.searchParams.set("dueMin", dueMin.toISOString())
  if (dueMax) url.searchParams.set("dueMax", dueMax.toISOString())

  const response = await requestUrl({
    url: url.toString(),
    headers: { Authorization: `Bearer ${accessToken}` },
    throw: false,
  })

  if (response.status >= 400) throw new Error(tasksErrorMessage(response.status, response.json))

  const items = (response.json as { items?: unknown } | undefined)?.items

  return Array.isArray(items) ? (items as GoogleTask[]) : []
}
