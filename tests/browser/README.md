# Browser tests

Build the package, install the test browsers, and run the suite:

```sh
npm run build
npx playwright install chromium firefox webkit
npm run test:browser
```

Set `CAROUSEL_BROWSERS` to `chromium`, `firefox`, or `webkit` to run one browser.
Use a comma-separated list to run several browsers.
Set `CAROUSEL_BROWSER_CHANNEL=chrome` to use installed Chrome for Chromium tests.
