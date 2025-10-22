const cacheStore = new Map();

function getKey(key) {
  return key;
}

function setCache(key, data, ttlSeconds) {
  const expireAt = Date.now() + ttlSeconds * 1000;
  cacheStore.set(getKey(key), { data, expireAt });
}

function getCache(key) {
  const item = cacheStore.get(getKey(key));
  if (!item) return null;
  if (Date.now() > item.expireAt) {
    cacheStore.delete(getKey(key));
    return null;
  }
  return item.data;
}

// Middleware factory for caching GET list responses
function cacheMiddleware(ttlSeconds = 60) {
  return (req, res, next) => {
    if (req.method !== "GET") return next();
    const key = `${req.originalUrl}`;
    const hit = getCache(key);
    if (hit) {
      return res.status(200).json(hit);
    }
    const json = res.json.bind(res);
    res.json = (body) => {
      try {
        setCache(key, body, ttlSeconds);
      } catch (e) {
        // ignore cache errors
      }
      return json(body);
    };
    return next();
  };
}

module.exports = { cacheMiddleware, setCache, getCache };
