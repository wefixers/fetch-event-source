/**
 * Represents a message sent in an event stream
 * https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events#Event_stream_format
 */
export interface EventSourceMessage {
  /** The event ID to set the EventSource object's last event ID value. */
  id: string;
  /** A string identifying the type of event described. */
  event: string;
  /** The event data */
  data: string;
  /** The reconnection interval (in milliseconds) to wait before retrying the connection */
  retry?: number;
}

const enum ControlChars {
  NewLine = 10,
  CarriageReturn = 13,
  Space = 32,
  Colon = 58,
}

export async function* createLineReader(
  reader: ReadableStreamDefaultReader<Uint8Array>
) {
  let buffer: Uint8Array | undefined;
  let position: number = 0; // current read position
  let fieldLength: number = -1; // length of the `field` portion of the line
  let discardTrailingNewline = false;

  let result: ReadableStreamReadResult<Uint8Array>;
  while (!(result = await reader.read()).done) {
    const arr = result.value;

    if (buffer === undefined) {
      buffer = arr;
      position = 0;
      fieldLength = -1;
    } else {
      // we're still parsing the old line. Append the new bytes into buffer:
      const res = new Uint8Array(buffer.length + arr.length);
      res.set(buffer);
      res.set(arr, buffer.length);

      buffer = res;
    }

    const bufLength = buffer.length;
    let lineStart = 0; // index where the current line starts
    while (position < bufLength) {
      if (discardTrailingNewline) {
        if (buffer[position] === ControlChars.NewLine) {
          lineStart = ++position; // skip to next char
        }

        discardTrailingNewline = false;
      }

      // start looking forward till the end of line:
      let lineEnd = -1; // index of the \r or \n char
      for (; position < bufLength && lineEnd === -1; ++position) {
        switch (buffer[position]) {
          case ControlChars.Colon:
            if (fieldLength === -1) {
              // first colon in line
              fieldLength = position - lineStart;
            }
            break;
          // @ts-ignore:7029 \r case below should fallthrough to \n:
          case ControlChars.CarriageReturn:
            discardTrailingNewline = true;
          case ControlChars.NewLine:
            lineEnd = position;
            break;
        }
      }

      if (lineEnd === -1) {
        // We reached the end of the buffer but the line hasn't ended.
        // Wait for the next arr and then continue parsing:
        break;
      }

      // we've reached the line end, send it out:
      const line = buffer.subarray(lineStart, lineEnd);
      yield { line, fieldLength };

      lineStart = position; // we're now on the next line
      fieldLength = -1;
    }

    if (lineStart === bufLength) {
      buffer = undefined; // we've finished reading it
    } else if (lineStart !== 0) {
      // Create a new view into buffer beginning at lineStart so we don't
      // need to copy over the previous lines when we get the new arr:
      buffer = buffer.subarray(lineStart);
      position -= lineStart;
    }
  }

  // get anything that is still in the buffer
  if (buffer !== undefined) {
    const line = buffer;
    yield { line, fieldLength };
  }
}

export type EventSourceMessagePartEmpty = {
  type: "empty";
};

export type EventSourceMessagePartData = {
  type: "data";
  value: string;
};

export type EventSourceMessagePartEvent = {
  type: "event";
  value: string;
};

export type EventSourceMessagePartId = {
  type: "id";
  value: string;
};

export type EventSourceMessagePartRetry = {
  type: "retry";
  value: number;
};

export type EventSourceMessagePart =
  | EventSourceMessagePartEmpty
  | EventSourceMessagePartData
  | EventSourceMessagePartEvent
  | EventSourceMessagePartId
  | EventSourceMessagePartRetry;

export function isEventSourceMessagePartEmpty(
  value: EventSourceMessagePart
): value is EventSourceMessagePartEmpty {
  return value.type === "empty";
}

export function isEventSourceMessagePartData(
  value: EventSourceMessagePart
): value is EventSourceMessagePartData {
  return value.type === "data";
}

export function isEventSourceMessagePartEvent(
  value: EventSourceMessagePart
): value is EventSourceMessagePartEvent {
  return value.type === "event";
}

export function isEventSourceMessagePartId(
  value: EventSourceMessagePart
): value is EventSourceMessagePartId {
  return value.type === "id";
}

export function isEventSourceMessagePartRetry(
  value: EventSourceMessagePart
): value is EventSourceMessagePartRetry {
  return value.type === "retry";
}

export async function* readEventMessagePart(
  reader: ReadableStreamDefaultReader<Uint8Array>
): AsyncGenerator<EventSourceMessagePart, void, unknown> {
  const decoder = new TextDecoder();

  for await (const { line, fieldLength } of createLineReader(reader)) {
    if (line.length === 0) {
      // empty line denotes end of message. Trigger the callback and start a new message:
      yield { type: "empty" };
    } else if (fieldLength > 0) {
      // exclude comments and lines with no values
      // line is of format "<field>:<value>" or "<field>: <value>"
      // https://html.spec.whatwg.org/multipage/server-sent-events.html#event-stream-interpretation
      const field = decoder.decode(line.subarray(0, fieldLength));
      const valueOffset =
        fieldLength + (line[fieldLength + 1] === ControlChars.Space ? 2 : 1);
      const value = decoder.decode(line.subarray(valueOffset));

      switch (field) {
        case "data":
          yield { type: "data", value };
          break;
        case "event":
          yield { type: "event", value };
          break;
        case "id":
          yield { type: "id", value };
          break;
        case "retry":
          const retry = parseInt(value, 10);
          if (!isNaN(retry)) {
            // per spec, ignore non-integers
            yield { type: "retry", value: retry };
          }
          break;
      }
    }
  }
}

export async function* createEventMessageReader(
  reader: ReadableStreamDefaultReader<Uint8Array>
) {
  let message: EventSourceMessage = {
    data: "",
    event: "",
    id: "",
    retry: undefined,
  };

  for await (const part of readEventMessagePart(reader)) {
    switch (part.type) {
      case "empty":
        // empty line denotes end of message. Trigger the callback and start a new message:
        yield message;
        message = {
          data: "",
          event: "",
          id: "",
          retry: undefined,
        };
        break;

      case "data":
        // if this message already has data, append the new value to the old.
        // otherwise, just set to the new value:
        message.data = message.data
          ? message.data + "\n" + part.value
          : part.value; // otherwise,
        break;

      case "event":
        message.event = part.value;
        break;

      case "id":
        message.id = part.value;
        break;

      case "retry":
        message.retry = part.value;
        break;
    }
  }

  yield message
}
