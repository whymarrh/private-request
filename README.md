<img alt="Private Request" src="docs/images/logo/512x256/dark@2x.png" width="512px">

A `fetch` wrapper that hampers traffic analysis, based on Signal's [_Expanding Signal GIF search_][signal-and-giphy] article.

This README outlines the high-level ideas, see [`CONTRIBUTING.md`](./CONTRIBUTING.md) for information about how to contribute to/build the project.

- [What's the idea here?](#whats-the-idea-here)
- [What does this mean in practice?](#what-does-this-mean-in-practice)
  - [Example](#example)
- [What is the benefit?](#what-is-the-benefit)
- [Quick start](#quick-start)

### What's the idea here?

From Signal's article:<sup>[\[1\]][signal-and-giphy]</sup>

> If the Signal service were malicious, it could measure the amount of data being
> transmitted in order to discern something about the GIFs being retrieved from GIPHY.
>
> The most common way to mitigate an attack like that is through the introduction of
> plaintext padding. Including a random amount of padding at the end of each GIF would
> make it more difficult for the Signal service to correlate the amount of data it sees
> being transmitted with a known GIF.
>
> …
>
> We can also abuse range requests to simulate padding on content we don't control.

This package uses [range requests][range-requests] to split a request into segments
with some padding.

### What does this mean in practice?

Using range requests we can turn 1 request for a N₁-byte resource into M requests for N₂-bytes, where:

1. N₁ ≥ N₂; and
2. (M × N₂) ≥ N₁

(At the time of writing the diagram in the Signal article has inconsistent segment sizes,
so there is a different example below.)

#### Example

Pretend there is a 9-byte resource we want to request (N₁), and we pick a segment size of 4 bytes (N₂).

Instead of making one 9-byte request, we can make three 4-byte requests:

<img alt="A 9-byte request in 3 parts" src="https://user-images.githubusercontent.com/1623628/91883754-73f97d00-ec5f-11ea-9df2-7c147e5fe28e.png" width="768px">

The [range requests][range-requests] for the three segments:

| Request | [`Range`][range-header] | Segment size |
|---|---|---|
| 1 | `bytes=0-3` | 4 bytes |
| 2 | `bytes=4-7` | 4 bytes |
| 3 | `bytes=5-8` | 4 bytes |

We have requested the 5th, 6th, and 7th bytes twice and can discard the redundant copy.

#### Larger segment sizes

This package will use segment sizes a lot larger than 4 bytes, picking the smallest
segment size (N₂) from the following list such that N₁ ≥ N₂ holds:

| 𝑥 | Unit |
|---:|:---|
| 10 | kibibytes |
| 50 | kibibytes |
| 100 | kibibytes |
| 500 | kibibytes |
| 1 | mebibyte |

### What is the benefit?

With this approach we turn a request for 9 bytes into a request for 12 bytes, and
hide the size of the resource. This makes it more difficult for an intermediary
(e.g. a malicious proxy server) to know: is the client requesting three unrelated 4-byte resources or one 12-byte resource?
(To which the answer is neither. 😏)

This comes at the cost of multiple extra network calls and bytes on the wire—a steep cost in some scenarios.

### Quick start

**NOTE:** this package requires a random number generator that will produce uniform numbers, preferably one which is cryptographically sound. One option is [`pure-random-number`][pure-random-number], which is available for both browsers and Node.

To install and use the package:

```bash
$ yarn add private-request pure-random-number
```

```js
import pr from 'private-request';
import randomNumber from 'pure-random-number';

const rng = async (min, max) => randomNumber(min, max);
const fetch = pr({ rng });
// Use as you would `window.fetch`
```

### Tests

To run the test suite locally:

```bash
$ yarn
$ yarn build:data
$ yarn start:nginx
$ yarn test
```

To run the e2e tests, visit `localhost:8001` in a browser.

### License

This repository is available under the ISC License. See [`LICENSE.md`](./LICENSE.md).

### On CORS

The ability to perform range requests on the web requires the correct CORS headers.

Namely:

- [`Access-Control-Allow-Origin`](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Access-Control-Allow-Origin) must include the requesting origin
- [`Access-Control-Expose-Headers`](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Access-Control-Expose-Headers) must include [`Content-Range`](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Content-Range)

Remember that the following environments do not enforce CORS:

- [React Native][react-native-networking]

    > The security model for XMLHttpRequest is different than on web as there is no concept of CORS in native apps.

- Web extensions

    > [CORS is not enforced] in the background and popup pages if the extension has those domains in their manifest permissions

    - Firefox
    - [Safari][web-extensions-safari]
    - [Chrome][web-extensions-chrome]

  [pure-random-number]:https://www.npmjs.com/package/pure-random-number
  [signal-and-giphy]:https://signal.org/blog/signal-and-giphy-update/
  [signal-and-giphy-wayback]:https://web.archive.org/web/20200524203345/https://signal.org/blog/signal-and-giphy-update/
  [range-requests]:https://developer.mozilla.org/en-US/docs/Web/HTTP/Range_requests
  [range-header]:https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Range
  [react-native-networking]:https://reactnative.dev/docs/network
  [web-extensions-safari]:https://developer.apple.com/forums/thread/654839
  [web-extensions-chrome]:https://developer.chrome.com/extensions/xhr
