# Data snapshots

One file per data review: `YYYY-MM-DD.md` (see step H of `../DAILY_PROCEDURE.md` for what goes in it).
Reviews happen 3 days after the first published articles and then every 3rd day. Search Console data is ~2 days behind,
Bing's is slower: small numbers are noisy, compare snapshots, do not react to a single day.

Template:

```
# Data snapshot YYYY-MM-DD
Covered: Google 7d and 28d ending YYYY-MM-DD; Bing last 7d / 30d.
## Totals
| Source | Clicks | Impressions | CTR | Avg position |
## Pages
| URL | Impr | Clicks | CTR | Pos | Top query | Indexed? (why not) |
## Top 20 queries
| Query | Impr | Clicks | CTR | Pos | Page that ranks |
## URLs published in the last 14 days
| URL | Published | Google index status | Bing index status |
## Outcome of earlier decisions
## Decisions (page, numbers behind it, change made, what we expect)
```
