import mongoose from 'mongoose';

const { Schema } = mongoose;

const UserSchema = new Schema(
  {
    googleId: { type: String, required: true, unique: true },
    email: { type: String, required: true, lowercase: true, trim: true, unique: true },
    name: { type: String, default: '', trim: true },
    avatar: { type: String, default: '' },
    // User can choose between their sign-in email or a custom/team notification email
    alertEmailPreference: {
      type: {
        type: String,
        enum: ['ACCOUNT_EMAIL', 'CUSTOM_EMAIL'],
        default: 'ACCOUNT_EMAIL',
      },
      customEmail: { type: String, default: null, trim: true, lowercase: true },
      confirmedAt: { type: Date, default: null },
    },
  },
  { timestamps: true }
);

/** Helper to resolve the effective notification email for this user */
UserSchema.methods.getEffectiveAlertEmail = function getEffectiveAlertEmail() {
  if (
    this.alertEmailPreference?.type === 'CUSTOM_EMAIL' &&
    this.alertEmailPreference?.customEmail
  ) {
    return this.alertEmailPreference.customEmail;
  }
  return this.email;
};

export default mongoose.model('User', UserSchema);
