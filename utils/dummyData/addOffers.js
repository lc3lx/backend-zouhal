const mongoose = require("mongoose");
const dotenv = require("dotenv");
const fs = require("fs");
const path = require("path");

// Load environment variables
dotenv.config();

// Import models
const Offer = require("../models/offerModel");
const User = require("../models/userModel");

// Connect to database
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.DATABASE_URL);
    console.log("Connected to database");
  } catch (error) {
    console.error("Database connection error:", error);
    process.exit(1);
  }
};

// Add offers to database
const addOffers = async () => {
  try {
    // Read offers data
    const offersPath = path.join(__dirname, "offers.json");
    const offersData = JSON.parse(fs.readFileSync(offersPath, "utf8"));

    // Get admin user (first user with admin role)
    const adminUser = await User.findOne({ role: "admin" });
    if (!adminUser) {
      console.error("No admin user found. Please create an admin user first.");
      process.exit(1);
    }

    // Clear existing offers
    await Offer.deleteMany({});
    console.log("Cleared existing offers");

    // Add offers with admin as creator
    const offersWithCreator = offersData.map((offer) => ({
      ...offer,
      createdBy: adminUser._id,
    }));

    const createdOffers = await Offer.insertMany(offersWithCreator);
    console.log(`Added ${createdOffers.length} offers to database`);

    // Display created offers
    createdOffers.forEach((offer) => {
      console.log(`- ${offer.title}: ${offer.description}`);
    });
  } catch (error) {
    console.error("Error adding offers:", error);
  }
};

// Main function
const main = async () => {
  await connectDB();
  await addOffers();
  await mongoose.connection.close();
  console.log("Database connection closed");
  process.exit(0);
};

// Run the script
main();
