const request = require("supertest");
const app = require("../app");

describe("Public endpoints", () => {
  test("GET /api/v1/products should return 200 or 400 (no DB)", async () => {
    const res = await request(app).get("/api/v1/products");
    expect([200, 400]).toContain(res.status);
  });

  test("GET /api/v1/categories should return 200 or 400 (no DB)", async () => {
    const res = await request(app).get("/api/v1/categories");
    expect([200, 400]).toContain(res.status);
  });

  test("GET /api/v1/brands should return 200 or 400 (no DB)", async () => {
    const res = await request(app).get("/api/v1/brands");
    expect([200, 400]).toContain(res.status);
  });

  test("GET /api/v1/offers/active should return 200 or 400 (no DB)", async () => {
    const res = await request(app).get("/api/v1/offers/active");
    expect([200, 400]).toContain(res.status);
  });

  test("GET /api/v1/exchange-rates/current should return 200 or 400 (no DB)", async () => {
    const res = await request(app).get("/api/v1/exchange-rates/current");
    expect([200, 400]).toContain(res.status);
  });
});
