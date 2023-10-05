import { HttpRequest } from "@azure/functions";

export function jsonHeaders(req: HttpRequest): string {
    const headers = {}
    for (const entry of req.headers.entries())
    {
        const [key, value] = entry
        headers[key.toLowerCase()] = value
    }

    return JSON.stringify(headers)
}