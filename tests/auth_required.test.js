const request = require("supertest");
const app = require("../app");

describe("Auth required endpoints", () => {
  test("GET /api/v1/cart should require auth", async () => {
    const res = await request(app).get("/api/v1/cart");
    expect([401, 403]).toContain(res.status);
  });

  test("POST /api/v1/orders/:cartId should require auth", async () => {
    const res = await request(app).post("/api/v1/orders/123");
    expect([401, 403]).toContain(res.status);
  });

  test("GET /api/v1/coupons should require admin/manager", async () => {
    const res = await request(app).get("/api/v1/coupons");
    expect([401, 403]).toContain(res.status);
  });

  test("GET /api/v1/wallet should require auth", async () => {
    const res = await request(app).get("/api/v1/wallet");
    expect([401, 403]).toContain(res.status);
  });
});
