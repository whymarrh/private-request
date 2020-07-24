<img alt="Private Request" src="https://user-images.githubusercontent.com/1623628/88346472-fcad0100-cd22-11ea-80f7-aac41eb9efd5.png" width="512" height="256">

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

This repository is available under the ISC License. See [`LICENSE.md`](./LICENSE.md).

  [pure-random-number]:https://www.npmjs.com/package/pure-random-number
