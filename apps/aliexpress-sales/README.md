# AliExpress Sales Calendar

Subscribable iCalendar feed of AliExpress promotional events, published at
`https://kalenderabos.de/aesales/`.

```bash
pnpm build
pnpm test
pnpm update
```

Source assets live in `public/`. The website and `aesales.ics` are generated in
`www/`. The feed is published at `https://kalenderabos.de/aesales.ics`. Sale
data is read from `https://en.ali-shop.net/sales` and
validated against the last known-good event set before it is accepted.
