# Browser Composer CLI

[![npm version](https://badge.fury.io/js/browser-composer.svg)](https://www.npmjs.com/package/browser-composer)

> A CLI for managing browsers in containers

## Features

- Start a browser with a named profile, restart it later with the same profile state
- Save a browser's profile state as a preset and start new browsers with the preset profile's state
- Allows viewing console messages and taking screenshots
- Exposes a webrtc based remote control interface
- Exposes devtools port for connecting puppeteer, playwright,and friends

## Usage

### Basic Browser Management

Start a browser with a named profile (runs in background by default):

```bash
browser-composer start-browser my-profile
```

Start a browser in attached/interactive mode:

```bash
browser-composer start-browser my-profile --attach
```

Start a browser and open a specific URL:

```bash
browser-composer start-browser my-profile https://example.com
```

List all browser profiles:

```bash
browser-composer list-browsers
```

Stop a specific browser:

```bash
browser-composer stop-browser my-profile
```

Stop all running browsers:

```bash
browser-composer stop-browser --all
```

Remove a browser profile and its data:

```bash
browser-composer remove-browser my-profile
```

### Profile Presets

Save a browser profile as a reusable preset:

```bash
browser-composer save-preset my-profile clean-workspace --description "Fresh browser with logged-in accounts"
```

List all saved presets:

```bash
browser-composer list-presets
```

Start a new browser using a preset:

```bash
browser-composer start-browser new-profile --init-with-preset clean-workspace
```

### Console Logging

View console messages from a browser:

```bash
browser-composer show-logs my-profile
```

Follow console logs in real-time (like `tail -f`):

```bash
browser-composer show-logs my-profile --follow
```

Include logs from before the last clear:

```bash
browser-composer show-logs my-profile --include-scrollback
```

Filter logs by type:

```bash
browser-composer show-logs my-profile --type error,warning
```

Clear console log history:

```bash
browser-composer clear-logs my-profile
```

### Screenshots

Take a full-page screenshot:

```bash
browser-composer take-screenshot my-profile
```

Capture a specific element using CSS selector:

```bash
browser-composer take-screenshot my-profile ".main-content"
```

### Remote Control & Automation

When you start a browser, it exposes three ports for remote control:

```
Browser is available at:
  - WebRTC: http://localhost:8080      # Visual remote control interface
  - DevTools: http://localhost:9222     # Chrome DevTools Protocol
  - Screen Recording API: http://localhost:10001  # Recording controls
```

#### Connecting with Puppeteer

```javascript
const puppeteer = require('puppeteer-core')

const browser = await puppeteer.connect({
  browserURL: 'http://localhost:9222',
  defaultViewport: null,
})

const page = await browser.pages()[0]
await page.goto('https://example.com')
```

#### Connecting with Playwright

```javascript
const { chromium } = require('playwright')

const browser = await chromium.connectOverCDP('http://localhost:9222')
const context = await browser.contexts()[0]
const page = await context.pages()[0]
await page.goto('https://example.com')
```
