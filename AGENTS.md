# Repository Guide (`bmis1572`)

## Live Deployment

- **Deployed demo site (Vercel):** https://explorer-five-iota.vercel.app/
- **Repository:** https://github.com/henryweimd/bmis1572
- Always verify pushed `main` frontend changes on https://explorer-five-iota.vercel.app/ once Vercel finishes building.

## Verification Commands

```sh
# Python pipeline + shipped Parquet snapshot integrity tests
python3 -m pytest -v tests/
python3 tests/test_ta_rules.py

# Frontend unit tests, build, and responsive/SQL-safety checks
cd explorer
npm test
npm run build
npm run check:responsive
```

## Key Conventions

- Follow `docs/responsive.md` on every frontend edit (390px + 1280px, no fixed-pixel layout widths > 16px, every `<table>` inside `.table-scroll`, sticky `.vintage` first column).
- Every user-driven SQL `LIKE` query in `explorer/src/` must use `escapeLike()` with `ESCAPE '\'` (or `normName()`).
- Canonical metric definitions live in `pipeline/aggregate.py` (`DEFINITIONS`) and are embedded in `explorer/public/data/manifest.json`.
