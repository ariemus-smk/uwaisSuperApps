/**
 * Unit tests for Notification service.
 * Tests queue processing, retry logic, channel selection based on subscription age,
 * and broadcast functionality.
 *
 * Requirements: 6.5, 6.6, 30.1, 30.2, 30.3, 30.4
 */

// Mock the notification model
jest.mock('../../src/models/notification.model', () => ({
  create: jest.fn(),
  findQueued: jest.fn(),
  markSent: jest.fn(),
  incrementRetry: jest.fn(),
  markFailed: jest.fn(),
  findAll: jest.fn(),
  findById: jest.fn(),
  findByEntity: jest.fn(),
}));

// Mock the whatsapp service
jest.mock('../../src/services/whatsapp.service', () => ({
  sendMessage: jest.fn(),
  renderTemplate: jest.fn(),
}));

// Mock the whatsapp config
jest.mock('../../src/config/whatsapp', () => ({
  apiUrl: 'https://wa-gateway.example.com',
  apiKey: 'test-api-key',
  senderNumber: '628123456789',
  maxRetries: 3,
  batchSize: 10,
}));

// Mock the database
jest.mock('../../src/config/database', () => ({
  appPool: {
    execute: jest.fn(),
  },
}));

const notificationModel = require('../../src/models/notification.model');
const whatsappService = require('../../src/services/whatsapp.service');
const notificationService = require('../../src/services/notification.service');
const { NOTIFICATION_CHANNEL, NOTIFICATION_STATUS } = require('../../src/utils/constants');

describe('Notification Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('queueNotification', () => {
    it('should queue a WhatsApp notification with default channel', async () => {
      const mockNotification = {
        id: 1,
        recipient_whatsapp: '6281234567890',
        template_name: 'invoice_generated',
        parameters: '{"invoice_number":"INV-202401-00001","amount":"150000"}',
        channel: 'WhatsApp',
        status: 'Queued',
        retry_count: 0,
      };

      notificationModel.create.mockResolvedValue(mockNotification);

      const result = await notificationService.queueNotification({
        recipient: '6281234567890',
        templateName: 'invoice_generated',
        parameters: { invoice_number: 'INV-202401-00001', amount: '150000' },
      });

      expect(result).toEqual(mockNotification);
      expect(notificationModel.create).toHaveBeenCalledWith({
        recipient_whatsapp: '6281234567890',
        template_name: 'invoice_generated',
        parameters: { invoice_number: 'INV-202401-00001', amount: '150000' },
        channel: NOTIFICATION_CHANNEL.WHATSAPP,
        related_entity_id: null,
        related_entity_type: null,
      });
    });

    it('should queue a notification with specified channel and entity', async () => {
      const mockNotification = {
        id: 2,
        recipient_whatsapp: '6281234567890',
        template_name: 'payment_confirmed',
        channel: 'Email',
        status: 'Queued',
      };

      notificationModel.create.mockResolvedValue(mockNotification);

      const result = await notificationService.queueNotification({
        recipient: '6281234567890',
        templateName: 'payment_confirmed',
        parameters: { amount: '150000' },
        channel: NOTIFICATION_CHANNEL.EMAIL,
        relatedEntityId: 42,
        relatedEntityType: 'Invoice',
      });

      expect(result).toEqual(mockNotification);
      expect(notificationModel.create).toHaveBeenCalledWith({
        recipient_whatsapp: '6281234567890',
        template_name: 'payment_confirmed',
        parameters: { amount: '150000' },
        channel: NOTIFICATION_CHANNEL.EMAIL,
        related_entity_id: 42,
        related_entity_type: 'Invoice',
      });
    });
  });

  describe('queueBySubscriptionAge', () => {
    it('should queue WhatsApp AND Email for customers subscribed <= 2 months', async () => {
      notificationModel.create
        .mockResolvedValueOnce({ id: 1, channel: 'WhatsApp', status: 'Queued' })
        .mockResolvedValueOnce({ id: 2, channel: 'Email', status: 'Queued' });

      const result = await notificationService.queueBySubscriptionAge({
        recipient: '6281234567890',
        templateName: 'invoice_generated',
        parameters: { amount: '150000' },
        subscriptionMonths: 1,
        relatedEntityId: 10,
        relatedEntityType: 'Invoice',
      });

      expect(result).toHaveLength(2);
      expect(notificationModel.create).toHaveBeenCalledTimes(2);

      // First call should be WhatsApp
      expect(notificationModel.create).toHaveBeenNthCalledWith(1, expect.objectContaining({
        channel: NOTIFICATION_CHANNEL.WHATSAPP,
      }));

      // Second call should be Email
      expect(notificationModel.create).toHaveBeenNthCalledWith(2, expect.objectContaining({
        channel: NOTIFICATION_CHANNEL.EMAIL,
      }));
    });

    it('should queue WhatsApp AND Email for customers subscribed exactly 2 months', async () => {
      notificationModel.create
        .mockResolvedValueOnce({ id: 3, channel: 'WhatsApp', status: 'Queued' })
        .mockResolvedValueOnce({ id: 4, channel: 'Email', status: 'Queued' });

      const result = await notificationService.queueBySubscriptionAge({
        recipient: '6281234567890',
        templateName: 'invoice_generated',
        parameters: {},
        subscriptionMonths: 2,
      });

      expect(result).toHaveLength(2);
      expect(notificationModel.create).toHaveBeenCalledTimes(2);
    });

    it('should queue PushNotification only for customers subscribed > 2 months', async () => {
      notificationModel.create.mockResolvedValueOnce({
        id: 5,
        channel: 'PushNotification',
        status: 'Queued',
      });

      const result = await notificationService.queueBySubscriptionAge({
        recipient: '6281234567890',
        templateName: 'invoice_generated',
        parameters: { amount: '150000' },
        subscriptionMonths: 3,
        relatedEntityId: 10,
        relatedEntityType: 'Invoice',
      });

      expect(result).toHaveLength(1);
      expect(notificationModel.create).toHaveBeenCalledTimes(1);
      expect(notificationModel.create).toHaveBeenCalledWith(expect.objectContaining({
        channel: NOTIFICATION_CHANNEL.PUSH_NOTIFICATION,
      }));
    });

    it('should queue PushNotification for customers subscribed 12 months', async () => {
      notificationModel.create.mockResolvedValueOnce({
        id: 6,
        channel: 'PushNotification',
        status: 'Queued',
      });

      const result = await notificationService.queueBySubscriptionAge({
        recipient: '6281234567890',
        templateName: 'invoice_generated',
        parameters: {},
        subscriptionMonths: 12,
      });

      expect(result).toHaveLength(1);
      expect(notificationModel.create).toHaveBeenCalledWith(expect.objectContaining({
        channel: NOTIFICATION_CHANNEL.PUSH_NOTIFICATION,
      }));
    });
  });

  describe('processQueue', () => {
    it('should process queued notifications and mark as sent on success', async () => {
      const queuedNotifications = [
        {
          id: 1,
          recipient_whatsapp: '6281234567890',
          template_name: 'invoice_generated',
          parameters: '{"amount":"150000"}',
          channel: 'WhatsApp',
          status: 'Queued',
          retry_count: 0,
        },
        {
          id: 2,
          recipient_whatsapp: '6289876543210',
          template_name: 'payment_confirmed',
          parameters: '{"amount":"200000"}',
          channel: 'WhatsApp',
          status: 'Queued',
          retry_count: 0,
        },
      ];

      notificationModel.findQueued.mockResolvedValue(queuedNotifications);
      whatsappService.sendMessage.mockResolvedValue({ success: true, messageId: 'msg-123' });
      notificationModel.markSent.mockResolvedValue({ affectedRows: 1 });

      const result = await notificationService.processQueue();

      expect(result.processed).toBe(2);
      expect(result.sent).toBe(2);
      expect(result.failed).toBe(0);
      expect(result.retried).toBe(0);
      expect(notificationModel.markSent).toHaveBeenCalledTimes(2);
    });

    it('should increment retry on failure and keep in queue if retries < max', async () => {
      const queuedNotifications = [
        {
          id: 1,
          recipient_whatsapp: '6281234567890',
          template_name: 'invoice_generated',
          parameters: '{"amount":"150000"}',
          channel: 'WhatsApp',
          status: 'Queued',
          retry_count: 0,
        },
      ];

      notificationModel.findQueued.mockResolvedValue(queuedNotifications);
      whatsappService.sendMessage.mockResolvedValue({ success: false, error: 'Gateway timeout' });
      notificationModel.incrementRetry.mockResolvedValue({
        affectedRows: 1,
        newStatus: NOTIFICATION_STATUS.QUEUED,
        newRetryCount: 1,
      });

      const result = await notificationService.processQueue();

      expect(result.processed).toBe(1);
      expect(result.sent).toBe(0);
      expect(result.failed).toBe(0);
      expect(result.retried).toBe(1);
      expect(notificationModel.incrementRetry).toHaveBeenCalledWith(1, 'Gateway timeout', 3);
    });

    it('should mark as Failed after max retries exceeded', async () => {
      const queuedNotifications = [
        {
          id: 1,
          recipient_whatsapp: '6281234567890',
          template_name: 'invoice_generated',
          parameters: '{"amount":"150000"}',
          channel: 'WhatsApp',
          status: 'Queued',
          retry_count: 2,
        },
      ];

      notificationModel.findQueued.mockResolvedValue(queuedNotifications);
      whatsappService.sendMessage.mockResolvedValue({ success: false, error: 'Service unavailable' });
      notificationModel.incrementRetry.mockResolvedValue({
        affectedRows: 1,
        newStatus: NOTIFICATION_STATUS.FAILED,
        newRetryCount: 3,
      });

      const result = await notificationService.processQueue();

      expect(result.processed).toBe(1);
      expect(result.sent).toBe(0);
      expect(result.failed).toBe(1);
      expect(result.retried).toBe(0);
    });

    it('should handle empty queue gracefully', async () => {
      notificationModel.findQueued.mockResolvedValue([]);

      const result = await notificationService.processQueue();

      expect(result.processed).toBe(0);
      expect(result.sent).toBe(0);
      expect(result.failed).toBe(0);
      expect(result.retried).toBe(0);
    });

    it('should respect custom batch size', async () => {
      notificationModel.findQueued.mockResolvedValue([]);

      await notificationService.processQueue(5);

      expect(notificationModel.findQueued).toHaveBeenCalledWith(5);
    });

    it('should handle mixed success and failure in a batch', async () => {
      const queuedNotifications = [
        {
          id: 1,
          recipient_whatsapp: '6281234567890',
          template_name: 'invoice_generated',
          parameters: '{"amount":"150000"}',
          channel: 'WhatsApp',
          status: 'Queued',
          retry_count: 0,
        },
        {
          id: 2,
          recipient_whatsapp: '6289876543210',
          template_name: 'payment_confirmed',
          parameters: '{"amount":"200000"}',
          channel: 'WhatsApp',
          status: 'Queued',
          retry_count: 0,
        },
        {
          id: 3,
          recipient_whatsapp: '6287654321000',
          template_name: 'isolir_warning',
          parameters: '{}',
          channel: 'WhatsApp',
          status: 'Queued',
          retry_count: 2,
        },
      ];

      notificationModel.findQueued.mockResolvedValue(queuedNotifications);

      // First succeeds, second fails (retryable), third fails (max retries)
      whatsappService.sendMessage
        .mockResolvedValueOnce({ success: true, messageId: 'msg-1' })
        .mockResolvedValueOnce({ success: false, error: 'Timeout' })
        .mockResolvedValueOnce({ success: false, error: 'Service down' });

      notificationModel.markSent.mockResolvedValue({ affectedRows: 1 });
      notificationModel.incrementRetry
        .mockResolvedValueOnce({ newStatus: NOTIFICATION_STATUS.QUEUED, newRetryCount: 1 })
        .mockResolvedValueOnce({ newStatus: NOTIFICATION_STATUS.FAILED, newRetryCount: 3 });

      const result = await notificationService.processQueue();

      expect(result.processed).toBe(3);
      expect(result.sent).toBe(1);
      expect(result.failed).toBe(1);
      expect(result.retried).toBe(1);
    });
  });

  describe('sendNotification', () => {
    it('should send WhatsApp notification via whatsapp service', async () => {
      whatsappService.sendMessage.mockResolvedValue({ success: true, messageId: 'msg-1' });

      const notification = {
        id: 1,
        recipient_whatsapp: '6281234567890',
        template_name: 'invoice_generated',
        parameters: '{"amount":"150000","customer_name":"John"}',
        channel: 'WhatsApp',
      };

      const result = await notificationService.sendNotification(notification);

      expect(result.success).toBe(true);
      expect(whatsappService.sendMessage).toHaveBeenCalledWith(
        '6281234567890',
        'invoice_generated',
        { amount: '150000', customer_name: 'John' }
      );
    });

    it('should handle Email channel (placeholder)', async () => {
      const notification = {
        id: 2,
        recipient_whatsapp: '6281234567890',
        template_name: 'invoice_generated',
        parameters: '{"amount":"150000"}',
        channel: 'Email',
      };

      const result = await notificationService.sendNotification(notification);
      expect(result.success).toBe(true);
    });

    it('should handle PushNotification channel (placeholder)', async () => {
      const notification = {
        id: 3,
        recipient_whatsapp: '6281234567890',
        template_name: 'invoice_generated',
        parameters: '{"amount":"150000"}',
        channel: 'PushNotification',
      };

      const result = await notificationService.sendNotification(notification);
      expect(result.success).toBe(true);
    });

    it('should return error for unsupported channel', async () => {
      const notification = {
        id: 4,
        recipient_whatsapp: '6281234567890',
        template_name: 'test',
        parameters: '{}',
        channel: 'SMS',
      };

      const result = await notificationService.sendNotification(notification);
      expect(result.success).toBe(false);
      expect(result.error).toContain('Unsupported notification channel');
    });

    it('should handle invalid JSON parameters gracefully', async () => {
      const notification = {
        id: 5,
        recipient_whatsapp: '6281234567890',
        template_name: 'test',
        parameters: 'invalid-json{{{',
        channel: 'WhatsApp',
      };

      const result = await notificationService.sendNotification(notification);
      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid parameters JSON');
    });

    it('should handle null parameters', async () => {
      whatsappService.sendMessage.mockResolvedValue({ success: true });

      const notification = {
        id: 6,
        recipient_whatsapp: '6281234567890',
        template_name: 'simple_notification',
        parameters: null,
        channel: 'WhatsApp',
      };

      const result = await notificationService.sendNotification(notification);
      expect(result.success).toBe(true);
      expect(whatsappService.sendMessage).toHaveBeenCalledWith(
        '6281234567890',
        'simple_notification',
        {}
      );
    });
  });

  describe('queueBroadcast', () => {
    it('should queue notifications for all recipients', async () => {
      notificationModel.create
        .mockResolvedValueOnce({ id: 1, status: 'Queued' })
        .mockResolvedValueOnce({ id: 2, status: 'Queued' })
        .mockResolvedValueOnce({ id: 3, status: 'Queued' });

      const result = await notificationService.queueBroadcast({
        recipients: ['6281111111111', '6282222222222', '6283333333333'],
        templateName: 'maintenance_notice',
        parameters: { date: '2024-01-15', time: '02:00' },
      });

      expect(result.queued).toBe(3);
      expect(result.notifications).toHaveLength(3);
      expect(notificationModel.create).toHaveBeenCalledTimes(3);
    });

    it('should use specified channel for broadcast', async () => {
      notificationModel.create.mockResolvedValue({ id: 1, status: 'Queued' });

      await notificationService.queueBroadcast({
        recipients: ['6281111111111'],
        templateName: 'maintenance_notice',
        parameters: {},
        channel: NOTIFICATION_CHANNEL.PUSH_NOTIFICATION,
      });

      expect(notificationModel.create).toHaveBeenCalledWith(expect.objectContaining({
        channel: NOTIFICATION_CHANNEL.PUSH_NOTIFICATION,
      }));
    });

    it('should handle empty recipients list', async () => {
      const result = await notificationService.queueBroadcast({
        recipients: [],
        templateName: 'test',
        parameters: {},
      });

      expect(result.queued).toBe(0);
      expect(result.notifications).toHaveLength(0);
      expect(notificationModel.create).not.toHaveBeenCalled();
    });
  });

  describe('getQueue', () => {
    it('should return paginated notification queue', async () => {
      const mockResult = {
        notifications: [
          { id: 1, status: 'Queued', template_name: 'invoice_generated' },
          { id: 2, status: 'Sent', template_name: 'payment_confirmed' },
        ],
        total: 50,
      };

      notificationModel.findAll.mockResolvedValue(mockResult);

      const result = await notificationService.getQueue({ page: 1, limit: 20 });

      expect(result.notifications).toHaveLength(2);
      expect(result.total).toBe(50);
      expect(notificationModel.findAll).toHaveBeenCalledWith({ page: 1, limit: 20 });
    });

    it('should pass filters to model', async () => {
      notificationModel.findAll.mockResolvedValue({ notifications: [], total: 0 });

      await notificationService.getQueue({
        status: 'Failed',
        channel: 'WhatsApp',
        page: 2,
        limit: 10,
      });

      expect(notificationModel.findAll).toHaveBeenCalledWith({
        status: 'Failed',
        channel: 'WhatsApp',
        page: 2,
        limit: 10,
      });
    });
  });
});
