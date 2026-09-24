import mongoose from 'mongoose';

const { Schema } = mongoose;

const NotificationSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  monitorId: { type: Schema.Types.ObjectId, ref: 'Monitor', required: true, index: true },
  monitorName: { type: String, required: true },
  type: {
    type: String,
    enum: ['BREAKING_DRIFT', 'NON_BREAKING_DRIFT', 'ENDPOINT_ERROR'],
    required: true,
  },
  title: { type: String, required: true },
  message: { type: String, required: true },
  diffSummary: { type: Schema.Types.Mixed, default: () => [] },
  isRead: { type: Boolean, default: false, index: true },
  createdAt: { type: Date, default: Date.now, index: true },
});

NotificationSchema.index({ userId: 1, createdAt: -1 });

export default mongoose.model('Notification', NotificationSchema);
