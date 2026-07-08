import mongoose from 'mongoose';

const premiumCodeSchema = new mongoose.Schema({
    code: { type: String, unique: true, required: true },
    username: { type: String, required: true },
    linkedDeviceId: { type: String, default: null },
    isActive: { type: Boolean, default: true }
});

const PremiumCode = mongoose.model('PremiumCode', premiumCodeSchema);

export default PremiumCode;
