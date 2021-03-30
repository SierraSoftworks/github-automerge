import {generateSignature} from "../../utils/github"

test("GitHub generateSignature", () => {
    const secret = "webhook-secret"
    expect(generateSignature(secret, "example-payload")).toBe("sha256=44612d3c0e3be91609fcc114c6ce826f71d22fb7e19c3040616f513f42d29baa")
})