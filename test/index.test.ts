import { describe, it, expect } from "vitest";
import { createLineReader, createEventMessageReader } from "../src/index";

function createStreamReader(text: string) {
  const encoder = new TextEncoder();
  const encodedData = encoder.encode(text);
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encodedData);
      controller.close();
    },
  });

  return stream.getReader();
}

function createLineReaderFromText(text: string) {
  return createLineReader(createStreamReader(text));
}

function createEventMessageReaderFromText(text: string) {
  return createEventMessageReader(createStreamReader(text));
}

describe("parse", () => {
  const decoder = new TextDecoder();

  describe("createLineReader", () => {
    it("single line", async () => {
      const reader = createLineReaderFromText("id: abc\n");
      const next = async () => {
        const { value } = await reader.next();
        return value ? decoder.decode(value.line) : null;
      };

      expect(await next()).toBe("id: abc");
      expect(await next()).toBe(null);
    });

    it("multiple lines", async () => {
      const reader = createLineReaderFromText("id: abc\ndata: def\n");
      const next = async () => {
        const { value } = await reader.next();
        return value ? decoder.decode(value.line) : null;
      };

      expect(await next()).toBe("id: abc");
      expect(await next()).toBe("data: def");
      expect(await next()).toBe(null);
    });

    it("multiple lines split across multiple arrays", async () => {
      // arrange:
      const reader = createLineReaderFromText("id: ab\nc\ndata: def\n");
      const next = async () => {
        const { value } = await reader.next();
        return value ? decoder.decode(value.line) : null;
      };

      // act/assert:
      expect(await next()).toBe("id: ab");
      expect(await next()).toBe("c");
      expect(await next()).toBe("data: def");
      expect(await next()).toBe(null);
    });

    it("line with multiple colons", async () => {
      const reader = createLineReaderFromText("id: abc: def\n");
      const next = async () => {
        const { value } = await reader.next();
        return value ? decoder.decode(value.line) : null;
      };

      expect(await next()).toBe("id: abc: def");
      expect(await next()).toBe(null);
    });

    it("single byte array with multiple lines separated by \\n", async () => {
      const reader = createLineReaderFromText("id: abc\ndata: def\n");
      const next = async () => {
        const { value } = await reader.next();
        return value ? decoder.decode(value.line) : null;
      };

      expect(await next()).toBe("id: abc");
      expect(await next()).toBe("data: def");
      expect(await next()).toBe(null);
    });

    it("multiple lines with non-newline terminated", async () => {
      const reader = createLineReaderFromText(`
data: data1
data: data2
data: data3`);

      const next = async () => {
        const { value } = await reader.next();
        return value ? decoder.decode(value.line) : null;
      };

      expect(await next()).toBe("");
      expect(await next()).toBe("data: data1");
      expect(await next()).toBe("data: data2");
      expect(await next()).toBe("data: data3");
      expect(await next()).toBe(null);
    });
  });

  describe("readEventMessage", () => {
    it("multiple lines with non-newline terminated", async () => {
      const reader = createEventMessageReaderFromText(`
data: data1

data: data2
data: data3

event: add
data: 73857293

event: remove
data: 2153

event: add
data: 113411
`);

      const next = async () => {
        const { value } = await reader.next();
        return value ? value : null;
      };

      expect(await next()).toStrictEqual({ data: "", event: "", id: "", retry: undefined });
      expect(await next()).toStrictEqual({ data: "data1", event: "", id: "", retry: undefined });
      expect(await next()).toStrictEqual({ data: "data2\ndata3", event: "", id: "", retry: undefined });
      expect(await next()).toStrictEqual({ data: "73857293", event: "add", id: "", retry: undefined });
      expect(await next()).toStrictEqual({ data: "2153", event: "remove", id: "", retry: undefined });
      expect(await next()).toStrictEqual({ data: "113411", event: "add", id: "", retry: undefined });
      expect(await next()).toStrictEqual(null);
    });
  });
});
