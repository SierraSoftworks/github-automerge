import { InvocationContext } from "@azure/functions";
import { asyncSpan, currentSpan } from "./span.js";

export class FeaturesClient {
    constructor(protected invocation: InvocationContext, protected namespace = "github-automerge", protected context: { [key: string]: string } = {}) {
        this.context["invocation_functionName"] = invocation.functionName
    }

    withContext(context: { [key: string]: string }): FeaturesClient {
        this.context = {
            ...this.context,
            ...context
        }

        return this
    }
    
    @asyncSpan('features.boolean', { result: '$result' })
    async boolean(name: string, defaultValue: boolean = false): Promise<boolean> {
        const span = currentSpan()
        const value = null
        
        span.setAttribute("flag.value", value ? value.enabled : defaultValue)

        if (!value) return defaultValue
        return value.enabled
    }

    @asyncSpan('features.variant', { result: '$result' })
    async variant(name: string, defaultValue: string): Promise<string> {
        const span = currentSpan()
        const value = null
        
        span.setAttribute("flag.value", value ? value.variantKey : defaultValue)

        if (!value) return defaultValue
        return value.variantKey
    }

    @asyncSpan('features.variantAttachment', { result: '$result' })
    async variantAttachment<T>(name: string, defaultValue: T): Promise<T> {
        const span = currentSpan()
        const value = null

        span.setAttribute("flag.value", value ? value.variantAttachment : JSON.stringify(defaultValue))

        if (!value?.variantAttachment) return defaultValue
        return JSON.parse(value.variantAttachment)
    }
}