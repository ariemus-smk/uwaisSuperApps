/**
 * Unit tests for infrastructure controller (ODP and Coverage handlers).
 *
 * Requirements: 29.1, 47.1
 */

// Mock dependencies before requiring the controller
jest.mock('../../src/config/database', () => ({
  appPool: {
    execute: jest.fn().mockResolvedValue([[], []]),
    query: jest.fn().mockResolvedValue([[], []]),
  },
}));

jest.mock('../../src/models/odp.model');
jest.mock('../../src/models/olt.model');
jest.mock('../../src/services/coverage.service');
jest.mock('../../src/services/infrastructure.service');

const odpModel = require('../../src/models/odp.model');
const oltModel = require('../../src/models/olt.model');
const coverageService = require('../../src/services/coverage.service');
const infrastructureController = require('../../src/controllers/infrastructure.controller');

function mockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

describe('Infrastructure Controller - ODP Handlers', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  describe('listOdps', () => {
    it('should return paginated ODP list', async () => {
      const req = { query: { branch_id: '1', page: '1', limit: '10' } };
      const res = mockRes();

      odpModel.findAll.mockResolvedValueOnce({
        odps: [{ id: 1, name: 'ODP-001' }],
        total: 1,
      });

      await infrastructureController.listOdps(req, res);

      expect(odpModel.findAll).toHaveBeenCalledWith({
        branch_id: 1,
        page: 1,
        limit: 10,
      });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'success',
          data: [{ id: 1, name: 'ODP-001' }],
          pagination: expect.objectContaining({ totalItems: 1 }),
        })
      );
    });

    it('should handle errors gracefully', async () => {
      const req = { query: {} };
      const res = mockRes();

      odpModel.findAll.mockRejectedValueOnce(new Error('DB error'));

      await infrastructureController.listOdps(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'error' })
      );
    });
  });

  describe('createOdp', () => {
    const validBody = {
      name: 'ODP-TEST',
      latitude: -6.2,
      longitude: 106.8,
      total_ports: 8,
      olt_id: 1,
      olt_pon_port: 2,
      branch_id: 1,
    };

    it('should create ODP when OLT is valid and active', async () => {
      const req = { body: validBody };
      const res = mockRes();

      oltModel.findById.mockResolvedValueOnce({
        id: 1,
        status: 'Active',
        total_pon_ports: 16,
      });
      odpModel.create.mockResolvedValueOnce({ id: 1, ...validBody, used_ports: 0, status: 'Active' });

      await infrastructureController.createOdp(req, res);

      expect(oltModel.findById).toHaveBeenCalledWith(1);
      expect(odpModel.create).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'ODP-TEST', used_ports: 0 })
      );
      expect(res.status).toHaveBeenCalledWith(201);
    });

    it('should return 404 when OLT does not exist', async () => {
      const req = { body: validBody };
      const res = mockRes();

      oltModel.findById.mockResolvedValueOnce(null);

      await infrastructureController.createOdp(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'The specified OLT does not exist.' })
      );
    });

    it('should return 400 when OLT is inactive', async () => {
      const req = { body: validBody };
      const res = mockRes();

      oltModel.findById.mockResolvedValueOnce({
        id: 1,
        status: 'Inactive',
        total_pon_ports: 16,
      });

      await infrastructureController.createOdp(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'The specified OLT is not active.' })
      );
    });

    it('should return 400 when PON port exceeds OLT capacity', async () => {
      const req = { body: { ...validBody, olt_pon_port: 20 } };
      const res = mockRes();

      oltModel.findById.mockResolvedValueOnce({
        id: 1,
        status: 'Active',
        total_pon_ports: 16,
      });

      await infrastructureController.createOdp(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'OLT PON port must be between 1 and 16.',
        })
      );
    });
  });

  describe('updateOdp', () => {
    it('should update ODP successfully', async () => {
      const req = { params: { id: '1' }, body: { name: 'ODP-UPDATED' } };
      const res = mockRes();

      odpModel.findById
        .mockResolvedValueOnce({ id: 1, name: 'ODP-OLD', olt_id: 1, olt_pon_port: 2 })
        .mockResolvedValueOnce({ id: 1, name: 'ODP-UPDATED' });
      odpModel.update.mockResolvedValueOnce({ affectedRows: 1 });

      await infrastructureController.updateOdp(req, res);

      expect(odpModel.update).toHaveBeenCalledWith(1, { name: 'ODP-UPDATED' });
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('should return 404 when ODP not found', async () => {
      const req = { params: { id: '999' }, body: { name: 'X' } };
      const res = mockRes();

      odpModel.findById.mockResolvedValueOnce(null);

      await infrastructureController.updateOdp(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('should validate OLT when olt_id changes', async () => {
      const req = { params: { id: '1' }, body: { olt_id: 2 } };
      const res = mockRes();

      odpModel.findById
        .mockResolvedValueOnce({ id: 1, olt_id: 1, olt_pon_port: 3 })
        .mockResolvedValueOnce({ id: 1, olt_id: 2, olt_pon_port: 3 });
      oltModel.findById.mockResolvedValueOnce({ id: 2, status: 'Active', total_pon_ports: 8 });
      odpModel.update.mockResolvedValueOnce({ affectedRows: 1 });

      await infrastructureController.updateOdp(req, res);

      expect(oltModel.findById).toHaveBeenCalledWith(2);
      expect(res.status).toHaveBeenCalledWith(200);
    });
  });
});

describe('Infrastructure Controller - Coverage Handler', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  describe('checkCoverage', () => {
    it('should return coverage result with nearby ODPs', async () => {
      const req = { query: { latitude: '-6.2', longitude: '106.8' } };
      const res = mockRes();

      coverageService.checkCoverage.mockResolvedValueOnce({
        covered: true,
        latitude: -6.2,
        longitude: 106.8,
        radius_meters: 500,
        odps: [{ id: 1, name: 'ODP-001', distance_meters: 200 }],
        message: '1 ODP(s) found within 500m radius.',
      });

      await infrastructureController.checkCoverage(req, res);

      expect(coverageService.checkCoverage).toHaveBeenCalledWith(-6.2, 106.8, undefined);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'success',
          data: expect.objectContaining({ covered: true }),
        })
      );
    });

    it('should pass custom radius when provided', async () => {
      const req = { query: { latitude: '-6.2', longitude: '106.8', radius_meters: '1000' } };
      const res = mockRes();

      coverageService.checkCoverage.mockResolvedValueOnce({
        covered: false,
        latitude: -6.2,
        longitude: 106.8,
        radius_meters: 1000,
        odps: [],
        message: 'No active ODP with available ports found within 1000m radius.',
      });

      await infrastructureController.checkCoverage(req, res);

      expect(coverageService.checkCoverage).toHaveBeenCalledWith(-6.2, 106.8, 1000);
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('should handle errors gracefully', async () => {
      const req = { query: { latitude: '-6.2', longitude: '106.8' } };
      const res = mockRes();

      coverageService.checkCoverage.mockRejectedValueOnce(new Error('DB error'));

      await infrastructureController.checkCoverage(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });
});
