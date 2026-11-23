import mongoose from "mongoose";

const pushTokenSchema = new mongoose.Schema(
  {
    token: { type: String, required: true, unique: true, index: true },
    platform: { type: String, default: "android" },
    muted: { type: Boolean, default: false, index: true },
    appVariant: { type: String, default: "production" },
    lastSeenAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

const PushToken = mongoose.model("PushToken", pushTokenSchema);

export default PushToken;
