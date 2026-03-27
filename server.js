const express = require('express');
const axios = require('axios');
const path = require('path');

const app = express();
const PORT = 3000;
const LOCAL_BACKEND = 'http://127.0.0.1:7001';

// User-Agent mapping
const UA_MAP = {
  clash:   'Clash.Verge/1.7.0',
  v2ray:   'v2rayN/6.23',
  singbox: 'sing-box/1.7.0',
  surge:   'Surge/5.0.0',
};

// Serve static frontend
app.use(express.static(path.join(__dirname, 'public')));

// API endpoint
app.get('/api/fetch', async (req, res) => {
  const { url, client } = req.query;

  // Validate parameters
  if (!url) {
    return res.status(400).json({ error: '缺少 url 参数' });
  }
  if (!client || !UA_MAP[client]) {
    return res.status(400).json({ error: '无效的 client 参数，可选值: clash, v2ray, singbox, surge' });
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(url);
  } catch {
    return res.status(400).json({ error: '无效的 URL 格式' });
  }

  // Build local request URL: rewrite to 127.0.0.1:7001
  const localUrl = `${LOCAL_BACKEND}${parsedUrl.pathname}${parsedUrl.search}`;
  const userAgent = UA_MAP[client];

  console.log(`[Fetch] client=${client}, ua="${userAgent}", target=${localUrl}`);

  try {
    const response = await axios.get(localUrl, {
      headers: { 'User-Agent': userAgent },
      timeout: 10000,
      responseType: 'text',
      // Don't let axios parse or transform the response
      transformResponse: [(data) => data],
    });

    // Forward relevant headers from upstream
    const headersToForward = [
      'content-disposition',
      'subscription-userinfo',
      'profile-update-interval',
      'content-type',
    ];
    headersToForward.forEach((h) => {
      if (response.headers[h]) {
        res.set(h, response.headers[h]);
      }
    });

    res.send(response.data);
  } catch (err) {
    console.error(`[Error] ${err.message}`);

    if (err.code === 'ECONNREFUSED') {
      return res.status(502).json({
        error: '无法连接本地后端 (127.0.0.1:7001)，请确认 Xboard 服务正在运行',
      });
    }
    if (err.code === 'ECONNABORTED' || err.message.includes('timeout')) {
      return res.status(504).json({
        error: '请求本地后端超时 (10s)，请检查 Xboard 服务状态',
      });
    }
    if (err.response) {
      return res.status(err.response.status).json({
        error: `本地后端返回错误: ${err.response.status} ${err.response.statusText}`,
      });
    }

    res.status(500).json({ error: `请求失败: ${err.message}` });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Sub-Fetcher is running on http://0.0.0.0:${PORT}`);
  console.log(`📡 Local backend target: ${LOCAL_BACKEND}`);
});
