import mongoose from 'mongoose';

const { Schema } = mongoose;

/** Reused by extractSchema()/diffSchemas() output: { path, types } entries. */
const SchemaEntrySchema = new Schema(
  {
    path: { type: String, required: true },
    types: { type: [String], required: true },
  },
  { _id: false }
);

const ALLOWED_STATUSES = ['PENDING', 'HEALTHY', 'BREAKING', 'ERROR'];

const MonitorSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      index: true,
      default: null,
    },

    name: { type: String, required: true, trim: true, maxlength: 120 },

    url: {
      type: String,
      required: true,
      trim: true,
      validate: {
        validator: (value) => /^https?:\/\/.+/i.test(value),
        message: (props) => `${props.value} is not an http:// or https:// URL`,
      },
    },

    // Custom headers to send with each check, e.g. { "x-api-key": "..." }.
    headers: { type: Map, of: String, default: () => new Map() },

    // Paths to exclude from drift detection entirely
    ignorePaths: {
      type: [String],
      default: [],
      validate: {
        validator: (paths) => paths.every((p) => p.startsWith('$')),
        message: 'Each ignorePath must start with "$" (the schema root)',
      },
    },

    intervalMinutes: { type: Number, default: 15, min: 1, max: 1440 },
    isActive: { type: Boolean, default: true },

    baselineSchema: { type: [SchemaEntrySchema], default: [] },
    latestSchema: { type: [SchemaEntrySchema], default: [] },

    status: { type: String, enum: ALLOWED_STATUSES, default: 'PENDING' },

    lastBreakingFingerprint: { type: String, default: null },

    lastCheckedAt: { type: Date, default: null },
    nextCheckAt: { type: Date, default: null, index: true },

    alerts: {
      discordWebhookUrl: { type: String, default: null, trim: true },
      email: { type: String, default: null, trim: true },
      notifyOnRecovery: { type: Boolean, default: true },
    },
  },
  { timestamps: true }
);

// Scheduler index
MonitorSchema.index({ isActive: 1, nextCheckAt: 1 });
// User-scoped fast lookup index
MonitorSchema.index({ userId: 1, createdAt: -1 });

/** Flat, JSON-friendly view used by the API — Map -> plain object for headers. */
MonitorSchema.methods.toClientJSON = function toClientJSON() {
  const obj = this.toObject({ versionKey: false });
  obj.headers = Object.fromEntries(this.headers ?? new Map());
  return obj;
};

export const MONITOR_STATUSES = ALLOWED_STATUSES;
export default mongoose.model('Monitor', MonitorSchema);