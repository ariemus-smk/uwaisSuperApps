/**
 * Unit tests for work journal service.
 * Tests: journal creation with/without ticket link, filtering by date/Teknisi/Branch,
 * ownership enforcement for update/delete, and get by ID.
 *
 * Requirements: 44.1, 44.3
 */

// Mock dependencies before requiring the service
jest.mock('../../src/config/database', () => ({
  appPool: {
    execute: jest.fn().mockResolvedValue([[], []]),
    query: jest.fn().mockResolvedValue([[], []]),
  },
}));

jest.mock('../../src/models/ticket.model', () => ({
  findById: jest.fn(),
}));

jest.mock('../../src/models/workJournal.model', () => ({
  create: jest.fn(),
  findById: jest.fn(),
  findByTeknisiId: jest.fn(),
  findAll: jest.fn(),
  update: jest.fn(),
  deleteById: jest.fn(),
}));

const ticketModel = require('../../src/models/ticket.model');
const workJournalModel = require('../../src/models/workJournal.model');
const workJournalService = require('../../src/services/workJournal.service');

describe('Work Journal Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const mockUser = { id: 10, role: 'Teknisi', branch_id: 1 };
  const mockAdminUser = { id: 99, role: 'Admin', branch_id: 1 };

  const mockJournalEntry = {
    id: 1,
    teknisi_id: 10,
    ticket_id: null,
    journal_date: '2024-03-15',
    activity_description: 'Instalasi pelanggan baru di area Cibiru',
    photo_urls: ['https://example.com/photo1.jpg'],
    latitude: -6.9,
    longitude: 107.6,
    created_at: '2024-03-15 08:00:00',
  };

  const mockTicket = {
    id: 5,
    customer_id: 1,
    status: 'InProgress',
    assigned_teknisi_id: 10,
  };

  // ===========================================================================
  // createJournalEntry
  // ===========================================================================

  describe('createJournalEntry', () => {
    it('should create a journal entry with ticket link (Req 44.1)', async () => {
      ticketModel.findById.mockResolvedValueOnce(mockTicket);
      workJournalModel.create.mockResolvedValueOnce({
        ...mockJournalEntry,
        ticket_id: 5,
      });

      const data = {
        ticket_id: 5,
        journal_date: '2024-03-15',
        activity_description: 'Perbaikan kabel di pelanggan',
        photo_urls: ['https://example.com/photo1.jpg'],
        latitude: -6.9,
        longitude: 107.6,
      };

      const result = await workJournalService.createJournalEntry(data, mockUser);

      expect(ticketModel.findById).toHaveBeenCalledWith(5);
      expect(workJournalModel.create).toHaveBeenCalledWith({
        teknisi_id: 10,
        ticket_id: 5,
        journal_date: '2024-03-15',
        activity_description: 'Perbaikan kabel di pelanggan',
        photo_urls: ['https://example.com/photo1.jpg'],
        latitude: -6.9,
        longitude: 107.6,
      });
      expect(result.ticket_id).toBe(5);
    });

    it('should create a journal entry without ticket link (standalone) (Req 44.1)', async () => {
      workJournalModel.create.mockResolvedValueOnce(mockJournalEntry);

      const data = {
        journal_date: '2024-03-15',
        activity_description: 'Instalasi pelanggan baru di area Cibiru',
        photo_urls: ['https://example.com/photo1.jpg'],
        latitude: -6.9,
        longitude: 107.6,
      };

      const result = await workJournalService.createJournalEntry(data, mockUser);

      expect(ticketModel.findById).not.toHaveBeenCalled();
      expect(workJournalModel.create).toHaveBeenCalledWith({
        teknisi_id: 10,
        ticket_id: null,
        journal_date: '2024-03-15',
        activity_description: 'Instalasi pelanggan baru di area Cibiru',
        photo_urls: ['https://example.com/photo1.jpg'],
        latitude: -6.9,
        longitude: 107.6,
      });
      expect(result.ticket_id).toBeNull();
    });

    it('should throw 404 when ticket_id is invalid (ticket not found)', async () => {
      ticketModel.findById.mockResolvedValueOnce(null);

      const data = {
        ticket_id: 999,
        journal_date: '2024-03-15',
        activity_description: 'Perbaikan kabel',
      };

      await expect(
        workJournalService.createJournalEntry(data, mockUser)
      ).rejects.toMatchObject({
        statusCode: 404,
        code: 'RESOURCE_NOT_FOUND',
      });

      expect(ticketModel.findById).toHaveBeenCalledWith(999);
      expect(workJournalModel.create).not.toHaveBeenCalled();
    });

    it('should throw 400 when activity_description is empty', async () => {
      const data = {
        journal_date: '2024-03-15',
        activity_description: '',
      };

      await expect(
        workJournalService.createJournalEntry(data, mockUser)
      ).rejects.toMatchObject({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
      });
    });

    it('should throw 400 when journal_date is missing', async () => {
      const data = {
        activity_description: 'Some activity',
      };

      await expect(
        workJournalService.createJournalEntry(data, mockUser)
      ).rejects.toMatchObject({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
      });
    });
  });

  // ===========================================================================
  // getJournalById
  // ===========================================================================

  describe('getJournalById', () => {
    it('should return journal entry when found', async () => {
      workJournalModel.findById.mockResolvedValueOnce(mockJournalEntry);

      const result = await workJournalService.getJournalById(1);

      expect(workJournalModel.findById).toHaveBeenCalledWith(1);
      expect(result).toEqual(mockJournalEntry);
    });

    it('should throw 404 when journal entry not found', async () => {
      workJournalModel.findById.mockResolvedValueOnce(null);

      await expect(
        workJournalService.getJournalById(999)
      ).rejects.toMatchObject({
        statusCode: 404,
        code: 'RESOURCE_NOT_FOUND',
      });
    });
  });

  // ===========================================================================
  // listMyJournals (Teknisi own journals)
  // ===========================================================================

  describe('listMyJournals', () => {
    it('should list journals for the requesting Teknisi filtered by date range', async () => {
      const mockResult = {
        journals: [mockJournalEntry],
        total: 1,
      };
      workJournalModel.findByTeknisiId.mockResolvedValueOnce(mockResult);

      const filters = {
        startDate: '2024-03-01',
        endDate: '2024-03-31',
        page: 1,
        limit: 20,
      };

      const result = await workJournalService.listMyJournals(filters, mockUser);

      expect(workJournalModel.findByTeknisiId).toHaveBeenCalledWith(10, {
        startDate: '2024-03-01',
        endDate: '2024-03-31',
        page: 1,
        limit: 20,
      });
      expect(result.journals).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
      expect(result.totalPages).toBe(1);
    });

    it('should use default pagination when not provided', async () => {
      const mockResult = { journals: [], total: 0 };
      workJournalModel.findByTeknisiId.mockResolvedValueOnce(mockResult);

      const result = await workJournalService.listMyJournals({}, mockUser);

      expect(workJournalModel.findByTeknisiId).toHaveBeenCalledWith(10, {
        startDate: undefined,
        endDate: undefined,
        page: 1,
        limit: 20,
      });
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
    });
  });

  // ===========================================================================
  // listJournals (Admin view with filters) - Req 44.3
  // ===========================================================================

  describe('listJournals', () => {
    it('should list journals filtered by Teknisi ID (Req 44.3)', async () => {
      const mockResult = {
        journals: [mockJournalEntry],
        total: 1,
      };
      workJournalModel.findAll.mockResolvedValueOnce(mockResult);

      const filters = { teknisi_id: '10', page: 1, limit: 20 };

      const result = await workJournalService.listJournals(filters, mockAdminUser);

      expect(workJournalModel.findAll).toHaveBeenCalledWith(
        expect.objectContaining({
          teknisi_id: 10,
          page: 1,
          limit: 20,
          branch_id: 1,
        })
      );
      expect(result.journals).toHaveLength(1);
    });

    it('should list journals filtered by date range (Req 44.3)', async () => {
      const mockResult = { journals: [mockJournalEntry], total: 1 };
      workJournalModel.findAll.mockResolvedValueOnce(mockResult);

      const filters = {
        startDate: '2024-03-01',
        endDate: '2024-03-31',
        page: 1,
        limit: 20,
      };

      const result = await workJournalService.listJournals(filters, mockAdminUser);

      expect(workJournalModel.findAll).toHaveBeenCalledWith(
        expect.objectContaining({
          startDate: '2024-03-01',
          endDate: '2024-03-31',
          branch_id: 1,
        })
      );
      expect(result.journals).toHaveLength(1);
    });

    it('should apply branch scoping for Admin users (Req 44.3)', async () => {
      const mockResult = { journals: [], total: 0 };
      workJournalModel.findAll.mockResolvedValueOnce(mockResult);

      const adminWithBranch = { id: 99, role: 'Admin', branch_id: 5 };
      const filters = { page: 1, limit: 20 };

      await workJournalService.listJournals(filters, adminWithBranch);

      expect(workJournalModel.findAll).toHaveBeenCalledWith(
        expect.objectContaining({
          branch_id: 5,
        })
      );
    });

    it('should not apply branch scoping for Superadmin (branch_id null)', async () => {
      const mockResult = { journals: [], total: 0 };
      workJournalModel.findAll.mockResolvedValueOnce(mockResult);

      const superadmin = { id: 1, role: 'Superadmin', branch_id: null };
      const filters = { page: 1, limit: 20 };

      await workJournalService.listJournals(filters, superadmin);

      const callArgs = workJournalModel.findAll.mock.calls[0][0];
      expect(callArgs.branch_id).toBeUndefined();
    });

    it('should calculate totalPages correctly', async () => {
      const mockResult = { journals: Array(20).fill(mockJournalEntry), total: 45 };
      workJournalModel.findAll.mockResolvedValueOnce(mockResult);

      const filters = { page: 1, limit: 20 };
      const result = await workJournalService.listJournals(filters, mockAdminUser);

      expect(result.totalPages).toBe(3); // ceil(45/20) = 3
      expect(result.total).toBe(45);
    });
  });

  // ===========================================================================
  // updateJournalEntry - Ownership enforcement
  // ===========================================================================

  describe('updateJournalEntry', () => {
    it('should update own journal entry successfully', async () => {
      workJournalModel.findById.mockResolvedValueOnce(mockJournalEntry);
      const updatedEntry = { ...mockJournalEntry, activity_description: 'Updated description' };
      workJournalModel.update.mockResolvedValueOnce(updatedEntry);

      const data = { activity_description: 'Updated description' };
      const result = await workJournalService.updateJournalEntry(1, data, mockUser);

      expect(workJournalModel.findById).toHaveBeenCalledWith(1);
      expect(workJournalModel.update).toHaveBeenCalledWith(1, expect.objectContaining({
        activity_description: 'Updated description',
      }));
      expect(result.activity_description).toBe('Updated description');
    });

    it('should throw 403 when updating another Teknisi journal entry', async () => {
      const otherTeknisiEntry = { ...mockJournalEntry, teknisi_id: 20 };
      workJournalModel.findById.mockResolvedValueOnce(otherTeknisiEntry);

      const data = { activity_description: 'Trying to update' };

      await expect(
        workJournalService.updateJournalEntry(1, data, mockUser)
      ).rejects.toMatchObject({
        statusCode: 403,
        code: 'AUTH_FORBIDDEN',
      });

      expect(workJournalModel.update).not.toHaveBeenCalled();
    });

    it('should throw 404 when journal entry not found', async () => {
      workJournalModel.findById.mockResolvedValueOnce(null);

      await expect(
        workJournalService.updateJournalEntry(999, { activity_description: 'Test' }, mockUser)
      ).rejects.toMatchObject({
        statusCode: 404,
        code: 'RESOURCE_NOT_FOUND',
      });
    });

    it('should validate ticket exists when updating ticket_id', async () => {
      workJournalModel.findById.mockResolvedValueOnce(mockJournalEntry);
      ticketModel.findById.mockResolvedValueOnce(null);

      const data = { ticket_id: 999 };

      await expect(
        workJournalService.updateJournalEntry(1, data, mockUser)
      ).rejects.toMatchObject({
        statusCode: 404,
        code: 'RESOURCE_NOT_FOUND',
      });
    });
  });

  // ===========================================================================
  // deleteJournalEntry - Ownership enforcement
  // ===========================================================================

  describe('deleteJournalEntry', () => {
    it('should delete own journal entry successfully', async () => {
      workJournalModel.findById.mockResolvedValueOnce(mockJournalEntry);
      workJournalModel.deleteById.mockResolvedValueOnce(true);

      await workJournalService.deleteJournalEntry(1, mockUser);

      expect(workJournalModel.findById).toHaveBeenCalledWith(1);
      expect(workJournalModel.deleteById).toHaveBeenCalledWith(1);
    });

    it('should throw 403 when deleting another Teknisi journal entry', async () => {
      const otherTeknisiEntry = { ...mockJournalEntry, teknisi_id: 20 };
      workJournalModel.findById.mockResolvedValueOnce(otherTeknisiEntry);

      await expect(
        workJournalService.deleteJournalEntry(1, mockUser)
      ).rejects.toMatchObject({
        statusCode: 403,
        code: 'AUTH_FORBIDDEN',
      });

      expect(workJournalModel.deleteById).not.toHaveBeenCalled();
    });

    it('should throw 404 when journal entry not found', async () => {
      workJournalModel.findById.mockResolvedValueOnce(null);

      await expect(
        workJournalService.deleteJournalEntry(999, mockUser)
      ).rejects.toMatchObject({
        statusCode: 404,
        code: 'RESOURCE_NOT_FOUND',
      });
    });
  });
});
