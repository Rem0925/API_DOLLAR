import mongoose from "mongoose";

const configMonedaSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  category: { type: String, required: true },
  title: { type: String, required: true },
  shortTitle: { type: String, required: true },
  apiField: { type: String, required: true },
  symbol: { type: String, required: true },
  color: { type: String, required: true },
  iconName: { type: String, required: true },
  iconWeight: { type: String, required: true },
  isBasedOnBcv: { type: Boolean, default: false }
});

const ConfigMoneda = mongoose.model("ConfigMoneda", configMonedaSchema);

export default ConfigMoneda;
