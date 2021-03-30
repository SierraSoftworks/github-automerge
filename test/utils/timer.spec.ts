import {Timer} from "../../utils/timer"

test('Timer', async () => {
    const timer = new Timer()

    await new Promise((resolve) => setTimeout(() => resolve(null), 10))
    expect(timer.elapsed).toBeGreaterThanOrEqual(10)

    timer.reset()
    expect(timer.elapsed).toBeLessThanOrEqual(1)
})