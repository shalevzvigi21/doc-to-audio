const TARGET = "https://doc-to-audio-api.onrender.com/health";

async function ping() {
  const res = await fetch(TARGET, { headers: { "user-agent": "doc-to-audio-keepalive" } });
  console.log(`keepalive ${res.status}`);
}

export default {
  async scheduled(_event, _env, ctx) {
    ctx.waitUntil(ping());
  },
  // Visiting the worker URL runs one ping and shows the result.
  async fetch() {
    const res = await fetch(TARGET);
    return new Response(`Render API answered ${res.status}\n`);
  },
};
