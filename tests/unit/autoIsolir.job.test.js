/**
 * Unit tests for auto-isolir job.
 * Tests the auto-isolir handler including:
 * - Identifying subscriptions with unpaid invoices past due date
 * - Sending CoA to NAS for isolir
 * - Updating customer status to Isolir
 * - Sending notification to customer
 * - 2-month arrears logic: termination notice + device withdrawal ticket
 *
 * Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 11.3, 11.4
 */

jest.mock('../../src/config/database', () => ({
  appPool: {
    execute: jest.fn(),
    getConnection: jest.fn(),
  },
}));

jest.mock('../../src/services/coa.service');
jest.mock('../../src/services/notification.service');
jest.mock('../../src/models/customer.model');
jest.mock('../../src/models/invoice.model');
jest.mock('../../src/services/ticket.service');
jest.mock('../../src/models/jobLog.model');
jest.mock('../../src/jobs/index', () => {
  const actual = jest.requireActual('../../src/jobs/index');
  return {
    ...actual,
    registerJob: jest.fn(),
  };
});

const { appPool } = require('../../src/config/database');
const coaService = require('../../src/services/coa.service');
const notificationService = require('../../src/services/notification.service');
const customerModel = require('../../src/models/customer.model');
const invoiceModel = require('../../src/models/invoice.model');
const ticketService = require('../../src/services/ticket.service');
const { registerJob } = require('../../src/jobs/index');
const {
  autoIsolirHandler,
  getUnpaidSubscriptions,
  countConsecutiveUnpaidInvoices,
  calculateSubscriptionMonths,
  sendIsolirNotification,
  sendTerminationNotice,
  createDeviceWithdrawalTicket,
  register,
} = require('../../src/jobs/autoIsolir.job');

describe('Auto-Isolir Job', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  describe('register', () => {
    it('should register the job with correct name and schedule', () => {
      register();

      expect(registerJob).toHaveBeenCalledWith({
        name: 'auto-isolir',
        schedule: expect.any(String),
        handler: autoIsolirHandler,
        description: expect.stringContaining('Auto-isolir'),
      });
    });

    it('should use cron schedule for 10th of month at 23:59', () => {
      register();

      const call = registerJob.mock.calls[0][0];
      expect(call.schedule).toBe('59 23 10 * *');
    });
  });

  describe('getUnpaidSubscriptions', () => {
    it('should query for subscriptions with UNPAID invoices past due date', async () => {
      const mockSubscriptions = [
        {
          subscription_id: 1,
          customer_id: 10,
          pppoe_username: 'user1',
          nas_id: 5,
          activated_at: '2024-01-15',
          subscription_status: 'Active',
          customer_name: 'John Doe',
          whatsapp_number: '081234567890',
          lifecycle_status: 'Aktif',
          branch_id: 1,
        },
      ];

      appPool.execute.mockResolvedValue([mockSubscriptions, []]);

      const result = await getUnpaidSubscriptions('2025-01-10');

      expect(appPool.execute).toHaveBeenCalledWith(
        expect.stringContaining('i.status = ?'),
        ['UNPAID', '2025-01-10', 'Active', 'Aktif']
      );
      expect(result).toEqual(mockSubscriptions);
    });

    it('should return empty array when no unpaid subscriptions', async () => {
      appPool.execute.mockResolvedValue([[], []]);

      const result = await getUnpaidSubscriptions('2025-01-10');

      expect(result).toEqual([]);
    });
  });

  describe('countConsecutiveUnpaidInvoices', () => {
    it('should delegate to invoiceModel.countBySubscriptionAndStatus', async () => {
      invoiceModel.countBySubscriptionAndStatus.mockResolvedValue(3);

      const result = await countConsecutiveUnpaidInvoices(1);

      expect(invoiceModel.countBySubscriptionAndStatus).toHaveBeenCalledWith(1, 'UNPAID');
      expect(result).toBe(3);
    });
  });

  describe('calculateSubscriptionMonths', () => {
    it('should return 0 for null activation date', () => {
      expect(calculateSubscriptionMonths(null)).toBe(0);
    });

    it('should calculate months correctly', () => {
      const now = new Date();
      const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 6, 15);
      const result = calculateSubscriptionMonths(sixMonthsAgo.toISOString());
      expect(result).toBe(6);
    });

    it('should return 0 for activation in current month', () => {
      const now = new Date();
      const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const result = calculateSubscriptionMonths(thisMonth.toISOString());
      expect(result).toBe(0);
    });
  });

  describe('autoIsolirHandler', () => {
    const mockSubscription = {
      subscription_id: 1,
      customer_id: 10,
      pppoe_username: 'pppoe_john',
      nas_id: 5,
      activated_at: '2024-01-15',
      subscription_status: 'Active',
      customer_name: 'John Doe',
      whatsapp_number: '081234567890',
      lifecycle_status: 'Aktif',
      branch_id: 1,
    };

    it('should process all unpaid subscriptions successfully', async () => {
      appPool.execute.mockResolvedValue([[mockSubscription], []]);
      coaService.isolir.mockResolvedValue({ success: true, responseStatus: 'ACK', retryCount: 0, logId: 1 });
      customerModel.updateStatus.mockResolvedValue({ success: true });
      notificationService.queueBySubscriptionAge.mockResolvedValue([]);
      invoiceModel.countBySubscriptionAndStatus.mockResolvedValue(1);

      const result = await autoIsolirHandler();

      expect(result.records_processed).toBe(1);
      expect(result.records_failed).toBe(0);
      expect(result.errors).toEqual([]);
    });

    it('should send CoA isolir request to NAS (Req 7.2)', async () => {
      appPool.execute.mockResolvedValue([[mockSubscription], []]);
      coaService.isolir.mockResolvedValue({ success: true, responseStatus: 'ACK', retryCount: 0, logId: 1 });
      customerModel.updateStatus.mockResolvedValue({ success: true });
      notificationService.queueBySubscriptionAge.mockResolvedValue([]);
      invoiceModel.countBySubscriptionAndStatus.mockResolvedValue(1);

      await autoIsolirHandler();

      expect(coaService.isolir).toHaveBeenCalledWith(1, 5, 'pppoe_john');
    });

    it('should update customer status to Isolir (Req 7.3)', async () => {
      appPool.execute.mockResolvedValue([[mockSubscription], []]);
      coaService.isolir.mockResolvedValue({ success: true, responseStatus: 'ACK', retryCount: 0, logId: 1 });
      customerModel.updateStatus.mockResolvedValue({ success: true });
      notificationService.queueBySubscriptionAge.mockResolvedValue([]);
      invoiceModel.countBySubscriptionAndStatus.mockResolvedValue(1);

      await autoIsolirHandler();

      expect(customerModel.updateStatus).toHaveBeenCalledWith(10, 'Isolir', 0);
    });

    it('should send isolir notification to customer (Req 7.4)', async () => {
      appPool.execute.mockResolvedValue([[mockSubscription], []]);
      coaService.isolir.mockResolvedValue({ success: true, responseStatus: 'ACK', retryCount: 0, logId: 1 });
      customerModel.updateStatus.mockResolvedValue({ success: true });
      notificationService.queueBySubscriptionAge.mockResolvedValue([]);
      invoiceModel.countBySubscriptionAndStatus.mockResolvedValue(1);

      await autoIsolirHandler();

      expect(notificationService.queueBySubscriptionAge).toHaveBeenCalledWith(
        expect.objectContaining({
          recipient: '081234567890',
          templateName: 'auto_isolir_notice',
          parameters: expect.objectContaining({
            customer_name: 'John Doe',
            pppoe_username: 'pppoe_john',
          }),
        })
      );
    });

    it('should continue processing even if CoA fails (Req 7.5)', async () => {
      appPool.execute.mockResolvedValue([[mockSubscription], []]);
      coaService.isolir.mockResolvedValue({ success: false, responseStatus: 'Timeout', retryCount: 3, logId: 1 });
      customerModel.updateStatus.mockResolvedValue({ success: true });
      notificationService.queueBySubscriptionAge.mockResolvedValue([]);
      invoiceModel.countBySubscriptionAndStatus.mockResolvedValue(1);

      const result = await autoIsolirHandler();

      // Should still process successfully (CoA failure is logged but doesn't fail the record)
      expect(result.records_processed).toBe(1);
      expect(result.records_failed).toBe(0);
      expect(customerModel.updateStatus).toHaveBeenCalled();
    });

    it('should handle INVALID_STATUS_TRANSITION gracefully (already Isolir)', async () => {
      appPool.execute.mockResolvedValue([[mockSubscription], []]);
      coaService.isolir.mockResolvedValue({ success: true, responseStatus: 'ACK', retryCount: 0, logId: 1 });
      customerModel.updateStatus.mockRejectedValue(
        Object.assign(new Error('Invalid status transition'), { code: 'INVALID_STATUS_TRANSITION' })
      );
      notificationService.queueBySubscriptionAge.mockResolvedValue([]);
      invoiceModel.countBySubscriptionAndStatus.mockResolvedValue(1);

      const result = await autoIsolirHandler();

      // Should still count as processed (customer might already be Isolir)
      expect(result.records_processed).toBe(1);
      expect(result.records_failed).toBe(0);
    });

    it('should send termination notice for 2-month arrears (Req 11.3)', async () => {
      appPool.execute.mockResolvedValue([[mockSubscription], []]);
      coaService.isolir.mockResolvedValue({ success: true, responseStatus: 'ACK', retryCount: 0, logId: 1 });
      customerModel.updateStatus.mockResolvedValue({ success: true });
      notificationService.queueBySubscriptionAge.mockResolvedValue([]);
      invoiceModel.countBySubscriptionAndStatus.mockResolvedValue(2);

      await autoIsolirHandler();

      // Should be called twice: once for isolir notice, once for termination notice
      expect(notificationService.queueBySubscriptionAge).toHaveBeenCalledTimes(2);
      expect(notificationService.queueBySubscriptionAge).toHaveBeenCalledWith(
        expect.objectContaining({
          templateName: 'termination_notice_arrears',
          parameters: expect.objectContaining({
            arrears_months: 2,
          }),
        })
      );
    });

    it('should create device withdrawal ticket for 2-month arrears (Req 11.4)', async () => {
      appPool.execute.mockResolvedValue([[mockSubscription], []]);
      coaService.isolir.mockResolvedValue({ success: true, responseStatus: 'ACK', retryCount: 0, logId: 1 });
      customerModel.updateStatus.mockResolvedValue({ success: true });
      notificationService.queueBySubscriptionAge.mockResolvedValue([]);
      invoiceModel.countBySubscriptionAndStatus.mockResolvedValue(2);
      ticketService.createTicket.mockResolvedValue({ id: 100 });

      await autoIsolirHandler();

      expect(ticketService.createTicket).toHaveBeenCalledWith(
        expect.objectContaining({
          customer_id: 10,
          subscription_id: 1,
          issue_description: expect.stringContaining('Penarikan perangkat'),
          source: 'Admin',
        }),
        expect.objectContaining({ id: 0, role: 'System' })
      );
    });

    it('should NOT create ticket when arrears is less than 2 months', async () => {
      appPool.execute.mockResolvedValue([[mockSubscription], []]);
      coaService.isolir.mockResolvedValue({ success: true, responseStatus: 'ACK', retryCount: 0, logId: 1 });
      customerModel.updateStatus.mockResolvedValue({ success: true });
      notificationService.queueBySubscriptionAge.mockResolvedValue([]);
      invoiceModel.countBySubscriptionAndStatus.mockResolvedValue(1);

      await autoIsolirHandler();

      expect(ticketService.createTicket).not.toHaveBeenCalled();
    });

    it('should handle partial failures and continue processing', async () => {
      const subscriptions = [
        { ...mockSubscription, subscription_id: 1, customer_id: 10 },
        { ...mockSubscription, subscription_id: 2, customer_id: 11, pppoe_username: 'pppoe_jane' },
        { ...mockSubscription, subscription_id: 3, customer_id: 12, pppoe_username: 'pppoe_bob' },
      ];

      appPool.execute.mockResolvedValue([subscriptions, []]);
      coaService.isolir
        .mockResolvedValueOnce({ success: true, responseStatus: 'ACK', retryCount: 0, logId: 1 })
        .mockRejectedValueOnce(new Error('SSH connection failed'))
        .mockResolvedValueOnce({ success: true, responseStatus: 'ACK', retryCount: 0, logId: 3 });
      customerModel.updateStatus.mockResolvedValue({ success: true });
      notificationService.queueBySubscriptionAge.mockResolvedValue([]);
      invoiceModel.countBySubscriptionAndStatus.mockResolvedValue(1);

      const result = await autoIsolirHandler();

      expect(result.records_processed).toBe(2);
      expect(result.records_failed).toBe(1);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('Subscription 2');
    });

    it('should return zero counts when no unpaid subscriptions', async () => {
      appPool.execute.mockResolvedValue([[], []]);

      const result = await autoIsolirHandler();

      expect(result.records_processed).toBe(0);
      expect(result.records_failed).toBe(0);
      expect(result.errors).toEqual([]);
      expect(coaService.isolir).not.toHaveBeenCalled();
    });

    it('should skip CoA when nas_id is null', async () => {
      const subWithoutNas = { ...mockSubscription, nas_id: null };
      appPool.execute.mockResolvedValue([[subWithoutNas], []]);
      customerModel.updateStatus.mockResolvedValue({ success: true });
      notificationService.queueBySubscriptionAge.mockResolvedValue([]);
      invoiceModel.countBySubscriptionAndStatus.mockResolvedValue(1);

      await autoIsolirHandler();

      expect(coaService.isolir).not.toHaveBeenCalled();
      expect(customerModel.updateStatus).toHaveBeenCalled();
    });

    it('should skip notification when whatsapp_number is null', async () => {
      const subWithoutPhone = { ...mockSubscription, whatsapp_number: null };
      appPool.execute.mockResolvedValue([[subWithoutPhone], []]);
      coaService.isolir.mockResolvedValue({ success: true, responseStatus: 'ACK', retryCount: 0, logId: 1 });
      customerModel.updateStatus.mockResolvedValue({ success: true });
      invoiceModel.countBySubscriptionAndStatus.mockResolvedValue(1);

      await autoIsolirHandler();

      expect(notificationService.queueBySubscriptionAge).not.toHaveBeenCalled();
    });
  });
});
