const express = require('express');
const router = express.Router();
const {
  getUserNotifications,
  getUnreadCount,
  markNotificationRead,
  markAllRead,
  deleteNotification
} = require('../services/notificationService');
const { subscribe } = require('../services/notificationStream');
const { requireAuth } = require('../middleware/auth');

// List the authenticated user's notifications (latest first)
router.get('/', requireAuth, async (req, res) => {
  try {
    const unreadOnly = req.query.unread === 'true';
    const limit = req.query.limit;
    const [data, unreadCount] = await Promise.all([
      getUserNotifications(req.user.userId, { unreadOnly, limit }),
      getUnreadCount(req.user.userId)
    ]);
    res.json({
      success: true,
      count: data.length,
      unreadCount,
      data
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      message: err.message
    });
  }
});

// Lightweight unread counter for auto-refresh polling
router.get('/unread-count', requireAuth, async (req, res) => {
  try {
    res.json({
      success: true,
      unreadCount: await getUnreadCount(req.user.userId)
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      message: err.message
    });
  }
});

// Server-Sent Events stream: pushes new notifications in real time so the
// frontend does not have to poll. Authenticated like every other route.
router.get('/stream', requireAuth, (req, res) => {
  subscribe(req, res, req.user.userId);
});

// Mark every notification as read
router.patch('/read-all', requireAuth, async (req, res) => {
  try {
    const updated = await markAllRead(req.user.userId);
    res.json({
      success: true,
      message: `${updated} notification(s) marked as read.`,
      updated
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      message: err.message
    });
  }
});

// Mark a single notification as read
router.patch('/:id/read', requireAuth, async (req, res) => {
  try {
    const ok = await markNotificationRead(req.params.id, req.user.userId);
    if (!ok) {
      return res.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: `Notification '${req.params.id}' was not found.`
      });
    }
    res.json({ success: true, unreadCount: await getUnreadCount(req.user.userId) });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      message: err.message
    });
  }
});

// Dismiss (delete) a notification
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const ok = await deleteNotification(req.params.id, req.user.userId);
    if (!ok) {
      return res.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: `Notification '${req.params.id}' was not found.`
      });
    }
    res.json({ success: true, unreadCount: await getUnreadCount(req.user.userId) });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      message: err.message
    });
  }
});

module.exports = router;
