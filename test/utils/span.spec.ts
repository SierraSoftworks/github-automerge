import { Span } from "@opentelemetry/api"
import {span, asyncSpan, tracer} from "../../utils/span"

class MockClass
{
    defaultResult = 0

    @span('span.test', { result: '$result' })
    callSpan(a?) {
        return a || this.getDefault()
    }

    @asyncSpan('asyncSpan.test', { result: '$result' })
    async callAsyncSpan(a?) {
        return a || await this.getDefaultAsync()
    }

    @span('span.test.getDefault')
    private getDefault() {
        return this.defaultResult
    }

    @span('asyncSpan.test.getDefault')
    private async getDefaultAsync() {
        return this.defaultResult
    }
}

let trace: Span

beforeEach(() => {
    trace = tracer.startSpan("test")
})

afterEach(() => {
    trace.end()
})

test("@span", () => {
    const mock = new MockClass();

    expect(mock.callSpan()).toBe(mock.defaultResult)
    expect(mock.callSpan(10)).toBe(10)
})

test("@asyncSpan", async () => {
    const mock = new MockClass();

    expect(await mock.callAsyncSpan()).toBe(mock.defaultResult)
    expect(await mock.callAsyncSpan(10)).toBe(10)
})