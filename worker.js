// ====== 要检测的网站（写死在这里） ======
const SITES = [
  { name: "xf_blog", url: "https://lm-xiao-fen.github.io" },
  { name: "Google", url: "https://www.google.com" },
  { name: "GitHub", url: "https://github.com" },
  { name: "Example", url: "https://example.com" }
];

// ====== 单个网站检测（带超时） ======
async function checkSite(site) {
  const start = Date.now();

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000); // 5秒超时

  try {
    const res = await fetch(site.url, {
      method: "GET",
      signal: controller.signal,
      cf: { cacheTtl: 0 } // 禁止 Cloudflare 上游缓存
    });

    clearTimeout(timeout);

    return {
      name: site.name,
      url: site.url,
      status: res.ok ? "UP" : "DOWN",
      latency: Date.now() - start,
      time: new Date().toISOString()
    };
  } catch (err) {
    clearTimeout(timeout);

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
  return Promise.all(SITES.map(checkSite));
}

// ====== 构造响应（统一加 CORS） ======
function jsonResponse(data) {
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json",
      // 👉 关键：允许 Pages 跨域访问
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "*",
      // 👉 缓存 60 秒（核心）
      "Cache-Control": "public, max-age=60"
    }
  });
}

// ====== Worker 入口 ======
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // ====== 处理 CORS 预检 ======
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, OPTIONS",
          "Access-Control-Allow-Headers": "*"
        }
      });
    }

    // ====== API 路由 ======
    if (url.pathname !== "/api/status") {
      return new Response("Not Found", { status: 404 });
    }

    const cache = caches.default;

    // ====== 1. 查缓存 ======
    let cached = await cache.match(request);
    if (cached) {
      return cached;
    }

    // ====== 2. 实时检测 ======
    const results = await checkAllSites();

    const response = jsonResponse(results);

    // ====== 3. 写入缓存（异步） ======
    ctx.waitUntil(cache.put(request, response.clone()));

    return response;
  }
};
