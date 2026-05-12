/**
 * Unit tests for ticket service.
 * Tests: ticket creation with auto-priority classification, assignment,
 * progress updates, resolution, and closure.
 *
 * Requirements: 24.1, 24.2, 24.3, 24.4, 24.5
 */

// Mock dependencies before requiring the service
jest.mock('../../src/config/database', () => ({
  appPool: {
    execute: jest.fn().mockResolvedValue([[], []]),
    query: jest.fn().mockResolvedValue([[], []]),
  },
}));

const { appPool } = require('../../src/config/database');
const ticketService = require('../../src/services/ticket.service');

describe('Ticket Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const mockCustomer = {
    id: 1,
    full_name: 'John Doe',
    branch_id: 10,
    lifecycle_status: 'Aktif',
    whatsapp_number: '081234567890',
  };

  const mockSubscription = {
    id: 5,
    customer_id: 1,
    package_id: 100,
    pppoe_username: 'pppoe-user-001',
    nas_id: 3,
    status: 'Active',
  };

  const mockPackageVIP = {
    id: 100,
    name: 'Paket Enterprise',
    monthly_price: 600000,
  };

  const mockPackageHigh = {
    id: 101,
    name: 'Paket Business',
    monthly_price: 300000,
  };

  const mockPackageNormal = {
    id: 102,
    name: 'Paket Home',
    monthly_price: 150000,
  };

  const mockUser = { id: 99, branch_id: 10, role: 'Admin' };

  describe('classifyPriority', () => {
    const rules = ticketService.DEFAULT_PRIORITY_RULES;

    it('should classify as VIP when package price >= vipThreshold (Req 24.2)', async () => {
      // subscriptionModel.findById
      appPool.execute.mockResolvedValueOnce([[mockSubscription], []]);
      // packageModel.findById
      appPool.execute.mockResolvedValueOnce([[mockPackageVIP], []]);

      const priority = await ticketService.classifyPriority({
        subscriptionId: 5,
        issueDescription: 'Internet mati',
        rules,
      });

      expect(priority).toBe('VIP');
    });

    it('should classify as High when package price >= highThreshold (Req 24.2)', async () => {
      // subscriptionModel.findById
      appPool.execute.mockResolvedValueOnce([[mockSubscription], []]);
      // packageModel.findById
      appPool.execute.mockResolvedValueOnce([[mockPackageHigh], []]);

      const priority = await ticketService.classifyPriority({
        subscriptionId: 5,
        issueDescription: 'Internet lambat',
        rules,
      });

      expect(priority).toBe('High');
    });

    it('should classify as High when issue contains high-severity keywords', async () => {
      // subscriptionModel.findById
      appPool.execute.mockResolvedValueOnce([[mockSubscription], []]);
      // packageModel.findById
      appPool.execute.mockResolvedValueOnce([[mockPackageNormal], []]);

      const priority = await ticketService.classifyPriority({
        subscriptionId: 5,
        issueDescription: 'Internet total down sejak tadi pagi',
        rules,
      });

      expect(priority).toBe('High');
    });

    it('should classify as Low when issue contains low-severity keywords', async () => {
      // subscriptionModel.findById
      appPool.execute.mockResolvedValueOnce([[mockSubscription], []]);
      // packageModel.findById
      appPool.execute.mockResolvedValueOnce([[mockPackageNormal], []]);

      const priority = await ticketService.classifyPriority({
        subscriptionId: 5,
        issueDescription: 'Mau ganti wifi password',
        rules,
      });

      expect(priority).toBe('Low');
    });

    it('should classify as Normal when no rules match', async () => {
      // subscriptionModel.findById
      appPool.execute.mockResolvedValueOnce([[mockSubscription], []]);
      // packageModel.findById
      appPool.execute.mockResolvedValueOnce([[mockPackageNormal], []]);

      const priority = await ticketService.classifyPriority({
        subscriptionId: 5,
        issueDescription: 'Koneksi putus-putus kadang',
        rules,
      });

      expect(priority).toBe('Normal');
    });

    it('should classify as Normal when no subscription provided', async () => {
      const priority = await ticketService.classifyPriority({
        subscriptionId: null,
        issueDescription: 'Koneksi bermasalah',
        rules,
      });

      expect(priority).toBe('Normal');
    });

    it('should use configurable rules from system_settings', async () => {
      // getPriorityRules -> system_settings query returns custom rules
      appPool.execute.mockResolvedValueOnce([[{
        setting_value: JSON.stringify({
          vipThreshold: 1000000,
          highThreshold: 500000,
          highSeverityKeywords: ['emergency'],
          lowSeverityKeywords: ['question'],
        }),
      }], []]);

      const priority = await ticketService.classifyPriority({
        subscriptionId: null,
        issueDescription: 'This is an emergency situation',
      });

      expect(priority).toBe('High');
    });
  });

  describe('createTicket', () => {
    it('should create a ticket with auto-classified priority (Req 24.1, 24.2)', async () => {
      // 1. customerModel.findById (validation)
      appPool.execute.mockResolvedValueOnce([[mockCustomer], []]);
      // 2. subscriptionModel.findById (validation - subscription belongs to customer)
      appPool.execute.mockResolvedValueOnce([[mockSubscription], []]);
      // 3. getPriorityRules -> system_settings query
      appPool.execute.mockResolvedValueOnce([[], []]);
      // 4. classifyPriority -> subscriptionModel.findById
      appPool.execute.mockResolvedValueOnce([[mockSubscription], []]);
      // 5. classifyPriority -> packageModel.findById
      appPool.execute.mockResolvedValueOnce([[mockPackageNormal], []]);
      // 6. ticketModel.create
      appPool.execute.mockResolvedValueOnce([{ insertId: 42 }, []]);
      // 7. queueAdminNotification
      appPool.execute.mockResolvedValueOnce([{ insertId: 1 }, []]);

      const result = await ticketService.createTicket({
        customer_id: 1,
        subscription_id: 5,
        issue_description: 'Internet bermasalah',
        source: 'Pelanggan',
      }, mockUser);

      expect(result.id).toBe(42);
      expect(result.customer_id).toBe(1);
      expect(result.source).toBe('Pelanggan');
      expect(result.status).toBe('Open');
      expect(result.branch_id).toBe(10);
    });

    it('should throw 404 when customer not found', async () => {
      // customerModel.findById returns empty
      appPool.execute.mockResolvedValueOnce([[], []]);

      await expect(
        ticketService.createTicket({
          customer_id: 999,
          issue_description: 'Test',
          source: 'Admin',
        }, mockUser)
      ).rejects.toMatchObject({
        statusCode: 404,
        code: 'RESOURCE_NOT_FOUND',
      });
    });

    it('should throw 400 when source is invalid', async () => {
      // customerModel.findById
      appPool.execute.mockResolvedValueOnce([[mockCustomer], []]);

      await expect(
        ticketService.createTicket({
          customer_id: 1,
          issue_description: 'Test',
          source: 'InvalidSource',
        }, mockUser)
      ).rejects.toMatchObject({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
      });
    });

    it('should throw 400 when subscription does not belong to customer', async () => {
      // customerModel.findById
      appPool.execute.mockResolvedValueOnce([[mockCustomer], []]);
      // subscriptionModel.findById - belongs to different customer
      const otherSub = { ...mockSubscription, customer_id: 999 };
      appPool.execute.mockResolvedValueOnce([[otherSub], []]);

      await expect(
        ticketService.createTicket({
          customer_id: 1,
          subscription_id: 5,
          issue_description: 'Test',
          source: 'Admin',
        }, mockUser)
      ).rejects.toMatchObject({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
      });
    });

    it('should throw 404 when subscription not found', async () => {
      // customerModel.findById
      appPool.execute.mockResolvedValueOnce([[mockCustomer], []]);
      // subscriptionModel.findById - not found
      appPool.execute.mockResolvedValueOnce([[], []]);

      await expect(
        ticketService.createTicket({
          customer_id: 1,
          subscription_id: 999,
          issue_description: 'Test',
          source: 'Admin',
        }, mockUser)
      ).rejects.toMatchObject({
        statusCode: 404,
        code: 'RESOURCE_NOT_FOUND',
      });
    });

    it('should throw 400 when issue description is empty', async () => {
      // customerModel.findById
      appPool.execute.mockResolvedValueOnce([[mockCustomer], []]);

      await expect(
        ticketService.createTicket({
          customer_id: 1,
          issue_description: '',
          source: 'Admin',
        }, mockUser)
      ).rejects.toMatchObject({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
      });
    });

    it('should support multiple open tickets per customer (Req 24.3)', async () => {
      // First ticket creation
      // 1. customerModel.findById
      appPool.execute.mockResolvedValueOnce([[mockCustomer], []]);
      // 2. getPriorityRules -> system_settings
      appPool.execute.mockResolvedValueOnce([[], []]);
      // 3. ticketModel.create
      appPool.execute.mockResolvedValueOnce([{ insertId: 1 }, []]);
      // 4. queueAdminNotification
      appPool.execute.mockResolvedValueOnce([{ insertId: 1 }, []]);

      const ticket1 = await ticketService.createTicket({
        customer_id: 1,
        issue_description: 'First issue',
        source: 'Pelanggan',
      }, mockUser);

      // Second ticket creation
      // 5. customerModel.findById
      appPool.execute.mockResolvedValueOnce([[mockCustomer], []]);
      // 6. getPriorityRules -> system_settings
      appPool.execute.mockResolvedValueOnce([[], []]);
      // 7. ticketModel.create
      appPool.execute.mockResolvedValueOnce([{ insertId: 2 }, []]);
      // 8. queueAdminNotification
      appPool.execute.mockResolvedValueOnce([{ insertId: 2 }, []]);

      const ticket2 = await ticketService.createTicket({
        customer_id: 1,
        issue_description: 'Second issue',
        source: 'Pelanggan',
      }, mockUser);

      // Both tickets created successfully (no limit on open tickets)
      expect(ticket1.id).toBe(1);
      expect(ticket2.id).toBe(2);
    });
  });

  describe('assignTicket', () => {
    const mockTicket = {
      id: 42,
      customer_id: 1,
      status: 'Open',
      branch_id: 10,
    };

    it('should assign a ticket to a technician', async () => {
      // ticketModel.findById (validation)
      appPool.execute.mockResolvedValueOnce([[mockTicket], []]);
      // ticketModel.update
      appPool.execute.mockResolvedValueOnce([{ affectedRows: 1 }, []]);
      // ticketModel.findById (return updated)
      appPool.execute.mockResolvedValueOnce([[{ ...mockTicket, status: 'InProgress', assigned_teknisi_id: 20 }], []]);

      const result = await ticketService.assignTicket(42, 20, mockUser);

      expect(result.status).toBe('InProgress');
      expect(result.assigned_teknisi_id).toBe(20);
    });

    it('should throw 404 when ticket not found', async () => {
      // ticketModel.findById returns empty
      appPool.execute.mockResolvedValueOnce([[], []]);

      await expect(
        ticketService.assignTicket(999, 20, mockUser)
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
        ticketService.assignTicket(42, 20, mockUser)
      ).rejects.toMatchObject({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
      });
    });
  });

  describe('updateProgress', () => {
    const mockTicket = {
      id: 42,
      customer_id: 1,
      status: 'InProgress',
      assigned_teknisi_id: 20,
    };

    it('should create a journal entry for ticket progress', async () => {
      // ticketModel.findById
      appPool.execute.mockResolvedValueOnce([[mockTicket], []]);
      // ticketJournalModel.create
      appPool.execute.mockResolvedValueOnce([{ insertId: 1 }, []]);

      const result = await ticketService.updateProgress(42, {
        description: 'Sedang cek kabel di lapangan',
        progress_status: 'Progress',
        photo_urls: ['https://example.com/photo1.jpg'],
        latitude: -6.2,
        longitude: 106.8,
      }, { id: 20 });

      expect(result.id).toBe(1);
      expect(result.ticket_id).toBe(42);
      expect(result.teknisi_id).toBe(20);
      expect(result.progress_status).toBe('Progress');
    });

    it('should throw 404 when ticket not found', async () => {
      // ticketModel.findById returns empty
      appPool.execute.mockResolvedValueOnce([[], []]);

      await expect(
        ticketService.updateProgress(999, {
          description: 'Test',
          progress_status: 'Progress',
        }, { id: 20 })
      ).rejects.toMatchObject({
        statusCode: 404,
      });
    });

    it('should throw 400 when ticket is closed', async () => {
      const closedTicket = { ...mockTicket, status: 'Closed' };
      // ticketModel.findById
      appPool.execute.mockResolvedValueOnce([[closedTicket], []]);

      await expect(
        ticketService.updateProgress(42, {
          description: 'Test',
          progress_status: 'Progress',
        }, { id: 20 })
      ).rejects.toMatchObject({
        statusCode: 400,
      });
    });

    it('should throw 400 when ticket is resolved', async () => {
      const resolvedTicket = { ...mockTicket, status: 'Resolved' };
      // ticketModel.findById
      appPool.execute.mockResolvedValueOnce([[resolvedTicket], []]);

      await expect(
        ticketService.updateProgress(42, {
          description: 'Test',
          progress_status: 'Progress',
        }, { id: 20 })
      ).rejects.toMatchObject({
        statusCode: 400,
      });
    });

    it('should throw 400 when progress_status is invalid', async () => {
      // ticketModel.findById
      appPool.execute.mockResolvedValueOnce([[mockTicket], []]);

      await expect(
        ticketService.updateProgress(42, {
          description: 'Test',
          progress_status: 'InvalidStatus',
        }, { id: 20 })
      ).rejects.toMatchObject({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
      });
    });

    it('should throw 400 when description is empty', async () => {
      // ticketModel.findById
      appPool.execute.mockResolvedValueOnce([[mockTicket], []]);

      await expect(
        ticketService.updateProgress(42, {
          description: '',
          progress_status: 'Progress',
        }, { id: 20 })
      ).rejects.toMatchObject({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
      });
    });

    it('should transition ticket from Open to InProgress on first progress update', async () => {
      const openTicket = { ...mockTicket, status: 'Open' };
      // ticketModel.findById
      appPool.execute.mockResolvedValueOnce([[openTicket], []]);
      // ticketJournalModel.create
      appPool.execute.mockResolvedValueOnce([{ insertId: 1 }, []]);
      // ticketModel.update (status -> InProgress)
      appPool.execute.mockResolvedValueOnce([{ affectedRows: 1 }, []]);

      await ticketService.updateProgress(42, {
        description: 'Starting work',
        progress_status: 'Progress',
      }, { id: 20 });

      // Verify status update was called (3rd call)
      expect(appPool.execute).toHaveBeenCalledTimes(3);
      const updateCall = appPool.execute.mock.calls[2];
      expect(updateCall[0]).toContain('UPDATE tickets SET');
      expect(updateCall[1]).toContain('InProgress');
    });
  });

  describe('resolveTicket', () => {
    const mockTicket = {
      id: 42,
      customer_id: 1,
      status: 'InProgress',
      assigned_teknisi_id: 20,
      priority: 'Normal',
      created_at: '2024-01-15 08:00:00',
    };

    it('should resolve a ticket with resolution type', async () => {
      // ticketModel.findById (validation)
      appPool.execute.mockResolvedValueOnce([[mockTicket], []]);
      // ticketModel.update
      appPool.execute.mockResolvedValueOnce([{ affectedRows: 1 }, []]);
      // getSLAThresholds -> system_settings query
      appPool.execute.mockResolvedValueOnce([[], []]);
      // resolutionMetricsModel.create
      appPool.execute.mockResolvedValueOnce([{ insertId: 1 }, []]);
      // ticketModel.findById (return updated)
      appPool.execute.mockResolvedValueOnce([[{ ...mockTicket, status: 'Resolved', resolution_type: 'FieldFix' }], []]);

      const result = await ticketService.resolveTicket(42, {
        resolution_type: 'FieldFix',
        damage_classification: 'Kabel putus',
      }, mockUser);

      expect(result.status).toBe('Resolved');
      expect(result.resolution_type).toBe('FieldFix');
      expect(result.resolution_time_minutes).toBeDefined();
      expect(typeof result.resolution_time_minutes).toBe('number');
    });

    it('should calculate resolution time from creation to resolution (Req 27.1)', async () => {
      const ticketCreatedAt = '2024-01-15 08:00:00';
      const ticketWithTime = { ...mockTicket, created_at: ticketCreatedAt };

      // ticketModel.findById (validation)
      appPool.execute.mockResolvedValueOnce([[ticketWithTime], []]);
      // ticketModel.update
      appPool.execute.mockResolvedValueOnce([{ affectedRows: 1 }, []]);
      // getSLAThresholds -> system_settings query
      appPool.execute.mockResolvedValueOnce([[], []]);
      // resolutionMetricsModel.create
      appPool.execute.mockResolvedValueOnce([{ insertId: 1 }, []]);
      // ticketModel.findById (return updated)
      appPool.execute.mockResolvedValueOnce([[{ ...ticketWithTime, status: 'Resolved' }], []]);

      const result = await ticketService.resolveTicket(42, {
        resolution_type: 'FieldFix',
      }, mockUser);

      expect(result.resolution_time_minutes).toBeGreaterThanOrEqual(0);
    });

    it('should store resolution metrics per Teknisi (Req 27.2)', async () => {
      // ticketModel.findById (validation)
      appPool.execute.mockResolvedValueOnce([[mockTicket], []]);
      // ticketModel.update
      appPool.execute.mockResolvedValueOnce([{ affectedRows: 1 }, []]);
      // getSLAThresholds -> system_settings query
      appPool.execute.mockResolvedValueOnce([[], []]);
      // resolutionMetricsModel.create
      appPool.execute.mockResolvedValueOnce([{ insertId: 1 }, []]);
      // ticketModel.findById (return updated)
      appPool.execute.mockResolvedValueOnce([[{ ...mockTicket, status: 'Resolved' }], []]);

      await ticketService.resolveTicket(42, {
        resolution_type: 'FieldFix',
      }, mockUser);

      // Verify resolutionMetricsModel.create was called (4th execute call)
      const metricsCall = appPool.execute.mock.calls[3];
      expect(metricsCall[0]).toContain('INSERT INTO teknisi_resolution_metrics');
      expect(metricsCall[1][0]).toBe(20); // teknisi_id
      expect(metricsCall[1][1]).toBe(42); // ticket_id
    });

    it('should not store metrics when no Teknisi is assigned', async () => {
      const unassignedTicket = { ...mockTicket, assigned_teknisi_id: null };

      // ticketModel.findById (validation)
      appPool.execute.mockResolvedValueOnce([[unassignedTicket], []]);
      // ticketModel.update
      appPool.execute.mockResolvedValueOnce([{ affectedRows: 1 }, []]);
      // ticketModel.findById (return updated)
      appPool.execute.mockResolvedValueOnce([[{ ...unassignedTicket, status: 'Resolved' }], []]);

      await ticketService.resolveTicket(42, {
        resolution_type: 'RemoteFix',
      }, mockUser);

      // Should only have 3 calls (no metrics insert, no SLA threshold query)
      expect(appPool.execute).toHaveBeenCalledTimes(3);
    });

    it('should throw 404 when ticket not found', async () => {
      // ticketModel.findById returns empty
      appPool.execute.mockResolvedValueOnce([[], []]);

      await expect(
        ticketService.resolveTicket(999, {}, mockUser)
      ).rejects.toMatchObject({
        statusCode: 404,
      });
    });

    it('should throw 400 when ticket is already resolved', async () => {
      const resolvedTicket = { ...mockTicket, status: 'Resolved' };
      // ticketModel.findById
      appPool.execute.mockResolvedValueOnce([[resolvedTicket], []]);

      await expect(
        ticketService.resolveTicket(42, {}, mockUser)
      ).rejects.toMatchObject({
        statusCode: 400,
      });
    });

    it('should throw 400 when ticket is already closed', async () => {
      const closedTicket = { ...mockTicket, status: 'Closed' };
      // ticketModel.findById
      appPool.execute.mockResolvedValueOnce([[closedTicket], []]);

      await expect(
        ticketService.resolveTicket(42, {}, mockUser)
      ).rejects.toMatchObject({
        statusCode: 400,
      });
    });
  });

  describe('closeTicket', () => {
    const mockResolvedTicket = {
      id: 42,
      customer_id: 1,
      status: 'Resolved',
    };

    it('should close a resolved ticket (Req 27.3)', async () => {
      // ticketModel.findById (validation)
      appPool.execute.mockResolvedValueOnce([[mockResolvedTicket], []]);
      // ticketModel.update
      appPool.execute.mockResolvedValueOnce([{ affectedRows: 1 }, []]);
      // ticketModel.findById (return updated)
      appPool.execute.mockResolvedValueOnce([[{ ...mockResolvedTicket, status: 'Closed', closed_by: 99 }], []]);

      const result = await ticketService.closeTicket(42, mockUser);

      expect(result.status).toBe('Closed');
      expect(result.closed_by).toBe(99);
    });

    it('should record closing Admin and closure timestamp (Req 27.3)', async () => {
      // ticketModel.findById (validation)
      appPool.execute.mockResolvedValueOnce([[mockResolvedTicket], []]);
      // ticketModel.update
      appPool.execute.mockResolvedValueOnce([{ affectedRows: 1 }, []]);
      // ticketModel.findById (return updated)
      appPool.execute.mockResolvedValueOnce([[{ ...mockResolvedTicket, status: 'Closed', closed_by: 99, closed_at: '2024-01-15 12:00:00' }], []]);

      const result = await ticketService.closeTicket(42, mockUser);

      // Verify the update call includes closed_by and closed_at
      const updateCall = appPool.execute.mock.calls[1];
      expect(updateCall[0]).toContain('UPDATE tickets SET');
      expect(updateCall[1]).toContain(99); // closed_by = user.id
    });

    it('should record resolution category when provided (Req 27.3)', async () => {
      // ticketModel.findById (validation)
      appPool.execute.mockResolvedValueOnce([[mockResolvedTicket], []]);
      // ticketModel.update
      appPool.execute.mockResolvedValueOnce([{ affectedRows: 1 }, []]);
      // ticketModel.findById (return updated)
      appPool.execute.mockResolvedValueOnce([[{ ...mockResolvedTicket, status: 'Closed', closed_by: 99, resolution_category: 'FieldFix' }], []]);

      const result = await ticketService.closeTicket(42, mockUser, { resolution_category: 'FieldFix' });

      expect(result.status).toBe('Closed');
      expect(result.resolution_category).toBe('FieldFix');

      // Verify the update call includes resolution_category
      const updateCall = appPool.execute.mock.calls[1];
      expect(updateCall[0]).toContain('resolution_category');
    });

    it('should throw 404 when ticket not found', async () => {
      // ticketModel.findById returns empty
      appPool.execute.mockResolvedValueOnce([[], []]);

      await expect(
        ticketService.closeTicket(999, mockUser)
      ).rejects.toMatchObject({
        statusCode: 404,
      });
    });

    it('should throw 400 when ticket is already closed', async () => {
      const closedTicket = { ...mockResolvedTicket, status: 'Closed' };
      // ticketModel.findById
      appPool.execute.mockResolvedValueOnce([[closedTicket], []]);

      await expect(
        ticketService.closeTicket(42, mockUser)
      ).rejects.toMatchObject({
        statusCode: 400,
      });
    });
  });

  describe('calculateResolutionTimeMinutes', () => {
    it('should calculate resolution time correctly (Req 27.1)', () => {
      const createdAt = '2024-01-15 08:00:00';
      const resolvedAt = '2024-01-15 10:30:00';

      const result = ticketService.calculateResolutionTimeMinutes(createdAt, resolvedAt);

      expect(result).toBe(150); // 2.5 hours = 150 minutes
    });

    it('should return 0 when resolved at same time as created', () => {
      const timestamp = '2024-01-15 08:00:00';

      const result = ticketService.calculateResolutionTimeMinutes(timestamp, timestamp);

      expect(result).toBe(0);
    });

    it('should handle multi-day resolution times', () => {
      const createdAt = '2024-01-15 08:00:00';
      const resolvedAt = '2024-01-16 08:00:00';

      const result = ticketService.calculateResolutionTimeMinutes(createdAt, resolvedAt);

      expect(result).toBe(1440); // 24 hours = 1440 minutes
    });

    it('should never return negative values', () => {
      const createdAt = '2024-01-15 10:00:00';
      const resolvedAt = '2024-01-15 08:00:00'; // Before creation (edge case)

      const result = ticketService.calculateResolutionTimeMinutes(createdAt, resolvedAt);

      expect(result).toBe(0);
    });
  });

  describe('getResolutionMetrics', () => {
    it('should return aggregated metrics for a Teknisi (Req 27.2)', async () => {
      // Validate Teknisi exists
      appPool.execute.mockResolvedValueOnce([[{ id: 20, full_name: 'Teknisi A', branch_id: 10 }], []]);
      // resolutionMetricsModel.getMetricsByTeknisi
      appPool.execute.mockResolvedValueOnce([[{
        total_tickets_resolved: 15,
        avg_resolution_time_minutes: 120,
        sla_compliance_rate: 85.50,
      }], []]);

      const result = await ticketService.getResolutionMetrics(20);

      expect(result.teknisi_id).toBe(20);
      expect(result.teknisi_name).toBe('Teknisi A');
      expect(result.total_tickets_resolved).toBe(15);
      expect(result.avg_resolution_time_minutes).toBe(120);
      expect(result.sla_compliance_rate).toBe(85.50);
    });

    it('should filter metrics by period', async () => {
      // Validate Teknisi exists
      appPool.execute.mockResolvedValueOnce([[{ id: 20, full_name: 'Teknisi A', branch_id: 10 }], []]);
      // resolutionMetricsModel.getMetricsByTeknisi with period filter
      appPool.execute.mockResolvedValueOnce([[{
        total_tickets_resolved: 5,
        avg_resolution_time_minutes: 90,
        sla_compliance_rate: 100.00,
      }], []]);

      const result = await ticketService.getResolutionMetrics(20, { period: '2024-01' });

      expect(result.period).toBe('2024-01');
      expect(result.total_tickets_resolved).toBe(5);
    });

    it('should throw 404 when Teknisi not found', async () => {
      // Validate Teknisi - not found
      appPool.execute.mockResolvedValueOnce([[], []]);

      await expect(
        ticketService.getResolutionMetrics(999)
      ).rejects.toMatchObject({
        statusCode: 404,
        code: 'RESOURCE_NOT_FOUND',
      });
    });
  });

  // =========================================================================
  // Dispatch and Overtime Tests (Requirements: 26.1-26.7)
  // =========================================================================

  describe('isOutsideRegularHours', () => {
    it('should return true for weekend (Saturday)', () => {
      // Saturday at 10:00
      const saturday = new Date('2024-01-06T10:00:00');
      expect(ticketService.isOutsideRegularHours(saturday)).toBe(true);
    });

    it('should return true for weekend (Sunday)', () => {
      // Sunday at 14:00
      const sunday = new Date('2024-01-07T14:00:00');
      expect(ticketService.isOutsideRegularHours(sunday)).toBe(true);
    });

    it('should return true for before 08:00 on weekday', () => {
      // Monday at 07:00
      const earlyMorning = new Date('2024-01-08T07:00:00');
      expect(ticketService.isOutsideRegularHours(earlyMorning)).toBe(true);
    });

    it('should return true for after 17:00 on weekday', () => {
      // Monday at 18:00
      const evening = new Date('2024-01-08T18:00:00');
      expect(ticketService.isOutsideRegularHours(evening)).toBe(true);
    });

    it('should return true for exactly 17:00 (end of work)', () => {
      // Monday at 17:00
      const endOfWork = new Date('2024-01-08T17:00:00');
      expect(ticketService.isOutsideRegularHours(endOfWork)).toBe(true);
    });

    it('should return false for 08:00 on weekday (start of work)', () => {
      // Monday at 08:00
      const startOfWork = new Date('2024-01-08T08:00:00');
      expect(ticketService.isOutsideRegularHours(startOfWork)).toBe(false);
    });

    it('should return false for 12:00 on weekday (midday)', () => {
      // Wednesday at 12:00
      const midday = new Date('2024-01-10T12:00:00');
      expect(ticketService.isOutsideRegularHours(midday)).toBe(false);
    });

    it('should return false for 16:59 on weekday', () => {
      // Friday at 16:59
      const beforeEnd = new Date('2024-01-12T16:59:00');
      expect(ticketService.isOutsideRegularHours(beforeEnd)).toBe(false);
    });
  });

  describe('dispatchTickets', () => {
    const mockTeknisi = { id: 20, full_name: 'Budi Teknisi', branch_id: 10 };
    const mockOpenTicket = { id: 1, customer_id: 1, status: 'Open', priority: 'Normal', branch_id: 10 };
    const mockHighTicket = { id: 2, customer_id: 2, status: 'Open', priority: 'High', branch_id: 10 };
    const mockVIPTicket = { id: 3, customer_id: 3, status: 'Open', priority: 'VIP', branch_id: 10 };

    it('should assign multiple tickets to a technician during regular hours (Req 26.1)', async () => {
      // Monday at 10:00 (regular hours)
      const dispatchTime = new Date('2024-01-08T10:00:00');

      // 1. Validate technician
      appPool.execute.mockResolvedValueOnce([[mockTeknisi], []]);
      // 2. ticketModel.findById for ticket 1
      appPool.execute.mockResolvedValueOnce([[mockOpenTicket], []]);
      // 3. ticketModel.update for ticket 1
      appPool.execute.mockResolvedValueOnce([{ affectedRows: 1 }, []]);
      // 4. ticketModel.findById for ticket 2
      appPool.execute.mockResolvedValueOnce([[mockHighTicket], []]);
      // 5. ticketModel.update for ticket 2
      appPool.execute.mockResolvedValueOnce([{ affectedRows: 1 }, []]);
      // 6. queueTeknisiDispatchNotification
      appPool.execute.mockResolvedValueOnce([{ insertId: 1 }, []]);

      const result = await ticketService.dispatchTickets({
        ticket_ids: [1, 2],
        teknisi_id: 20,
        dispatch_time: dispatchTime,
      }, mockUser);

      expect(result.assigned_tickets).toEqual([1, 2]);
      expect(result.overtime_requests).toEqual([]);
      expect(result.errors).toEqual([]);
      expect(result.teknisi_id).toBe(20);
      expect(result.outside_regular_hours).toBe(false);
    });

    it('should create overtime request for High/VIP tickets outside regular hours (Req 26.3)', async () => {
      // Saturday at 20:00 (outside hours)
      const dispatchTime = new Date('2024-01-06T20:00:00');

      // 1. Validate technician
      appPool.execute.mockResolvedValueOnce([[mockTeknisi], []]);
      // 2. ticketModel.findById for ticket 2 (High priority)
      appPool.execute.mockResolvedValueOnce([[mockHighTicket], []]);
      // 3. overtimeModel.create (INSERT INTO overtime_requests)
      appPool.execute.mockResolvedValueOnce([{ insertId: 100 }, []]);

      const result = await ticketService.dispatchTickets({
        ticket_ids: [2],
        teknisi_id: 20,
        dispatch_time: dispatchTime,
      }, mockUser);

      expect(result.assigned_tickets).toEqual([]);
      expect(result.overtime_requests).toHaveLength(1);
      expect(result.overtime_requests[0].ticket_id).toBe(2);
      expect(result.outside_regular_hours).toBe(true);
    });

    it('should directly assign Normal/Low tickets even outside regular hours', async () => {
      // Saturday at 20:00 (outside hours)
      const dispatchTime = new Date('2024-01-06T20:00:00');

      // 1. Validate technician
      appPool.execute.mockResolvedValueOnce([[mockTeknisi], []]);
      // 2. ticketModel.findById for ticket 1 (Normal priority)
      appPool.execute.mockResolvedValueOnce([[mockOpenTicket], []]);
      // 3. ticketModel.update for ticket 1
      appPool.execute.mockResolvedValueOnce([{ affectedRows: 1 }, []]);
      // 4. queueTeknisiDispatchNotification
      appPool.execute.mockResolvedValueOnce([{ insertId: 1 }, []]);

      const result = await ticketService.dispatchTickets({
        ticket_ids: [1],
        teknisi_id: 20,
        dispatch_time: dispatchTime,
      }, mockUser);

      expect(result.assigned_tickets).toEqual([1]);
      expect(result.overtime_requests).toEqual([]);
      expect(result.outside_regular_hours).toBe(true);
    });

    it('should send notification to assigned Teknisi (Req 26.2)', async () => {
      const dispatchTime = new Date('2024-01-08T10:00:00');

      // 1. Validate technician
      appPool.execute.mockResolvedValueOnce([[mockTeknisi], []]);
      // 2. ticketModel.findById
      appPool.execute.mockResolvedValueOnce([[mockOpenTicket], []]);
      // 3. ticketModel.update
      appPool.execute.mockResolvedValueOnce([{ affectedRows: 1 }, []]);
      // 4. queueTeknisiDispatchNotification
      appPool.execute.mockResolvedValueOnce([{ insertId: 1 }, []]);

      await ticketService.dispatchTickets({
        ticket_ids: [1],
        teknisi_id: 20,
        dispatch_time: dispatchTime,
      }, mockUser);

      // Verify notification was queued (last call)
      const lastCall = appPool.execute.mock.calls[appPool.execute.mock.calls.length - 1];
      expect(lastCall[0]).toContain('INSERT INTO notifications');
      expect(lastCall[1]).toContain('PushNotification');
    });

    it('should throw 400 when no ticket IDs provided', async () => {
      await expect(
        ticketService.dispatchTickets({
          ticket_ids: [],
          teknisi_id: 20,
        }, mockUser)
      ).rejects.toMatchObject({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
      });
    });

    it('should throw 400 when teknisi_id is missing', async () => {
      await expect(
        ticketService.dispatchTickets({
          ticket_ids: [1],
          teknisi_id: null,
        }, mockUser)
      ).rejects.toMatchObject({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
      });
    });

    it('should throw 404 when technician not found', async () => {
      // Validate technician - not found
      appPool.execute.mockResolvedValueOnce([[], []]);

      await expect(
        ticketService.dispatchTickets({
          ticket_ids: [1],
          teknisi_id: 999,
        }, mockUser)
      ).rejects.toMatchObject({
        statusCode: 404,
        code: 'RESOURCE_NOT_FOUND',
      });
    });

    it('should skip closed/resolved tickets and report errors', async () => {
      const dispatchTime = new Date('2024-01-08T10:00:00');
      const closedTicket = { ...mockOpenTicket, id: 5, status: 'Closed' };

      // 1. Validate technician
      appPool.execute.mockResolvedValueOnce([[mockTeknisi], []]);
      // 2. ticketModel.findById for ticket 5 (Closed)
      appPool.execute.mockResolvedValueOnce([[closedTicket], []]);

      const result = await ticketService.dispatchTickets({
        ticket_ids: [5],
        teknisi_id: 20,
        dispatch_time: dispatchTime,
      }, mockUser);

      expect(result.assigned_tickets).toEqual([]);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].ticket_id).toBe(5);
      expect(result.errors[0].error).toContain('resolved or closed');
    });

    it('should handle mix of assignable and overtime-requiring tickets', async () => {
      // Saturday at 20:00 (outside hours)
      const dispatchTime = new Date('2024-01-06T20:00:00');

      // 1. Validate technician
      appPool.execute.mockResolvedValueOnce([[mockTeknisi], []]);
      // 2. ticketModel.findById for ticket 1 (Normal - direct assign)
      appPool.execute.mockResolvedValueOnce([[mockOpenTicket], []]);
      // 3. ticketModel.update for ticket 1
      appPool.execute.mockResolvedValueOnce([{ affectedRows: 1 }, []]);
      // 4. ticketModel.findById for ticket 3 (VIP - overtime)
      appPool.execute.mockResolvedValueOnce([[mockVIPTicket], []]);
      // 5. overtimeModel.create
      appPool.execute.mockResolvedValueOnce([{ insertId: 200 }, []]);
      // 6. queueTeknisiDispatchNotification (for assigned tickets)
      appPool.execute.mockResolvedValueOnce([{ insertId: 1 }, []]);

      const result = await ticketService.dispatchTickets({
        ticket_ids: [1, 3],
        teknisi_id: 20,
        dispatch_time: dispatchTime,
      }, mockUser);

      expect(result.assigned_tickets).toEqual([1]);
      expect(result.overtime_requests).toHaveLength(1);
      expect(result.overtime_requests[0].ticket_id).toBe(3);
    });
  });

  describe('approveOvertime', () => {
    const mockOvertimeRequest = {
      id: 100,
      ticket_id: 42,
      teknisi_id: 20,
      overtime_date: '2024-01-06',
      status: 'Requested',
      teknisi_name: 'Budi Teknisi',
      approved_by_name: null,
    };

    it('should approve overtime and assign ticket to technician (Req 26.4)', async () => {
      // 1. overtimeModel.findById (JOIN query)
      appPool.execute.mockResolvedValueOnce([[mockOvertimeRequest], []]);
      // 2. overtimeModel.approve (UPDATE)
      appPool.execute.mockResolvedValueOnce([{ affectedRows: 1 }, []]);
      // 3. ticketModel.update (assign + InProgress)
      appPool.execute.mockResolvedValueOnce([{ affectedRows: 1 }, []]);
      // 4. queueOvertimeApprovalNotification (INSERT INTO notifications)
      appPool.execute.mockResolvedValueOnce([{ insertId: 1 }, []]);
      // 5. overtimeModel.findById (return updated)
      appPool.execute.mockResolvedValueOnce([[{ ...mockOvertimeRequest, status: 'Approved', approved_by: 99 }], []]);
      // 6. ticketModel.findById (return updated)
      appPool.execute.mockResolvedValueOnce([[{ id: 42, status: 'InProgress', assigned_teknisi_id: 20 }], []]);

      const result = await ticketService.approveOvertime(100, {
        approved_hours: 3,
        compensation_amount: 150000,
      }, mockUser);

      expect(result.overtime.status).toBe('Approved');
      expect(result.ticket.status).toBe('InProgress');
      expect(result.ticket.assigned_teknisi_id).toBe(20);
    });

    it('should throw 404 when overtime request not found', async () => {
      // overtimeModel.findById returns empty
      appPool.execute.mockResolvedValueOnce([[], []]);

      await expect(
        ticketService.approveOvertime(999, {}, mockUser)
      ).rejects.toMatchObject({
        statusCode: 404,
        code: 'RESOURCE_NOT_FOUND',
      });
    });

    it('should throw 400 when overtime already processed', async () => {
      const approvedOvertime = { ...mockOvertimeRequest, status: 'Approved' };
      // overtimeModel.findById
      appPool.execute.mockResolvedValueOnce([[approvedOvertime], []]);

      await expect(
        ticketService.approveOvertime(100, {}, mockUser)
      ).rejects.toMatchObject({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
      });
    });
  });

  describe('rejectOvertime', () => {
    const mockOvertimeRequest = {
      id: 100,
      ticket_id: 42,
      teknisi_id: 20,
      overtime_date: '2024-01-06',
      status: 'Requested',
      teknisi_name: 'Budi Teknisi',
      approved_by_name: null,
    };

    it('should reject overtime and queue ticket as Pending (Req 26.5)', async () => {
      // 1. overtimeModel.findById (JOIN query)
      appPool.execute.mockResolvedValueOnce([[mockOvertimeRequest], []]);
      // 2. overtimeModel.reject (UPDATE)
      appPool.execute.mockResolvedValueOnce([{ affectedRows: 1 }, []]);
      // 3. ticketModel.update (status -> Pending)
      appPool.execute.mockResolvedValueOnce([{ affectedRows: 1 }, []]);
      // 4. queueOvertimeApprovalNotification (INSERT INTO notifications)
      appPool.execute.mockResolvedValueOnce([{ insertId: 1 }, []]);
      // 5. overtimeModel.findById (return updated)
      appPool.execute.mockResolvedValueOnce([[{ ...mockOvertimeRequest, status: 'Rejected', approved_by: 99 }], []]);
      // 6. ticketModel.findById (return updated)
      appPool.execute.mockResolvedValueOnce([[{ id: 42, status: 'Pending' }], []]);

      const result = await ticketService.rejectOvertime(100, mockUser);

      expect(result.overtime.status).toBe('Rejected');
      expect(result.ticket.status).toBe('Pending');
    });

    it('should throw 404 when overtime request not found', async () => {
      // overtimeModel.findById returns empty
      appPool.execute.mockResolvedValueOnce([[], []]);

      await expect(
        ticketService.rejectOvertime(999, mockUser)
      ).rejects.toMatchObject({
        statusCode: 404,
        code: 'RESOURCE_NOT_FOUND',
      });
    });

    it('should throw 400 when overtime already processed', async () => {
      const rejectedOvertime = { ...mockOvertimeRequest, status: 'Rejected' };
      // overtimeModel.findById
      appPool.execute.mockResolvedValueOnce([[rejectedOvertime], []]);

      await expect(
        ticketService.rejectOvertime(100, mockUser)
      ).rejects.toMatchObject({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
      });
    });
  });

  describe('recordDamageClassification', () => {
    const mockTicket = { id: 42, customer_id: 1, status: 'InProgress' };

    it('should record damage classification in ticket (Req 26.7)', async () => {
      // 1. ticketModel.findById
      appPool.execute.mockResolvedValueOnce([[mockTicket], []]);
      // 2. ticketModel.update
      appPool.execute.mockResolvedValueOnce([{ affectedRows: 1 }, []]);
      // 3. ticketModel.findById (return updated)
      appPool.execute.mockResolvedValueOnce([[{ ...mockTicket, damage_classification: 'Kabel putus' }], []]);

      const result = await ticketService.recordDamageClassification(42, 'Kabel putus', mockUser);

      expect(result.damage_classification).toBe('Kabel putus');
    });

    it('should throw 404 when ticket not found', async () => {
      appPool.execute.mockResolvedValueOnce([[], []]);

      await expect(
        ticketService.recordDamageClassification(999, 'Kabel putus', mockUser)
      ).rejects.toMatchObject({
        statusCode: 404,
        code: 'RESOURCE_NOT_FOUND',
      });
    });

    it('should throw 400 when damage classification is empty', async () => {
      appPool.execute.mockResolvedValueOnce([[mockTicket], []]);

      await expect(
        ticketService.recordDamageClassification(42, '', mockUser)
      ).rejects.toMatchObject({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
      });
    });

    it('should throw 400 when damage classification is null', async () => {
      appPool.execute.mockResolvedValueOnce([[mockTicket], []]);

      await expect(
        ticketService.recordDamageClassification(42, null, mockUser)
      ).rejects.toMatchObject({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
      });
    });
  });
});
