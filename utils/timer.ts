export class Timer {
    constructor() {
        this.startTime = new Date()
    }

    private startTime: Date

    get elapsed(): number {
        return new Date().valueOf() - this.startTime.valueOf()
    }

    reset() {
        this.startTime = new Date()
    }
}