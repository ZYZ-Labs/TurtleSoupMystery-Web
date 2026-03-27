import { createApp } from './app.js';

const port = Number(process.env.PORT ?? 8080);
const host = process.env.HOST ?? '0.0.0.0';

const app = await createApp();

app.listen(port, host, () => {
  console.log(`Turtle Soup Mystery backend listening on http://${host}:${port}`);
});
