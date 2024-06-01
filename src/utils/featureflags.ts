import { InvocationContext } from "@azure/functions";
import { FliptClient, ClientTokenAuthentication } from "@flipt-io/flipt";
import type { EvaluationRequest } from "@flipt-io/flipt/dist/evaluation/models";
import { asyncSpan, currentSpan } from "./span.js";

const client = new FliptClient({
  url: "https://flipt.sierrasoftworks.com",
  authenticationStrategy: new ClientTokenAuthentication(process.env.FLIPT_TOKEN),
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

  @asyncSpan('features.boolean')
  async boolean(name: string, defaultValue: boolean = false): Promise<boolean> {
    const span = currentSpan()
    const value = await this.evaluate(name, req => client.evaluation.boolean(req))

    span.setAttribute("flag.value", value ? value.enabled : defaultValue)

    if (!value) return defaultValue
    return value.enabled
  }

  @asyncSpan('features.variant')
  async variant(name: string, defaultValue: string): Promise<string> {
    const span = currentSpan()
    const value = await this.evaluate(name, req => client.evaluation.variant(req))

    span.setAttribute("flag.value", value ? value.variantKey : defaultValue)

    if (!value) return defaultValue
    return value.variantKey
  }

  @asyncSpan('features.variantAttachment')
  async variantAttachment<T>(name: string, defaultValue: T): Promise<T> {
    const span = currentSpan()
    const value = await this.evaluate(name, req => client.evaluation.variant(req))

    span.setAttribute("flag.value", value ? value.variantAttachment : JSON.stringify(defaultValue))

    if (!value?.variantAttachment) return defaultValue
    return JSON.parse(value.variantAttachment)
  }

  private async evaluate<T>(name: string, action: (request: EvaluationRequest) => Promise<T>): Promise<T | never> {
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
