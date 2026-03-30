// ====== 要检测的网站（直接写死在这里） ======
const SITES = [
  { name: "Google", url: "https://www.google.com" },
  { name: "GitHub", url: "https://github.com" },
  { name: "Example", url: "https://example.com" }
];

// ====== 单个网站检测 ======
async function checkSite(site) {
  const start = Date.now();

  try {
    const res = await fetch(site.url, {
      method: "GET",
      cf: { cacheTtl: 0 } // 禁止 Cloudflare 上游缓存
    });

    const latency = Date.now() - start;

    return {
      name: site.name,
      url: site.url,
      status: res.ok ? "UP" : "DOWN",
      latency,
      time: new Date().toISOString()
    };
  } catch (err) {
    return {
      name: site.name,
      url: site.url,
      status: "DOWN",
      latency: null,
      time: new Date().toISOString()
    };
  }
}

// ====== 批量检测 ======
async function checkAllSites() {
  return await Promise.all(SITES.map(checkSite));
}

// ====== Worker入口 ======
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // 只处理 API
    if (url.pathname !== "/api/status") {
      return new Response("Not Found", { status: 404 });
    }

    const cache = caches.default;

    // ====== 1. 尝试读取缓存 ======
    let response = await cache.match(request);

    if (response) {
      return response; // 命中缓存（60秒内）
    }

    // ====== 2. 没缓存 → 实时检测 ======
    const results = await checkAllSites();

    response = new Response(JSON.stringify(results, null, 2), {
      headers: {
        "Content-Type": "application/json",
        // ====== 关键：缓存60秒 ======
        "Cache-Control": "public, max-age=60"
      }
    });

    // ====== 3. 写入缓存（异步，不阻塞） ======
    ctx.waitUntil(cache.put(request, response.clone()));

    return response;
  }
};