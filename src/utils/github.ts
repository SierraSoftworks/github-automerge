import {createHmac} from "crypto"

export function generateSignature(secret: string, payload: string): string | null {
    // If the secret or signature is missing, then don't accept any webhooks
    if (!secret)
    {
        return null
    }

    return "sha256=" + createHmac("sha256", secret, { defaultEncoding: "utf-8" }).update(payload).digest("hex")
}