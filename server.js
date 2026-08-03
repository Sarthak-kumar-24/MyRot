const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const dotenv = require("dotenv");
const path = require("path");
const jwt = require("jsonwebtoken");
const multer = require("multer");
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const cloudinary = require("cloudinary").v2;

// Load env vars
dotenv.config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// Cloudinary Configuration
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: "lust_gallery",
    allowed_formats: ["jpg", "png", "jpeg", "webp"],
    transformation: [{ width: 800, crop: "limit" }],
  },
});
const upload = multer({ storage: storage });

// MongoDB Connection
/*
if (
  process.env.MONGO_URI &&
  process.env.MONGO_URI !== "your_mongodb_connection_string"
) {
  mongoose
    .connect(process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    })
    .then(() => console.log("MongoDB Connected..."))
    .catch((err) => console.log("MongoDB Connection Error:", err));
} else {
  console.log(
    "MongoDB URI not provided. Running in memory-only mode for demo purposes.",
  );
}
  */

// MongoDB Connection
if (
  process.env.MONGO_URI &&
  process.env.MONGO_URI !== "your_mongodb_connection_string"
) {
  mongoose
    .connect(process.env.MONGO_URI, {
      family: 4, // Forces Node to use IPv4 for DNS resolution
    })
    .then(() => console.log("MongoDB Connected..."))
    .catch((err) => console.log("MongoDB Connection Error:", err));
}

// Models
const videoSchema = new mongoose.Schema({
  title: { type: String, required: true },
  images: [{ type: String }],
  link: { type: String, required: true },
  category: { type: String, required: true },
  rating: { type: Number, required: true },
  description: { type: String, required: true },
  isFavorite: { type: Boolean, default: false },
  dateAdded: { type: Date, default: Date.now },
});
const Video = mongoose.model("Video", videoSchema);

// Auth Middleware
const protect = (req, res, next) => {
  let token;
  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith("Bearer")
  ) {
    try {
      token = req.headers.authorization.split(" ")[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      // Verify it's admin (in a real app, check DB for user ID)
      if (decoded.role === "admin") {
        next();
      } else {
        res.status(401).json({ message: "Not authorized as an admin" });
      }
    } catch (error) {
      res.status(401).json({ message: "Not authorized, token failed" });
    }
  }
  if (!token) {
    res.status(401).json({ message: "Not authorized, no token" });
  }
};

// --- Routes ---

// Admin Login Route
app.post("/api/auth/login", (req, res) => {
  const { username, password } = req.body;
  // Hardcoded simple check for demo purposes
  if (username === "admin" && password === "admin") {
    const token = jwt.sign(
      { username, role: "admin" },
      process.env.JWT_SECRET,
      { expiresIn: "30d" },
    );
    res.json({ token });
  } else {
    res.status(401).json({ message: "Invalid credentials" });
  }
});

// GET all videos (PROTECTED) - Now with Pagination & Server-Side Filtering
app.get("/api/videos", protect, async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.json({ videos: [], hasMore: false }); // return empty if no DB connected
    }

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    // Build query filter
    let query = {};

    if (req.query.search) {
      query.$or = [
        { title: { $regex: req.query.search, $options: "i" } },
        { description: { $regex: req.query.search, $options: "i" } },
      ];
    }

    if (req.query.category && req.query.category !== "all") {
      query.category = req.query.category;
    }

    if (req.query.isFavorite === "true") {
      query.isFavorite = true;
    }

    // Build sort configuration
    let sortConfig = {};
    switch (req.query.sort) {
      case "newest":
        sortConfig = { dateAdded: -1 };
        break;
      case "oldest":
        sortConfig = { dateAdded: 1 };
        break;
      case "highestRating":
        sortConfig = { rating: -1 };
        break;
      case "lowestRating":
        sortConfig = { rating: 1 };
        break;
      case "titleAsc":
        sortConfig = { title: 1 };
        break;
      case "titleDesc":
        sortConfig = { title: -1 };
        break;
      default:
        sortConfig = { dateAdded: -1 };
        break;
    }

    const videos = await Video.find(query)
      .sort(sortConfig)
      .skip(skip)
      .limit(limit);

    const totalVideos = await Video.countDocuments(query);
    const hasMore = skip + videos.length < totalVideos;

    res.json({ videos, hasMore, total: totalVideos });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PATCH toggle favorite status (PROTECTED)
app.patch("/api/videos/:id/favorite", protect, async (req, res) => {
  try {
    const video = await Video.findById(req.params.id);
    if (!video) return res.status(404).json({ message: "Video not found" });

    video.isFavorite = !video.isFavorite;
    const updatedVideo = await video.save();
    res.json({ isFavorite: updatedVideo.isFavorite });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST a new video (PROTECTED)
// Using multer array for multiple images
app.post(
  "/api/videos",
  protect,
  upload.array("images", 10),
  async (req, res) => {
    try {
      if (mongoose.connection.readyState !== 1) {
        return res.status(500).json({
          message: "Database not connected. Please add MONGO_URI in .env",
        });
      }

      // Extract uploaded image URLs from Cloudinary
      const imageUrls = req.files ? req.files.map((file) => file.path) : [];

      // Combine with any previously existing string images passed (if any)
      let finalImages = [...imageUrls];
      if (req.body.existingImages) {
        const existing = JSON.parse(req.body.existingImages);
        finalImages = [...existing, ...finalImages];
      }

      const newVideo = new Video({
        title: req.body.title,
        images: finalImages,
        link: req.body.link,
        category: req.body.category,
        rating: req.body.rating,
        description: req.body.description,
      });

      const savedVideo = await newVideo.save();
      res.status(201).json(savedVideo);
    } catch (err) {
      res.status(400).json({ message: err.message });
    }
  },
);

// PUT update a video (PROTECTED)
app.put(
  "/api/videos/:id",
  protect,
  upload.array("images", 10),
  async (req, res) => {
    try {
      const imageUrls = req.files ? req.files.map((file) => file.path) : [];

      let finalImages = [...imageUrls];
      if (req.body.existingImages) {
        const existing = JSON.parse(req.body.existingImages);
        finalImages = [...existing, ...finalImages];
      }

      const updateData = {
        title: req.body.title,
        link: req.body.link,
        category: req.body.category,
        rating: req.body.rating,
        description: req.body.description,
      };

      if (finalImages.length > 0) {
        updateData.images = finalImages;
      }

      const updatedVideo = await Video.findByIdAndUpdate(
        req.params.id,
        updateData,
        { new: true },
      );
      res.json(updatedVideo);
    } catch (err) {
      res.status(400).json({ message: err.message });
    }
  },
);

// DELETE a video (PROTECTED)
app.delete("/api/videos/:id", protect, async (req, res) => {
  try {
    const video = await Video.findById(req.params.id);
    if (!video) return res.status(404).json({ message: "Video not found" });

    await video.deleteOne();
    res.json({ message: "Video removed" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Fallback to index.html for frontend routing
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
