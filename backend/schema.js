const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  username: { type: String, required: true },
  email: { type: String, required: true },
  password: { type: String, required: true },
  phoneNumber: { type: String, required: false },
  zipcode: { type: String, required: false },
  state: { type: String, required: false },
  city: { type: String, required: false },
  profilePhoto: { type: String, required: false },
});

const caseSchema = new mongoose.Schema({
  description: String,
  name: String,
  age: Number,
  gender: String,
  landmark: String,
  city: String,
  state: String,
  postalcode: String,
  reward: Number,
  imageUrl: String,
  imageName: String,
  uploadedUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  likeCount: { type: Number, default: 0 },
  embedding: [Number],
});

const messageSchema = new mongoose.Schema({
  senderId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  receiverId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  message: String,
  timestamp: { type: Date, default: Date.now },
  fileUrl: String,         // For document/photo sharing
  fileName: String,        // For document/photo sharing
  fileType: String,        // For document/photo sharing
  location: {              // For location sharing
    latitude: Number,
    longitude: Number,
    url: String
  }
});

const User = mongoose.model("user", userSchema);
const Case = mongoose.model("Case", caseSchema);
const Message = mongoose.model("Message", messageSchema);

module.exports = { User, Case, Message };
