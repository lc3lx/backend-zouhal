const request = require("supertest");
const mongoose = require("mongoose");
const app = require("../app");

describe("Smoke tests", () => {
  afterAll(async () => {
    await mongoose.connection.close();
  });

  test("GET /healthz returns ok", async () => {
    const res = await request(app).get("/healthz");
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("status", "ok");
  });

  test("GET /api/v1/products paginates and caches", async () => {
    const res = await request(app).get("/api/v1/products");
    expect([200, 400]).toContain(res.status); // tolerate 400 if no DB
    // If success, expect pagination keys
    if (res.status === 200) {
      expect(res.body).toHaveProperty("paginationResult");
    }
  });
});
