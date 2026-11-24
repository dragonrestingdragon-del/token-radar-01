# token-radar-01

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/dragonrestingdragon-del/token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/dragonrestingdragon-del/token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A token launch radar: it ranks 200 protocols from a sealed DefiLlama snapshot — all 40 watchlist protocols that have no token yet, plus 160 early candidates — by the value a token would have if the protocol's record stayed as it is. Each protocol's implied value is its TVL multiplied by the median market-cap/TVL multiple of already-tokenised peers in the same category, adjusted for 7-day TVL growth, protocol maturity and chain breadth, with a per-row confidence score. The dashboard shows the ranked board, a detail view per protocol with the multiple broken down step by step, category / chain / TVL filters, and a concrete multi-step farming plan for every row.

## Run it

```sh
# place the snapshot at /input/snapshot.json (the kit's input/snapshot.json), then:
node main.ts
# writes /output/board.json, /output/data.js, /output/dossier.json,
# and copies dashboard/ and screenshots/ into /output/
```

---

<sub>Entered on [make.fun](https://make.fun/?ref=d7q47zjc&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
