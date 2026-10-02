# avijitsinha.com

This repository owns the public website for `avijitsinha.com`. The React/Vite build is served by nginx on Cloud Run behind the site's reverse proxy. Its homepage links to Music Training and the canonical privacy policy at [`/privacy/`](https://avijitsinha.com/privacy/).

Music Training has optional standalone Google sign-in through the site's existing Firebase project. It stores practice preferences in the browser and does not request Google Calendar or Tasks access. The former common account service and hosted Routine Dashboard have been retired; their source remains available in Git history rather than the current website tree.

## Local development

```sh
npm ci
npm run dev
```

Verify changes with:

```sh
npm run lint
npm run build
```
