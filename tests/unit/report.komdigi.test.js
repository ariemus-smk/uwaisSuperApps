/**
 * Unit tests for Report service - Komdigi regulatory reports.
 * Tests generateKomdigiPackages, generateKomdigiCustomers, generateKomdigiRevenue,
 * and Excel export functions.
 *
 * Requirements: 34.1, 34.2, 34.3, 34.4
 */

jest.mock('../../src/config/database', () => ({
  appPool: {
    execute: jest.fn(),
  },
}));

const { appPool } = require('../../src/config/database');
const reportService = require('../../src/services/report.service');

describe('Report Service - Komdigi', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  describe('generateKomdigiPackages', () => {
    it('should return all active packages with QoS parameters', async () => {
      const mockPackages = [
        {
          id: 1,
          package_name: 'Paket 10 Mbps',
          upload_rate_limit: 5000,
          download_rate_limit: 10000,
          upload_burst_limit: 7000,
          download_burst_limit: 12000,
          upload_burst_threshold: 4000,
          download_burst_threshold: 8000,
          monthly_price: 150000,
          ppn_enabled: 1,
          fup_enabled: 0,
          fup_quota_gb: null,
          fup_upload_speed: null,
          fup_download_speed: null,
          status: 'Active',
          active_subscribers: 25,
        },
        {
          id: 2,
          package_name: 'Paket 20 Mbps',
          upload_rate_limit: 10000,
          download_rate_limit: 20000,
          upload_burst_limit: 15000,
          download_burst_limit: 25000,
          upload_burst_threshold: 8000,
          download_burst_threshold: 16000,
          monthly_price: 250000,
          ppn_enabled: 0,
          fup_enabled: 1,
          fup_quota_gb: 100,
          fup_upload_speed: 5000,
          fup_download_speed: 10000,
          status: 'Active',
          active_subscribers: 15,
        },
      ];

      appPool.execute.mockResolvedValue([mockPackages]);

      const result = await reportService.generateKomdigiPackages();

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        id: 1,
        package_name: 'Paket 10 Mbps',
        upload_speed_kbps: 5000,
        download_speed_kbps: 10000,
        upload_burst_kbps: 7000,
        download_burst_kbps: 12000,
        upload_threshold_kbps: 4000,
        download_threshold_kbps: 8000,
        monthly_price: 150000,
        ppn_enabled: 'Ya',
        fup_enabled: 'Tidak',
        fup_quota_gb: '-',
        fup_upload_speed_kbps: '-',
        fup_download_speed_kbps: '-',
        active_subscribers: 25,
      });
      expect(result[1].fup_enabled).toBe('Ya');
      expect(result[1].fup_quota_gb).toBe(100);
    });

    it('should return empty array when no active packages exist', async () => {
      appPool.execute.mockResolvedValue([[]]);

      const result = await reportService.generateKomdigiPackages();

      expect(result).toEqual([]);
    });

    it('should query only active packages', async () => {
      appPool.execute.mockResolvedValue([[]]);

      await reportService.generateKomdigiPackages();

      expect(appPool.execute).toHaveBeenCalledWith(
        expect.stringContaining('WHERE p.status = ?'),
        ['Active']
      );
    });
  });

  describe('generateKomdigiCustomers', () => {
    beforeEach(() => {
      // Default mock for all 5 queries in generateKomdigiCustomers
      appPool.execute
        .mockResolvedValueOnce([[{ package_name: 'Paket 10M', subscriber_count: 20 }]]) // by package
        .mockResolvedValueOnce([[{ branch_name: 'Cabang A', subscriber_count: 30, active_count: 25, isolir_count: 3, terminated_count: 2 }]]) // by branch
        .mockResolvedValueOnce([[{ status: 'Aktif', count: 50 }, { status: 'Isolir', count: 5 }]]) // by status
        .mockResolvedValueOnce([[{ period: '2024-06', new_customers: 10 }]]) // growth
        .mockResolvedValueOnce([[{ total: 50 }]]); // total active
    });

    it('should return customer report with all sections', async () => {
      const result = await reportService.generateKomdigiCustomers();

      expect(result).toHaveProperty('summary');
      expect(result).toHaveProperty('subscribers_by_package');
      expect(result).toHaveProperty('subscribers_by_branch');
      expect(result).toHaveProperty('subscribers_by_status');
      expect(result).toHaveProperty('growth_metrics');
      expect(result.summary.total_active_subscribers).toBe(50);
    });

    it('should include subscriber counts per package', async () => {
      const result = await reportService.generateKomdigiCustomers();

      expect(result.subscribers_by_package).toEqual([
        { package_name: 'Paket 10M', subscriber_count: 20 },
      ]);
    });

    it('should include subscriber distribution by branch', async () => {
      const result = await reportService.generateKomdigiCustomers();

      expect(result.subscribers_by_branch[0]).toEqual({
        branch_name: 'Cabang A',
        subscriber_count: 30,
        active_count: 25,
        isolir_count: 3,
        terminated_count: 2,
      });
    });

    it('should include growth metrics', async () => {
      const result = await reportService.generateKomdigiCustomers();

      expect(result.growth_metrics).toEqual([
        { period: '2024-06', new_customers: 10 },
      ]);
    });

    it('should apply period filter when provided', async () => {
      appPool.execute.mockReset();
      appPool.execute
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([[{ total: 0 }]]);

      await reportService.generateKomdigiCustomers({ period: '2024-06' });

      // The 4th call is the growth query with period filter
      const growthCall = appPool.execute.mock.calls[3];
      expect(growthCall[1]).toContain('2024-06');
    });
  });

  describe('generateKomdigiRevenue', () => {
    beforeEach(() => {
      appPool.execute
        .mockResolvedValueOnce([[{ period: '2024-06', transaction_count: 100, total_revenue: 15000000 }]]) // monthly
        .mockResolvedValueOnce([[{ payment_method: 'VA', transaction_count: 60, total_amount: 9000000 }]]) // by method
        .mockResolvedValueOnce([[{ handler_type: 'Admin', transaction_count: 40, total_amount: 6000000 }]]); // by handler
    });

    it('should return revenue report with all sections', async () => {
      const result = await reportService.generateKomdigiRevenue();

      expect(result).toHaveProperty('summary');
      expect(result).toHaveProperty('monthly_revenue');
      expect(result).toHaveProperty('revenue_by_payment_method');
      expect(result).toHaveProperty('revenue_by_handler');
    });

    it('should calculate grand total from monthly revenue', async () => {
      const result = await reportService.generateKomdigiRevenue();

      expect(result.summary.grand_total_revenue).toBe(15000000);
      expect(result.summary.total_transactions).toBe(100);
    });

    it('should include monthly revenue breakdown', async () => {
      const result = await reportService.generateKomdigiRevenue();

      expect(result.monthly_revenue).toEqual([
        { period: '2024-06', transaction_count: 100, total_revenue: 15000000 },
      ]);
    });

    it('should include revenue by payment method', async () => {
      const result = await reportService.generateKomdigiRevenue();

      expect(result.revenue_by_payment_method).toEqual([
        { payment_method: 'VA', transaction_count: 60, total_amount: 9000000 },
      ]);
    });

    it('should include revenue by handler type', async () => {
      const result = await reportService.generateKomdigiRevenue();

      expect(result.revenue_by_handler).toEqual([
        { handler_type: 'Admin', transaction_count: 40, total_amount: 6000000 },
      ]);
    });

    it('should apply period filter when provided', async () => {
      appPool.execute.mockReset();
      appPool.execute
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([[]]);

      await reportService.generateKomdigiRevenue({ period: '2024-06' });

      // All 3 queries should include the period filter
      const firstCall = appPool.execute.mock.calls[0];
      expect(firstCall[1]).toContain('2024-06');
    });

    it('should apply date range filter when start_date and end_date provided', async () => {
      appPool.execute.mockReset();
      appPool.execute
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([[]]);

      await reportService.generateKomdigiRevenue({
        start_date: '2024-01-01',
        end_date: '2024-06-30',
      });

      const firstCall = appPool.execute.mock.calls[0];
      expect(firstCall[1]).toContain('2024-01-01');
      expect(firstCall[1]).toContain('2024-06-30');
    });

    it('should handle empty revenue data gracefully', async () => {
      appPool.execute.mockReset();
      appPool.execute
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([[]]);

      const result = await reportService.generateKomdigiRevenue();

      expect(result.summary.grand_total_revenue).toBe(0);
      expect(result.summary.total_transactions).toBe(0);
      expect(result.monthly_revenue).toEqual([]);
    });
  });

  describe('exportKomdigiPackagesExcel', () => {
    it('should return a Buffer', async () => {
      appPool.execute.mockResolvedValue([[]]);

      const buffer = await reportService.exportKomdigiPackagesExcel();

      expect(Buffer.isBuffer(buffer)).toBe(true);
    });

    it('should generate valid xlsx content', async () => {
      appPool.execute.mockResolvedValue([[
        {
          id: 1,
          package_name: 'Paket 10M',
          upload_rate_limit: 5000,
          download_rate_limit: 10000,
          upload_burst_limit: 7000,
          download_burst_limit: 12000,
          upload_burst_threshold: 4000,
          download_burst_threshold: 8000,
          monthly_price: 150000,
          ppn_enabled: 1,
          fup_enabled: 0,
          fup_quota_gb: null,
          fup_upload_speed: null,
          fup_download_speed: null,
          status: 'Active',
          active_subscribers: 10,
        },
      ]]);

      const buffer = await reportService.exportKomdigiPackagesExcel();

      // xlsx files start with PK (zip signature)
      expect(buffer[0]).toBe(0x50); // 'P'
      expect(buffer[1]).toBe(0x4b); // 'K'
    });
  });

  describe('exportKomdigiCustomersExcel', () => {
    it('should return a Buffer', async () => {
      appPool.execute
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([[{ total: 0 }]]);

      const buffer = await reportService.exportKomdigiCustomersExcel();

      expect(Buffer.isBuffer(buffer)).toBe(true);
    });
  });

  describe('exportKomdigiRevenueExcel', () => {
    it('should return a Buffer', async () => {
      appPool.execute
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([[]]);

      const buffer = await reportService.exportKomdigiRevenueExcel();

      expect(Buffer.isBuffer(buffer)).toBe(true);
    });
  });
});
