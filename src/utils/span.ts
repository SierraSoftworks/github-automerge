import { InvocationContext, HttpRequest, HttpResponse, HttpResponseInit } from '@azure/functions'

import { NodeSDK } from '@opentelemetry/sdk-node'
import { Resource } from "@opentelemetry/resources";
import { SemanticResourceAttributes } from "@opentelemetry/semantic-conventions";
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto'
import { Attributes, Span, trace, context as otelcontext } from '@opentelemetry/api'

import { URL } from "url"

const traceExporter = new OTLPTraceExporter({
    url: "https://api.honeycomb.io:443/v1/traces",
    headers: {
        "x-honeycomb-team": process.env.HONEYCOMB_KEY
    },
    timeoutMillis: 500,
});

const sdk = new NodeSDK({
    traceExporter,
    instrumentations: [getNodeAutoInstrumentations({
        '@opentelemetry/instrumentation-fs': {
            enabled: false
        }
    })],
    serviceName: "github-automerge",
    autoDetectResources: true,
    resource: new Resource({
        [SemanticResourceAttributes.SERVICE_NAME]: "github-automerge",
    }),
});

sdk.start();

export const tracer = trace.getTracer("github-automerge")

export function currentSpan(): Span {
    return trace.getSpan(otelcontext.active())
}

export function wrap<T>(name: string, attributes: Attributes, fn: () => T): T {
    return tracer.startActiveSpan(name, { attributes }, span => {
        try {
            return fn();
        } catch (err) {
            span.recordException(err)
        } finally {
            span.end()
        }
    })
}

export function wrapAsync<T>(name: string, attributes: Attributes, fn: () => Promise<T>): Promise<T> {
    return tracer.startActiveSpan(name, { attributes }, async span => {
        try {
            return await fn();
        } catch (err) {
            span.recordException(err)
        } finally {
            span.end()
        }
    })
}

export function span(name?: string, other?: Attributes) {
    return function decorate<T extends (...args) => any>(target: Object, propertyKey?: string, descriptor?: TypedPropertyDescriptor<T>) {
        const originalMethod = descriptor.value
        descriptor.value = <any>function (...args) {
            return wrap(name, other, () => originalMethod.apply(this, args))
        }
        return descriptor
    }
}

export function asyncSpan(name?: string, other?: Attributes) {
    return function decorate<T extends (...args) => any>(target: Object, propertyKey?: string, descriptor?: TypedPropertyDescriptor<T>) {
        const originalMethod = descriptor.value

        descriptor.value = <any>function (...args) {
            return wrapAsync(name, other, () => originalMethod.apply(this, args))
        }

        return descriptor
    }
}

export async function handleHttpRequest(req: HttpRequest, context: InvocationContext, handleRequest: (req: HttpRequest, context: InvocationContext) => Promise<HttpResponse | HttpResponseInit>): Promise<HttpResponse | HttpResponseInit> {
    const url = new URL(req.url)

    return tracer.startActiveSpan(
        `${req.method} ${req.url}`,
        {
            attributes: {
                "otel.kind": "SERVER",
                "request.host": url.hostname,
                "request.scheme": url.protocol,
                "request.path": url.pathname,
                "request.method": req.method,
                "request.query": url.search,
                "request.url": req.url,
                "request.client-ip": req.headers['client-ip'],
                'request.user-agent': req.headers['user-agent'],
                'az.function': req.headers['x-site-deployment-id'],
            }
        },
        async span => {
            try {
                const result = await handleRequest(req, context)

                span.setAttribute('response.status_code', result.status || (result.body ? 200 : 204))

                return result
            } catch (err) {
                span.recordException(err)
                return {
                    body: JSON.stringify({ "error": "Internal Server Error", "traceid": span.spanContext().traceId }),
                    status: 500
                }
            } finally {
                span.end()
            }
        }
    )
}