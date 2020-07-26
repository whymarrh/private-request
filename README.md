<img alt="Private Request" src="https://user-images.githubusercontent.com/1623628/88346472-fcad0100-cd22-11ea-80f7-aac41eb9efd5.png" height="256">

A fetch wrapper that hampers traffic analysis, based on Signal's [_Expanding Signal GIF search_][signal-and-giphy] article.

  [signal-and-giphy]:https://signal.org/blog/signal-and-giphy-update/
  [signal-and-giphy-wayback]:https://web.archive.org/web/20200524203345/https://signal.org/blog/signal-and-giphy-update/

**WARNING:** this package requires a random number generator that will produce uniform numbers, preferably one which is cryptographically sound. One option is [`pure-random-number`][pure-random-number], which is available for both browsers and Node.

### Tests

To run the test suite locally:

```bash
$ yarn
$ ( cd tests/fixtures/ && ./mkdat )
$ yarn start:nginx
$ yarn test
```

To run the e2e tests, visit `localhost:8001` in a browser.

This repository is available under the ISC License. See [`LICENSE.md`](./LICENSE.md).

  [pure-random-number]:https://www.npmjs.com/package/pure-random-number

### On CORS

The ability to perform range requests for a given resource requires the correct CORS headers.

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

  [react-native-networking]:https://reactnative.dev/docs/network
  [web-extensions-safari]:https://developer.apple.com/forums/thread/654839
  [web-extensions-chrome]:https://developer.chrome.com/extensions/xhr
