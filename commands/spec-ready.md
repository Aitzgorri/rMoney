# spec:ready

Marks a spec as ready to implement (draft → ready).
Use this when the spec is agreed on and implementation can begin.

## Usage
```bash
npm run spec:ready -- "name"
```

## Example
```bash
npm run spec:ready -- accounts
```

## Recommended workflow
Run validate first to catch any gaps:
```bash
npm run spec:validate -- accounts
npm run spec:ready -- accounts
```

## Note
The `--` separator is required to pass arguments through npm to the script.
