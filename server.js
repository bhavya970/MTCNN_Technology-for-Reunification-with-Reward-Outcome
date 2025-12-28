const express = require("express");
const multer = require("multer");
const cors = require("cors");
const path = require("path");
const mongoose = require("mongoose");
const { Server } = require("socket.io");
const http = require("http");
const faceapi = require("face-api.js");
const canvas = require("canvas");
const bcrypt = require("bcrypt");
const userRoutes = require("./routes/userRoutes");
const { Case, User, Message } = require("./backend/schema");
const { Canvas, Image, ImageData } = canvas;
const authRoutes = require("./backend/authRoutes");

require("dotenv").config();

const app = express();
const corsOptions = {
  origin: "http://localhost:3000", // Change to your frontend URL
  credentials: true,
};
app.use(cors(corsOptions));
app.use(express.json());
app.use("/", authRoutes);
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "http://localhost:3000",
    methods: ["GET", "POST"],
  },
});


const nodemailer = require("nodemailer");

app.post("/api/send-email", async (req, res) => {
  const { to, subject, text } = req.body;
  if (!to || !subject || !text) {
    return res.status(400).json({ error: "Missing fields" });
  }
  try {
    // Configure your transporter (use your real credentials or environment variables)
    const transporter = nodemailer.createTransport({
      host: "sandbox.smtp.mailtrap.io",
      port: 2525,
      auth: {
        user: "fd5a775943ab1d", // replace with your Mailtrap username
        pass: "bb1683cfa05434", // replace with your Mailtrap password
      },
    });

    await transporter.sendMail({
      from: "noreply@bhavya.com", // replace with your email
      to,
      subject,
      text,
    });

    res.json({ success: true });
  } catch (err) {
    console.error("Email send error:", err);
    res.status(500).json({ error: "Failed to send email" });
  }
});

// API to fetch user details by user ID
app.get("/api/user/:id", async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    return res.json(user);
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// MongoDB connection and schema (existing code)
const uri =
  "mongodb+srv://bhavyasrigurram4_db_user:BC579Hv6rNljup8O@cluster0.snzarz4.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";
mongoose
  .connect(uri, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log("MongoDB connected"))
  .catch((err) => console.error("MongoDB connection error:", err));

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "uploads/"),
  filename: (req, file, cb) =>
    cb(null, Date.now() + path.extname(file.originalname)),
});
const upload = multer({ storage });

// File/document upload endpoint for chat (accepts any file type)
app.post("/api/upload-file", upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });
  const fileUrl = `http://localhost:5000/uploads/${req.file.filename}`;
  res.json({ url: fileUrl, name: req.file.originalname, type: req.file.mimetype });
});

//chat
app.get("/chats/:senderId/:receiverId", async (req, res) => {
  const { senderId, receiverId } = req.params;
  const messages = await Message.find({
    $or: [
      { senderId, receiverId },
      { senderId: receiverId, receiverId: senderId },
    ],
  }).sort({ timestamp: 1 });
  res.json(messages);
});

app.get("/api/chat-contacts/:userId", async (req, res) => {
  const { userId } = req.params;
  // Find all messages where user is sender or receiver
  const messages = await Message.find({
    $or: [{ senderId: userId }, { receiverId: userId }],
    // Exclude messages where both sender and receiver are the current user
    // nor: [{ senderId: userId }, { receiverId: userId }],
  }).sort({ timestamp: -1 });

  // Map to unique contacts with last message
  const contactsMap = {};
  messages.forEach((msg) => {
    const contactId =
      String(msg.senderId) === String(userId)
        ? String(msg.receiverId)
        : String(msg.senderId);
    if (!contactsMap[contactId]) {
      // Only add contact if it's not the current user
      if (contactId !== String(userId)) {
        contactsMap[contactId] = {
          userId: contactId,
          lastMessage: msg.message,
          time: msg.timestamp,
        };
      }
    }
  });

  // Optionally, fetch user details for each contact
  const contacts = await Promise.all(
    Object.values(contactsMap).map(async (contact) => {
      const user = await User.findById(contact.userId);
      return {
        ...contact,
        username: user?.username || "Unknown",
        profilePhoto: user?.profilePhoto || "",
      };
    })
  );

  res.json(contacts);
});

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  socket.on("joinRoom", ({ senderId, receiverId }) => {
    const roomId = [senderId, receiverId].sort().join("_");
    socket.join(roomId);
  });

  // Enhanced sendMessage handler for text, file, and location messages
  socket.on("sendMessage", async (data) => {
    const { senderId, receiverId, message, fileUrl, fileName, fileType, location } = data;
    if (!senderId || !receiverId) {
      console.log("Invalid sender or receiver:", senderId, receiverId);
      return;
    }
    // Build message object
    const msgObj = { senderId, receiverId };
    if (message) msgObj.message = message;
    if (fileUrl) {
      msgObj.fileUrl = fileUrl;
      msgObj.fileName = fileName;
      msgObj.fileType = fileType;
    }
    if (location) {
      msgObj.location = location;
    }
    const newMsg = new Message(msgObj);
    await newMsg.save();

    const roomId = [senderId, receiverId].sort().join("_");
    io.to(roomId).emit("receiveMessage", newMsg);
  });

  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);
  });
});

app.patch(
  "/update-profile",
  upload.single("profilePhoto"),
  async (req, res) => {
    try {
      const { email, phoneNumber, zipcode, state, city } = req.body;
      let profilePhoto;

      if (req.file) {
        profilePhoto = `http://localhost:5000/uploads/${req.file.filename}`; // store relative path
      }

      console.log(req.body, "req.body");
      console.log(req.file, "req.file");

      // Build update object
      const updates = {};
      if (phoneNumber) updates.phoneNumber = phoneNumber;
      if (zipcode) updates.zipcode = zipcode;
      if (state) updates.state = state;
      if (city) updates.city = city;
      (updates.profilePhoto = `http://localhost:5000/uploads/${req.file.filename}`),
        console.log(updates, "updates");

      const user = await User.findOneAndUpdate(
        { email }, // Find user by email
        updates,
        { new: true } // Return the updated document
      );
      console.log(user, "user");
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      res.json({ success: true, user: user });
    } catch (err) {
      console.error("Update profile error:", err);
      res.status(500).json({ message: "Server error" });
    }
  }
);

app.use("/", userRoutes);

faceapi.env.monkeyPatch({ Canvas, Image, ImageData });

// Load models (make sure you have a 'models' folder with the weights)
const MODEL_URL = path.join(__dirname, "models");
Promise.all([
  faceapi.nets.ssdMobilenetv1.loadFromDisk(MODEL_URL),
  faceapi.nets.faceRecognitionNet.loadFromDisk(MODEL_URL),
  faceapi.nets.faceLandmark68Net.loadFromDisk(MODEL_URL),
]).then(() => console.log("Face-api models loaded"));

// Upload endpoint (existing code)
app.post("/api/upload", upload.single("image"), async (req, res) => {
  // Extract face embedding from uploaded image
  const img = await canvas.loadImage(req.file.path);
  const detection = await faceapi
    .detectSingleFace(img)
    .withFaceLandmarks()
    .withFaceDescriptor();

  if (!detection) {
    return res
      .status(400)
      .json({ error: "No face detected in uploaded image." });
  }

  const embedding = Array.from(detection.descriptor);

  // Save to DB
  const caseData = new Case({
    description: req.body.description,
    reward: Number(req.body.reward),
    name: req.body.name,
    age: Number(req.body.age),
    gender: req.body.gender,
    landmark: req.body.landmark,
    city: req.body.city,
    state: req.body.state,
    postalcode: req.body.postalcode,
    uploadedUserId: req.body.uploadedUserId,
    imageUrl: `http://localhost:5000/uploads/${req.file.filename}`,
    likeCount: 0,
    imageName: req.file.originalname,
    embedding,
  });

  await caseData.save();
  res.json({ success: true, case: caseData });
});

app.post("/api/case/:id/like", async (req, res) => {
  try {
    const caseId = req.params.id;
    const updatedCase = await Case.findByIdAndUpdate(
      caseId,
      { $inc: { likeCount: 1 } },
      { new: true }
    );
    if (!updatedCase) {
      return res
        .status(404)
        .json({ success: false, message: "Case not found" });
    }
    res.json({ success: true, case: updatedCase });
  } catch (err) {
    console.error("Increment likeCount error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// Match endpoint
app.post("/api/match", upload.single("image"), async (req, res) => {
  // Load uploaded image and get descriptor
  console.log(req.file, "req.file.path");
  const img = await canvas.loadImage(req.file.path);
  console.log(img, "img");
  const detection = await faceapi
    .detectSingleFace(img)
    .withFaceLandmarks()
    .withFaceDescriptor();

  console.log("detention", detection);

  if (!detection) {
    return res.json({ match: null });
  }

  const uploadedDescriptor = detection.descriptor;

  // Fetch all cases with embeddings
  const cases = await Case.find({ embedding: { $exists: true } });

  let bestMatch = null;
  let matches = [];
  let minDistance = 0.8; // threshold for face similarity
  cases.forEach((entry) => {
    if (
      entry.embedding &&
      entry.embedding.length === uploadedDescriptor.length
    ) {
      const distance = faceapi.euclideanDistance(
        uploadedDescriptor,
        entry.embedding
      );
      const similarity = Math.round((1 - distance) * 100);
      const matchObj = {
        imageUrl: entry.imageUrl,
        description: entry.description,
        reward: entry.reward,
        similarity,
        ...entry
      };
      matches.push(matchObj);
      if (distance < minDistance) {
        minDistance = distance;
        bestMatch = matchObj;
      }
    }
  });

  res.json({ matches, bestMatch });
});

app.get("/api/cases/:id", async (req, res) => {
  const id = req.params.id;
  const cases = await Case.find({ uploadedUserId: { $ne: id } });
  res.json(cases);
});

app.get("/api/mycases/:id", async (req, res) => {
  const id = req.params.id;
  const cases = await Case.find({ uploadedUserId: id });
  res.json(cases);
});
app.get("/api/users", async (req, res) => {
  const users = await User.find();
  res.json(users);
});
// Serve uploaded images
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// Start server
server.listen(5000, () => {
  console.log("Backend running on http://localhost:5000");
});
