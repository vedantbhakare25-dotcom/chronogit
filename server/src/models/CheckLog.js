import mongoose from 'mongoose';

const { Schema } = mongoose;

const SchemaChangeSchema = new Schema(
  {
    path: { type: String, required: true },
    kind: { type: String, enum: ['ADDED', 'REMOVED', 'TYPE_CHANGED'], required: true },
    from: { type: [String], default: [] },
    to: { type: [String], default: [] },
    breaking: { type: Boolean, required: true },
  },
  { _id: false }
);

const THIRTY_DAYS_SECONDS = 30 * 24 * 60 * 60;

const CheckLogSchema = new Schema({
  monitorId: { type: Schema.Types.ObjectId, ref: 'Monitor', required: true, index: true },

  checkedAt: {
    type: Date,
    default: Date.now,
    // TTL index: Mongo drops the document this many seconds after checkedAt.
    // Keeps a free-tier Atlas cluster from filling up with old logs.
    expires: THIRTY_DAYS_SECONDS,
  },

  outcome: { type: String, enum: ['OK', 'NON_BREAKING', 'BREAKING', 'ERROR'], required: true },

  httpStatus: { type: Number, default: null },
  responseTimeMs: { type: Number, default: null },
  errorMessage: { type: String, default: null },

  changes: { type: [SchemaChangeSchema], default: [] },

  // Set when this check caused an outbound alert (Phase 5); undefined otherwise.
  alertSent: { type: String, enum: ['BREAKING', 'RECOVERY'] },
});

// Check-history endpoint: latest logs for one monitor.
CheckLogSchema.index({ monitorId: 1, checkedAt: -1 });

export default mongoose.model('CheckLog', CheckLogSchema);