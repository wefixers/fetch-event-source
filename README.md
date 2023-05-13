# Fetch Event Source

> A port of [@microsoft/fetch-event-source](https://raw.githubusercontent.com/Azure/fetch-event-source/main/README.md)

This package do uses async generator.

# Install
```sh
pnpm i @fixers/fetch-event-source
```

```sh
npm install @fixers/fetch-event-source
```

# Usage
```ts
// do a regular fetch
const response = await fetch("https://...", {
    method: "POST",
    body: JSON.stringify({ .. }),
    headers: {
      Accept: "text/event-stream"
    },
  }
);

// create the reader
const reader = response.body!.getReader();

for await (const message of createEventMessageReader(reader)) {
  // the message will be a EventSourceMessage
  const data = message.data
}
```

You are in control so make sure to check the response for validity

```ts
// do a regular fetch
const response = await fetch(
  "https://...",
  {
    method: "POST",
    headers: {
      Accept: "text/event-stream"
    },
    body: JSON.stringify({ .. }),
  }
);

// you are responsible for doing checks
if (response.ok) {

}

// or as an alternative
if (response.status >= 200 && response.status < 300) {
}

// check the response header
const contentType = response.headers.get("content-type");
if (!contentType?.startsWith('text/event-stream')) {
  throw new Error(
    `Expected content-type to be text/event-stream, Actual: ${contentType}`
  );
}
```
