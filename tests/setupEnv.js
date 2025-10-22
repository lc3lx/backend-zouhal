process.env.NODE_ENV = "test";
process.env.DB_URI =
  process.env.DB_URI || "mongodb://127.0.0.1:27017/zouhal_test";
process.env.BASE_URL = process.env.BASE_URL || "http://localhost:8000";
