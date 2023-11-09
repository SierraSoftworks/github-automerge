import { InvocationContext } from "@azure/functions";
import { FliptApiClient } from "@flipt-io/flipt";
import { EvaluationRequest } from "@flipt-io/flipt/api/resources/evaluation";
import { asyncSpan, currentSpan } from "./span";

const client = new FliptApiClient({
    environment: "https://flipt.internal.sierrasoftworks.com",
    token: process.env.FLIPT_TOKEN
})

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
        const value = await this.evaluate(name, req => client.evaluation.boolean(req))
        
        span.setAttribute("flag.value", value ? value.enabled : defaultValue)

        if (!value) return defaultValue
        return value.enabled
    }

    @asyncSpan('features.variant', { result: '$result' })
    async variant(name: string, defaultValue: string): Promise<string> {
        const span = currentSpan()
        const value = await this.evaluate(name, req => client.evaluation.variant(req))
        
        span.setAttribute("flag.value", value ? value.variantKey : defaultValue)

        if (!value) return defaultValue
        return value.variantKey
    }

    @asyncSpan('features.variantAttachment', { result: '$result' })
    async variantAttachment<T>(name: string, defaultValue: T): Promise<T> {
        const span = currentSpan()
        const value = await this.evaluate(name, req => client.evaluation.variant(req))

        span.setAttribute("flag.value", value ? value.variantAttachment : JSON.stringify(defaultValue))

        if (!value?.variantAttachment) return defaultValue
        return JSON.parse(value.variantAttachment)
    }

    private async evaluate<T>(name: string, action: (request: EvaluationRequest) => Promise<T>): Promise<T|never> {
        const span = currentSpan()
        span.setAttribute("flag.key", name)
        
        try {
            const result = await action({
                namespaceKey: this.namespace,
                flagKey: name,
                entityId: this.invocation.invocationId,
                context: this.context
            })

            span.setAttribute("flag.evaluation", JSON.stringify(result))

            return result
        } catch (err) {
            span.recordException(err)
        }
    }

}