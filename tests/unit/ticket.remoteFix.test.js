/**
 * Unit tests for ticket service - Remote troubleshooting integration.
 * Tests: triggerRemoteFix (ACS and NAS commands), journal recording,
 * customer notification, and closeTicketWithRemoteFix.
 *
 * Requirements: 25.1, 25.2, 25.3
 */

// Mock dependencies before requiring the service
jest.mock('../../src/config/database', () => ({
  appPool: {
    execute: jest.fn().mockResolvedValue([[], []]),
    query: jest.fn().mockResolvedValue([[], []]),
  },
}));

jest.mock('../../src/services/coa.service', () => ({
  sendPOD: jest.fn(),
  speedChange: jest.fn(),
  isolir: jest.fn(),
  unisolir: jest.fn(),
}));

jest.mock('axios', () => ({
  post: jest.fn(),
}));

const { appPool } = require('../../src/config/database');
const coaService = require('../../src/services/coa.service');
const axios = require('axios');
const ticketService = require('../../src/services/ticket.service');

describe('Ticket Service - Remote Troubleshooting', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset env vars
    process.env.ACS_API_URL = 'http://acs.local/api';
    process.env.ACS_API_USERNAME = 'admin';
    process.env.ACS_API_PASSWORD = 'secret';
  });

  afterEach(() => {
    delete process.env.ACS_API_URL;
    delete process.env.ACS_API_USERNAME;
    delete process.env.ACS_API_PASSWORD;
  });

  const mockUser = { id: 99, branch_id: 10, role: 'Admin' };

  const mockTicketWithDetails = {
    id: 42,
    customer_id: 1,
    subscription_id: 5,
    status: 'InProgress',
    branch_id: 10,
    customer_name: 'John Doe',
    customer_whatsapp: '081234567890',
    pppoe_username: 'pppoe-user-001',
    package_id: 100,
    assigned_teknisi_name: null,
  };

  const mockSubscription = {
    id: 5,
    customer_id: 1,
    package_id: 100,
    pppoe_username: 'pppoe-user-001',
    nas_id: 3,
    status: 'Active',
  };

  describe('triggerRemoteFix', () => {
    describe('NAS commands (CoA/POD) - Req 25.1', () => {
      it('should trigger session kick (POD) and record in journal', async () => {
        // ticketModel.findByIdWithDetails
        appPool.execute.mockResolvedValueOnce([[mockTicketWithDetails], []]);
        // subscriptionModel.findById
        appPool.execute.mockResolvedValueOnce([[mockSubscription], []]);
        // CoA sendPOD
        coaService.sendPOD.mockResolvedValueOnce({
          success: true,
          responseStatus: 'ACK',
          retryCount: 0,
          logId: 1,
        });
        // ticketJournalModel.create
        appPool.execute.mockResolvedValueOnce([{ insertId: 10 }, []]);
        // queueCustomerRemoteFixNotification
        appPool.execute.mockResolvedValueOnce([{ insertId: 1 }, []]);

        const result = await ticketService.triggerRemoteFix(42, {
          action: 'SessionKick',
        }, mockUser);

        expect(result.success).toBe(true);
        expect(result.action).toBe('SessionKick');
        expect(result.ticket_id).toBe(42);
        expect(result.journal).toBeDefined();
        expect(coaService.sendPOD).toHaveBeenCalledWith(5, 3, 'pppoe-user-001');
      });

      it('should trigger CoA speed change with rate_limit param', async () => {
        // ticketModel.findByIdWithDetails
        appPool.execute.mockResolvedValueOnce([[mockTicketWithDetails], []]);
        // subscriptionModel.findById
        appPool.execute.mockResolvedValueOnce([[mockSubscription], []]);
        // CoA speedChange
        coaService.speedChange.mockResolvedValueOnce({
          success: true,
          responseStatus: 'ACK',
          retryCount: 0,
          logId: 2,
        });
        // ticketJournalModel.create
        appPool.execute.mockResolvedValueOnce([{ insertId: 11 }, []]);
        // queueCustomerRemoteFixNotification
        appPool.execute.mockResolvedValueOnce([{ insertId: 1 }, []]);

        const result = await ticketService.triggerRemoteFix(42, {
          action: 'CoASpeedChange',
          params: { rate_limit: '10M/20M' },
        }, mockUser);

        expect(result.success).toBe(true);
        expect(coaService.speedChange).toHaveBeenCalledWith(5, 3, 'pppoe-user-001', '10M/20M');
      });

      it('should trigger CoA unisolir command', async () => {
        // ticketModel.findByIdWithDetails
        appPool.execute.mockResolvedValueOnce([[mockTicketWithDetails], []]);
        // subscriptionModel.findById
        appPool.execute.mockResolvedValueOnce([[mockSubscription], []]);
        // CoA unisolir
        coaService.unisolir.mockResolvedValueOnce({
          success: true,
          responseStatus: 'ACK',
          retryCount: 0,
          logId: 3,
        });
        // ticketJournalModel.create
        appPool.execute.mockResolvedValueOnce([{ insertId: 12 }, []]);
        // queueCustomerRemoteFixNotification
        appPool.execute.mockResolvedValueOnce([{ insertId: 1 }, []]);

        const result = await ticketService.triggerRemoteFix(42, {
          action: 'CoAUnisolir',
        }, mockUser);

        expect(result.success).toBe(true);
        expect(coaService.unisolir).toHaveBeenCalledWith(5, 3, 'pppoe-user-001');
      });

      it('should return failure when NAS command fails', async () => {
        // ticketModel.findByIdWithDetails
        appPool.execute.mockResolvedValueOnce([[mockTicketWithDetails], []]);
        // subscriptionModel.findById
        appPool.execute.mockResolvedValueOnce([[mockSubscription], []]);
        // CoA sendPOD fails
        coaService.sendPOD.mockResolvedValueOnce({
          success: false,
          responseStatus: 'Timeout',
          retryCount: 3,
          logId: 4,
        });
        // ticketJournalModel.create
        appPool.execute.mockResolvedValueOnce([{ insertId: 13 }, []]);
        // queueCustomerRemoteFixNotification
        appPool.execute.mockResolvedValueOnce([{ insertId: 1 }, []]);

        const result = await ticketService.triggerRemoteFix(42, {
          action: 'SessionKick',
        }, mockUser);

        expect(result.success).toBe(false);
        expect(result.details.responseStatus).toBe('Timeout');
      });

      it('should return failure when subscription has no NAS assigned', async () => {
        const subNoNas = { ...mockSubscription, nas_id: null };
        // ticketModel.findByIdWithDetails
        appPool.execute.mockResolvedValueOnce([[mockTicketWithDetails], []]);
        // subscriptionModel.findById
        appPool.execute.mockResolvedValueOnce([[subNoNas], []]);
        // ticketJournalModel.create
        appPool.execute.mockResolvedValueOnce([{ insertId: 14 }, []]);
        // queueCustomerRemoteFixNotification
        appPool.execute.mockResolvedValueOnce([{ insertId: 1 }, []]);

        const result = await ticketService.triggerRemoteFix(42, {
          action: 'SessionKick',
        }, mockUser);

        expect(result.success).toBe(false);
        expect(result.details.error).toBe('NO_NAS_ASSIGNED');
      });

      it('should return failure when rate_limit missing for CoASpeedChange', async () => {
        // ticketModel.findByIdWithDetails
        appPool.execute.mockResolvedValueOnce([[mockTicketWithDetails], []]);
        // subscriptionModel.findById
        appPool.execute.mockResolvedValueOnce([[mockSubscription], []]);
        // ticketJournalModel.create
        appPool.execute.mockResolvedValueOnce([{ insertId: 15 }, []]);
        // queueCustomerRemoteFixNotification
        appPool.execute.mockResolvedValueOnce([{ insertId: 1 }, []]);

        const result = await ticketService.triggerRemoteFix(42, {
          action: 'CoASpeedChange',
          params: {},
        }, mockUser);

        expect(result.success).toBe(false);
        expect(result.details.error).toBe('MISSING_PARAM');
      });
    });

    describe('ACS commands (TR-069) - Req 25.1', () => {
      it('should trigger device reboot via ACS', async () => {
        // ticketModel.findByIdWithDetails
        appPool.execute.mockResolvedValueOnce([[mockTicketWithDetails], []]);
        // subscriptionModel.findById
        appPool.execute.mockResolvedValueOnce([[mockSubscription], []]);
        // axios.post for ACS
        axios.post.mockResolvedValueOnce({ status: 200, data: { success: true } });
        // ticketJournalModel.create
        appPool.execute.mockResolvedValueOnce([{ insertId: 20 }, []]);
        // queueCustomerRemoteFixNotification
        appPool.execute.mockResolvedValueOnce([{ insertId: 1 }, []]);

        const result = await ticketService.triggerRemoteFix(42, {
          action: 'DeviceReboot',
        }, mockUser);

        expect(result.success).toBe(true);
        expect(result.action).toBe('DeviceReboot');
        expect(axios.post).toHaveBeenCalledWith(
          'http://acs.local/api/devices/pppoe-user-001/reboot',
          {},
          expect.objectContaining({
            auth: { username: 'admin', password: 'secret' },
          })
        );
      });

      it('should trigger SSID change via ACS', async () => {
        // ticketModel.findByIdWithDetails
        appPool.execute.mockResolvedValueOnce([[mockTicketWithDetails], []]);
        // subscriptionModel.findById
        appPool.execute.mockResolvedValueOnce([[mockSubscription], []]);
        // axios.post for ACS
        axios.post.mockResolvedValueOnce({ status: 200, data: { success: true } });
        // ticketJournalModel.create
        appPool.execute.mockResolvedValueOnce([{ insertId: 21 }, []]);
        // queueCustomerRemoteFixNotification
        appPool.execute.mockResolvedValueOnce([{ insertId: 1 }, []]);

        const result = await ticketService.triggerRemoteFix(42, {
          action: 'SSIDChange',
          params: { ssid: 'NewWiFiName' },
        }, mockUser);

        expect(result.success).toBe(true);
        expect(axios.post).toHaveBeenCalledWith(
          'http://acs.local/api/devices/pppoe-user-001/wifi',
          { ssid: 'NewWiFiName' },
          expect.any(Object)
        );
      });

      it('should return failure when ACS is not configured', async () => {
        delete process.env.ACS_API_URL;

        // ticketModel.findByIdWithDetails
        appPool.execute.mockResolvedValueOnce([[mockTicketWithDetails], []]);
        // subscriptionModel.findById
        appPool.execute.mockResolvedValueOnce([[mockSubscription], []]);
        // ticketJournalModel.create
        appPool.execute.mockResolvedValueOnce([{ insertId: 22 }, []]);
        // queueCustomerRemoteFixNotification
        appPool.execute.mockResolvedValueOnce([{ insertId: 1 }, []]);

        const result = await ticketService.triggerRemoteFix(42, {
          action: 'DeviceReboot',
        }, mockUser);

        expect(result.success).toBe(false);
        expect(result.details.error).toBe('ACS_NOT_CONFIGURED');
      });

      it('should handle ACS API errors gracefully', async () => {
        // ticketModel.findByIdWithDetails
        appPool.execute.mockResolvedValueOnce([[mockTicketWithDetails], []]);
        // subscriptionModel.findById
        appPool.execute.mockResolvedValueOnce([[mockSubscription], []]);
        // axios.post throws error
        axios.post.mockRejectedValueOnce(new Error('Connection refused'));
        // ticketJournalModel.create
        appPool.execute.mockResolvedValueOnce([{ insertId: 23 }, []]);
        // queueCustomerRemoteFixNotification
        appPool.execute.mockResolvedValueOnce([{ insertId: 1 }, []]);

        const result = await ticketService.triggerRemoteFix(42, {
          action: 'DeviceReboot',
        }, mockUser);

        expect(result.success).toBe(false);
        expect(result.details.error).toBe('ACS_ERROR');
      });
    });

    describe('Journal recording - Req 25.2', () => {
      it('should record remote action in ticket journal', async () => {
        // ticketModel.findByIdWithDetails
        appPool.execute.mockResolvedValueOnce([[mockTicketWithDetails], []]);
        // subscriptionModel.findById
        appPool.execute.mockResolvedValueOnce([[mockSubscription], []]);
        // CoA sendPOD
        coaService.sendPOD.mockResolvedValueOnce({
          success: true,
          responseStatus: 'ACK',
          retryCount: 0,
          logId: 1,
        });
        // ticketJournalModel.create
        appPool.execute.mockResolvedValueOnce([{ insertId: 30 }, []]);
        // queueCustomerRemoteFixNotification
        appPool.execute.mockResolvedValueOnce([{ insertId: 1 }, []]);

        const result = await ticketService.triggerRemoteFix(42, {
          action: 'SessionKick',
        }, mockUser);

        // Verify journal was created (3rd appPool.execute call)
        const journalCall = appPool.execute.mock.calls[2];
        expect(journalCall[0]).toContain('INSERT INTO ticket_journals');
        expect(journalCall[1][0]).toBe(42); // ticket_id
        expect(journalCall[1][1]).toBe(99); // teknisi_id (admin user)
        expect(journalCall[1][2]).toContain('[Remote Fix]');
        expect(journalCall[1][2]).toContain('Success');
      });

      it('should record failure in journal when action fails', async () => {
        // ticketModel.findByIdWithDetails
        appPool.execute.mockResolvedValueOnce([[mockTicketWithDetails], []]);
        // subscriptionModel.findById
        appPool.execute.mockResolvedValueOnce([[mockSubscription], []]);
        // CoA sendPOD fails
        coaService.sendPOD.mockResolvedValueOnce({
          success: false,
          responseStatus: 'Timeout',
          retryCount: 3,
          logId: 5,
        });
        // ticketJournalModel.create
        appPool.execute.mockResolvedValueOnce([{ insertId: 31 }, []]);
        // queueCustomerRemoteFixNotification
        appPool.execute.mockResolvedValueOnce([{ insertId: 1 }, []]);

        await ticketService.triggerRemoteFix(42, {
          action: 'SessionKick',
        }, mockUser);

        // Verify journal records failure
        const journalCall = appPool.execute.mock.calls[2];
        expect(journalCall[1][2]).toContain('Failed');
      });

      it('should send confirmation notification to customer', async () => {
        // ticketModel.findByIdWithDetails
        appPool.execute.mockResolvedValueOnce([[mockTicketWithDetails], []]);
        // subscriptionModel.findById
        appPool.execute.mockResolvedValueOnce([[mockSubscription], []]);
        // CoA sendPOD
        coaService.sendPOD.mockResolvedValueOnce({
          success: true,
          responseStatus: 'ACK',
          retryCount: 0,
          logId: 1,
        });
        // ticketJournalModel.create
        appPool.execute.mockResolvedValueOnce([{ insertId: 32 }, []]);
        // queueCustomerRemoteFixNotification
        appPool.execute.mockResolvedValueOnce([{ insertId: 1 }, []]);

        await ticketService.triggerRemoteFix(42, {
          action: 'SessionKick',
        }, mockUser);

        // Verify notification was queued (4th appPool.execute call)
        const notifCall = appPool.execute.mock.calls[3];
        expect(notifCall[0]).toContain('INSERT INTO notifications');
        expect(notifCall[1][0]).toBe('081234567890'); // customer whatsapp
        expect(notifCall[1][1]).toBe('remote_fix_confirmation');
      });
    });

    describe('Ticket status transitions', () => {
      it('should transition ticket from Open to InProgress on remote fix', async () => {
        const openTicket = { ...mockTicketWithDetails, status: 'Open' };
        // ticketModel.findByIdWithDetails
        appPool.execute.mockResolvedValueOnce([[openTicket], []]);
        // subscriptionModel.findById
        appPool.execute.mockResolvedValueOnce([[mockSubscription], []]);
        // CoA sendPOD
        coaService.sendPOD.mockResolvedValueOnce({
          success: true,
          responseStatus: 'ACK',
          retryCount: 0,
          logId: 1,
        });
        // ticketJournalModel.create
        appPool.execute.mockResolvedValueOnce([{ insertId: 40 }, []]);
        // ticketModel.update (status -> InProgress)
        appPool.execute.mockResolvedValueOnce([{ affectedRows: 1 }, []]);
        // queueCustomerRemoteFixNotification
        appPool.execute.mockResolvedValueOnce([{ insertId: 1 }, []]);

        await ticketService.triggerRemoteFix(42, {
          action: 'SessionKick',
        }, mockUser);

        // Verify status update was called
        const updateCall = appPool.execute.mock.calls[3];
        expect(updateCall[0]).toContain('UPDATE tickets SET');
        expect(updateCall[1]).toContain('InProgress');
      });
    });

    describe('Validation errors', () => {
      it('should throw 404 when ticket not found', async () => {
        // ticketModel.findByIdWithDetails returns empty
        appPool.execute.mockResolvedValueOnce([[], []]);

        await expect(
          ticketService.triggerRemoteFix(999, { action: 'SessionKick' }, mockUser)
        ).rejects.toMatchObject({
          statusCode: 404,
          code: 'RESOURCE_NOT_FOUND',
        });
      });

      it('should throw 400 when ticket is closed', async () => {
        const closedTicket = { ...mockTicketWithDetails, status: 'Closed' };
        // ticketModel.findByIdWithDetails
        appPool.execute.mockResolvedValueOnce([[closedTicket], []]);

        await expect(
          ticketService.triggerRemoteFix(42, { action: 'SessionKick' }, mockUser)
        ).rejects.toMatchObject({
          statusCode: 400,
          code: 'VALIDATION_ERROR',
        });
      });

      it('should throw 400 when action is invalid', async () => {
        // ticketModel.findByIdWithDetails
        appPool.execute.mockResolvedValueOnce([[mockTicketWithDetails], []]);

        await expect(
          ticketService.triggerRemoteFix(42, { action: 'InvalidAction' }, mockUser)
        ).rejects.toMatchObject({
          statusCode: 400,
          code: 'VALIDATION_ERROR',
        });
      });

      it('should throw 400 when ticket has no subscription linked', async () => {
        const ticketNoSub = { ...mockTicketWithDetails, subscription_id: null };
        // ticketModel.findByIdWithDetails
        appPool.execute.mockResolvedValueOnce([[ticketNoSub], []]);

        await expect(
          ticketService.triggerRemoteFix(42, { action: 'SessionKick' }, mockUser)
        ).rejects.toMatchObject({
          statusCode: 400,
          code: 'VALIDATION_ERROR',
        });
      });

      it('should throw 404 when linked subscription not found', async () => {
        // ticketModel.findByIdWithDetails
        appPool.execute.mockResolvedValueOnce([[mockTicketWithDetails], []]);
        // subscriptionModel.findById returns empty
        appPool.execute.mockResolvedValueOnce([[], []]);

        await expect(
          ticketService.triggerRemoteFix(42, { action: 'SessionKick' }, mockUser)
        ).rejects.toMatchObject({
          statusCode: 404,
          code: 'RESOURCE_NOT_FOUND',
        });
      });
    });
  });

  describe('closeTicketWithRemoteFix - Req 25.3', () => {
    const mockTicket = {
      id: 42,
      customer_id: 1,
      status: 'InProgress',
    };

    it('should close ticket with RemoteFix resolution type', async () => {
      // ticketModel.findById (validation)
      appPool.execute.mockResolvedValueOnce([[mockTicket], []]);
      // ticketModel.update
      appPool.execute.mockResolvedValueOnce([{ affectedRows: 1 }, []]);
      // ticketModel.findById (return updated)
      appPool.execute.mockResolvedValueOnce([[{
        ...mockTicket,
        status: 'Closed',
        resolution_type: 'RemoteFix',
        closed_by: 99,
      }], []]);

      const result = await ticketService.closeTicketWithRemoteFix(42, mockUser);

      expect(result.status).toBe('Closed');
      expect(result.resolution_type).toBe('RemoteFix');
      expect(result.closed_by).toBe(99);

      // Verify update was called with correct params
      const updateCall = appPool.execute.mock.calls[1];
      expect(updateCall[0]).toContain('UPDATE tickets SET');
      expect(updateCall[1]).toContain('Closed');
      expect(updateCall[1]).toContain('RemoteFix');
    });

    it('should throw 404 when ticket not found', async () => {
      // ticketModel.findById returns empty
      appPool.execute.mockResolvedValueOnce([[], []]);

      await expect(
        ticketService.closeTicketWithRemoteFix(999, mockUser)
      ).rejects.toMatchObject({
        statusCode: 404,
        code: 'RESOURCE_NOT_FOUND',
      });
    });

    it('should throw 400 when ticket is already closed', async () => {
      const closedTicket = { ...mockTicket, status: 'Closed' };
      // ticketModel.findById
      appPool.execute.mockResolvedValueOnce([[closedTicket], []]);

      await expect(
        ticketService.closeTicketWithRemoteFix(42, mockUser)
      ).rejects.toMatchObject({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
      });
    });

    it('should work on Open tickets (resolve + close in one step)', async () => {
      const openTicket = { ...mockTicket, status: 'Open' };
      // ticketModel.findById (validation)
      appPool.execute.mockResolvedValueOnce([[openTicket], []]);
      // ticketModel.update
      appPool.execute.mockResolvedValueOnce([{ affectedRows: 1 }, []]);
      // ticketModel.findById (return updated)
      appPool.execute.mockResolvedValueOnce([[{
        ...openTicket,
        status: 'Closed',
        resolution_type: 'RemoteFix',
        closed_by: 99,
      }], []]);

      const result = await ticketService.closeTicketWithRemoteFix(42, mockUser);

      expect(result.status).toBe('Closed');
      expect(result.resolution_type).toBe('RemoteFix');
    });
  });
});
