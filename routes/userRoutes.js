const express = require("express");
const multer = require("multer");
const User = require("../models/User");

const router = express.Router();

// multer setup (store in memory for now)
const storage = multer.memoryStorage();
const upload = multer({ storage });

// get user by id
router.get("/api/user/:id", async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select("-password");
    res.json(user);
  } catch (err) {
    res.status(500).json({ message: "Error fetching user" });
  }
});

// update user
router.put("/api/user/:id", upload.single("image"), async (req, res) => {
  try {
    const { username, dob } = req.body;
    let updateData = { username, dob };

    if (req.file) {
      updateData.image = `data:${req.file.mimetype};base64,${req.file.buffer.toString("base64")}`;
    }

    const updatedUser = await User.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true }
    );

    res.json(updatedUser);
  } catch (err) {
    res.status(500).json({ message: "Error updating user" });
  }
});

module.exports = router;
