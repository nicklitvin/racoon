# Talking to Alarmie

On a Mac with Alarmie on it, My Pet's settings offer **Click your pet to talk to Alarmie**. With it on, clicking the pet opens a small chat window beside him, and everything typed there goes to Alarmie's live talk. This page is what Alarmie's side needs to do for that to work. Both the Electron app (`electron/alarmie.ts`, `shared/alarmie.ts`) and the Swift app (`mac/MyPet/Alarmie/`) speak it the same way.

## Finding Alarmie

The setting only shows on a Mac, and only once Alarmie is found, either way:

- **Installed:** `Alarmie.app` in `/Applications` or `~/Applications`, or found by Spotlight (bundle id `com.nicklitvin.alarmie`, or an app named `Alarmie.app`). The Swift app asks Launch Services for the bundle id instead. If Alarmie's bundle id ends up different, change `ALARMIE_BUNDLE_IDS` in `shared/alarmie.ts` and `Alarmie.bundleIDs` in `mac/MyPet/Alarmie/Alarmie.swift`.
- **Answering:** anything at all answers at the endpoint (any HTTP status, so a `405` counts). That's so it works while Alarmie runs from source.

## The endpoint

By default `http://127.0.0.1:4318/live-talk`. It can be changed in the settings, under **Connection** (any `http://` or `https://` address).

### Is it there?

`GET <endpoint>`, 1.5 s timeout. Any HTTP answer means yes. A short `200` with any body is best.

### A message

```http
POST /live-talk HTTP/1.1
Content-Type: application/json
Accept: application/json, text/plain

{ "message": "Wake me at 7", "conversationId": null, "client": "my-pet" }
```

- `message`: what was typed, trimmed, at most 4000 characters.
- `conversationId`: `null` for the first message in a chat window, then whatever Alarmie sent back last. Closing the window starts a new conversation.
- `client`: always `"my-pet"`, so Alarmie can tell the pet from its own app.

Answer with JSON:

```json
{ "reply": "Done, 7:00 tomorrow.", "conversationId": "c_81f2" }
```

- `reply` (or `message`, or `text`): what to show. Shown as plain text, at most 4000 characters, with line breaks kept.
- `conversationId` (optional, string or number): sent back with the next message.

A `text/plain` body works too: the whole body is the reply, with no conversation id.

Anything but a 2xx shows *"Alarmie couldn't answer (status)."* in the chat. Not answering at all shows *"Couldn't reach Alarmie. Is it open, with live talk on?"*. Alarmie has 60 seconds to answer.

### A minimal stand-in

Handy for trying the pet's side before Alarmie's is done:

```js
// node fake-alarmie.js
require('http').createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    if (req.method !== 'POST') return res.end('live talk');
    const { message, conversationId } = JSON.parse(body);
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ reply: `You said: ${message}`, conversationId: conversationId ?? 'demo' }));
  });
}).listen(4318, '127.0.0.1');
```

In development on Windows or Linux, `MY_PET_ALARMIE=1 npm start` offers the chat there too (it still needs something answering at the endpoint).

## Privacy

Nothing goes to Alarmie except what you type into the chat. The pet only asks whether something is answering at the endpoint, and only on a Mac (when the settings open, and when the window comes to the front).
