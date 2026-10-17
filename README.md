# ReadComicsOnline index

A small, automatically updated copy of readcomicsonline.ru's **public** series and issue lists, plus series details from [Metron](https://metron.cloud). The **ReadComicsOnline** module for the KETSU app reads it, which makes the module much faster:



| File | Purpose |
|---|---|
| `generate.js` | Builds the index (`node generate.js site`) and does Metron lookups (`node generate.js metron`) |
| `metron.js` | Metron API client (rate limits, retries) and series matching |
| `test-metron.js` | Tests for `metron.js` with a simulated Metron (`node test-metron.js`) |
| `lib/` | Shared code copied from the KETSU module's source, so both use the same rules |
| `data/metron.json` | Saved Metron results |
| `.github/workflows/build-index.yml` | The 6-hourly GitHub job |

Series details come from [Metron](https://metron.cloud), the community comic book database. Series and issue lists come from readcomicsonline.ru's public sitemaps.
