import Notification from '../models/Notification.js';

/** Notifications are best-effort and must never interrupt a monitor check or email alert. */
export async function persistInAppNotification({ monitor, type, title, message, diffSummary = [] }) {
  if (!monitor.userId) {
    return null;
  }

  try {
    return await Notification.create({
      userId: monitor.userId,
      monitorId: monitor._id,
      monitorName: monitor.name,
      type,
      title,
      message,
      diffSummary,
    });
  } catch (err) {
    console.error('[notifications] failed to persist in-app notification:', err);
    return null;
  }
}
