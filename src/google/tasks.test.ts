import { beforeEach, describe, expect, it, vi } from "vitest"
import { requestUrl, type RequestUrlParam, type RequestUrlResponse } from "obsidian"
import { DEFAULT_TASKS_MAX_RESULTS, DEFAULT_TASK_LIST_ID, fetchTasks, type GoogleTask } from "src/google/tasks"

const response = (json: unknown, status = 200): RequestUrlResponse => ({
  status,
  json,
  text: JSON.stringify(json),
  arrayBuffer: new ArrayBuffer(0),
  headers: {},
})

const requestParams = (index = 0): RequestUrlParam => vi.mocked(requestUrl).mock.calls[index][0] as RequestUrlParam

describe("fetchTasks", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("requests tasks from the default list", async () => {
    vi.mocked(requestUrl).mockResolvedValue(response({ items: [] }))

    await fetchTasks({ accessToken: "access-token" })

    const url = new URL(requestParams().url)
    expect(url.origin + url.pathname).toBe(`https://tasks.googleapis.com/tasks/v1/lists/${encodeURIComponent(DEFAULT_TASK_LIST_ID)}/tasks`)
    expect(url.searchParams.get("maxResults")).toBe(String(DEFAULT_TASKS_MAX_RESULTS))
  })

  it("encodes the task list id and sends the access token", async () => {
    vi.mocked(requestUrl).mockResolvedValue(response({ items: [] }))

    await fetchTasks({ accessToken: "access-token", taskListId: "my list" })

    const url = new URL(requestParams().url)
    expect(url.pathname).toBe("/tasks/v1/lists/my%20list/tasks")
    expect(requestParams().headers).toEqual({ Authorization: ["Bearer", "access-token"].join(" ") })
  })

  it("passes the optional filters", async () => {
    vi.mocked(requestUrl).mockResolvedValue(response({ items: [] }))

    await fetchTasks({
      accessToken: "access-token",
      taskListId: "primary",
      maxResults: 25,
      showCompleted: true,
      showHidden: false,
      dueMin: new Date("2026-11-01T00:00:00.000Z"),
      dueMax: new Date("2026-11-30T23:59:59.000Z"),
    })

    const params = new URL(requestParams().url).searchParams
    expect(params.get("maxResults")).toBe("25")
    expect(params.get("showCompleted")).toBe("true")
    expect(params.get("showHidden")).toBe("false")
    expect(params.get("dueMin")).toBe("2026-11-01T00:00:00.000Z")
    expect(params.get("dueMax")).toBe("2026-11-30T23:59:59.000Z")
  })

  it("returns the task items", async () => {
    const items: GoogleTask[] = [
      {
        id: "task-1",
        title: "Send invoice",
        status: "needsAction",
        due: "2026-11-02T00:00:00.000Z",
      },
    ]
    vi.mocked(requestUrl).mockResolvedValue(response({ items }))

    await expect(fetchTasks({ accessToken: "access-token" })).resolves.toEqual(items)
  })

  it("returns an empty list when Google sends no items", async () => {
    vi.mocked(requestUrl).mockResolvedValue(response({}))

    await expect(fetchTasks({ accessToken: "access-token" })).resolves.toEqual([])
  })

  it("throws the Google error message", async () => {
    vi.mocked(requestUrl).mockResolvedValue(response({ error: { message: "Invalid task list" } }, 404))

    await expect(fetchTasks({ accessToken: "access-token" })).rejects.toThrow("Google Tasks request failed: Invalid task list")
  })

  it("falls back to the status code when Google sends no message", async () => {
    vi.mocked(requestUrl).mockResolvedValue(response({}, 500))

    await expect(fetchTasks({ accessToken: "access-token" })).rejects.toThrow("Google Tasks request failed (500).")
  })
})
