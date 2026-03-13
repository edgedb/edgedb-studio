# DBSOF web app

This package contains the browser shell for the DBSOF UI. It runs entirely in
the browser with no backend required and can later be wired up to any platform
through a custom adapter when you are ready.

## Development

> **Prerequisites**: You will need to have Yarn 2+ installed, and have run the
> `yarn install` command at the repo root to install the workspace dependencies.

To start the UI dev server:

```sh
yarn dev
```

The app is served at `http://localhost:3002/ui`.

The UI renders with local sample content only; no backend is started or
required. To integrate with your own APIs, add your adapter and configuration
on top of this UI shell without changing the visual components.

## UI Tests

> **Prerequisites**: The UI tests use Selenium WebDriver to run tests on Chrome.
> You will need to have Chrome browser installed, and to have `chromedriver`
> installed and available in the system `PATH`.
>
> (Instructions to install `chromedriver`: https://www.selenium.dev/documentation/webdriver/getting_started/install_drivers/#3-the-path-environment-variable)

To run the UI tests:

```sh
yarn test
```

If the UI dev server is already running on port 3002 then the tests will reuse
it; otherwise the test runner will start the UI for the duration of the test
run. No backend services are started by the tests.

By default the tests run `chromedriver` in headless mode, but to see the
Chrome window during the tests (eg. for debugging), run with the `--no-headless`
flag:

```sh
yarn test --no-headless
```

### Writing tests

The tests use the [Jest](https://jestjs.io) framework, with a custom
environment that provides an already configured instance of the `WebDriver`
class as the global variable `driver`. The following common webdriver API's
are also exposed as global variables: `By`, `until`, `Key`.
