# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is enabled on this template. See [this documentation](https://react.dev/learn/react-compiler) for more information.

Note: This will impact Vite dev & build performances.

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.

## Google Maps API key (setup)

This project loads the Google Maps JavaScript API at runtime. To configure a key for local development:

- Create a file named `.env` or `.env.local` in the project root.
- Add the following line and replace `YOUR_KEY_HERE` with your key:

```
VITE_GOOGLE_MAPS_API_KEY=YOUR_KEY_HERE
```

- Restart the Vite dev server after changing env variables.

Security & troubleshooting:
- Do NOT commit your API key. Use `.gitignore` to keep `.env` out of version control.
- In Google Cloud Console, enable the **Maps JavaScript API** and ensure billing is enabled for the project owning the key.
- Restrict the key to your app's origins (HTTP referrers) or to server IPs where appropriate.
- If the map shows an error in the browser console, check the console message, billing status, and key restrictions.

If you accidentally exposed a key (for example in a screenshot or public repo), revoke or rotate it in Google Cloud and create a new restricted key.
