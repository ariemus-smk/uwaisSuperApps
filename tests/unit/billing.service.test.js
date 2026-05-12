/**
 * Unit tests for billing service.
 * Tests invoice generation with/without PPN, prorata, DP deduction, and waiver logic.
 *
 * Requirements: 5.1, 6.2, 11.1, 46.2, 46.3
 */

// Mock dependencies before requiring the service
jest.mock('../../src/config/database', () => ({
  appPool: {
    execute: jest.fn().mockResolvedValue([[], []]),
    query: jest.fn().mockResolvedValue([[], []]),
  },
}));

jest.mock('../../src/models/invoice.model');
jest.mock('../../src/models/subscription.model');
jest.mock('../../src/models/package.model');
jest.mock('../../src/models/customer.model');
jest.mock('../../src/utils/prorataCalc');

const { appPool } = require('../../src/config/database');
const invoiceModel = require('../../src/models/invoice.model');
const subscriptionModel = require('../../src/models/subscription.model');
const packageModel = require('../../src/models/package.model');
const customerModel = require('../../src/models/customer.model');
const { calculateProrata } = require('../../src/utils/prorataCalc');
const billingService = require('../../src/services/billing.service');

describe('Billing Service', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    // Restore default for appPool.execute
    appPool.execute.mockResolvedValue([[], []]);
  });

  const mockSubscription = {
    id: 1,
    customer_id: 10,
    package_id: 5,
    pppoe_username: 'uwais-abc123',
    status: 'Active',
    customer_name: 'John Doe',
    branch_id: 1,
    package_name: 'Paket 10 Mbps',
    monthly_price: 150000,
  };

  const mockPackage = {
    id: 5,
    name: 'Paket 10 Mbps',
    monthly_price: 150000,
    ppn_enabled: true,
    status: 'Active',
  };

  const mockPackageNoPpn = {
    id: 6,
    name: 'Paket 5 Mbps',
    monthly_price: 100000,
    ppn_enabled: false,
    status: 'Active',
  };

  describe('generateInvoice', () => {
    it('should generate an invoice with PPN (11%) when ppn_enabled', async () => {
      subscriptionModel.findByIdWithDetails.mockResolvedValue(mockSubscription);
      packageModel.findById.mockResolvedValue(mockPackage);
      invoiceModel.findBySubscriptionAndPeriod.mockResolvedValue(null);
      invoiceModel.generateInvoiceNumber.mockResolvedValue('INV-202401-00001');
      invoiceModel.create.mockImplementation((data) => Promise.resolve({ id: 1, ...data }));

      const result = await billingService.generateInvoice(1, {
        billingPeriod: '2024-01',
        generationDate: '2024-01-01',
      });

      expect(result.base_amount).toBe(150000);
      expect(result.ppn_amount).toBe(16500); // 150000 * 0.11
      expect(result.total_amount).toBe(166500); // 150000 + 16500
      expect(result.status).toBe('UNPAID');
      expect(result.due_date).toBe('2024-01-10');
    });

    it('should generate an invoice without PPN when ppn_enabled is false', async () => {
      const subNoPpn = { ...mockSubscription, package_id: 6 };
      subscriptionModel.findByIdWithDetails.mockResolvedValue(subNoPpn);
      packageModel.findById.mockResolvedValue(mockPackageNoPpn);
      invoiceModel.findBySubscriptionAndPeriod.mockResolvedValue(null);
      invoiceModel.generateInvoiceNumber.mockResolvedValue('INV-202401-00002');
      invoiceModel.create.mockImplementation((data) => Promise.resolve({ id: 2, ...data }));

      const result = await billingService.generateInvoice(1, {
        billingPeriod: '2024-01',
        generationDate: '2024-01-01',
      });

      expect(result.base_amount).toBe(100000);
      expect(result.ppn_amount).toBe(0);
      expect(result.total_amount).toBe(100000);
    });

    it('should apply prorata for first invoice when prorata is enabled', async () => {
      subscriptionModel.findByIdWithDetails.mockResolvedValue(mockSubscription);
      packageModel.findById.mockResolvedValue(mockPackage);
      invoiceModel.findBySubscriptionAndPeriod.mockResolvedValue(null);
      invoiceModel.generateInvoiceNumber.mockResolvedValue('INV-202401-00003');
      invoiceModel.create.mockImplementation((data) => Promise.resolve({ id: 3, ...data }));
      // system setting: prorata_enabled = true
      appPool.execute.mockResolvedValueOnce([[{ setting_value: 'true' }], []]);

      calculateProrata.mockReturnValue({
        amount: 96774.19,
        dailyRate: 4838.71,
        remainingDays: 20,
        totalDaysInMonth: 31,
        isFullMonth: false,
      });

      const result = await billingService.generateInvoice(1, {
        isFirstInvoice: true,
        activationDate: '2024-01-12',
        billingPeriod: '2024-01',
        generationDate: '2024-01-12',
      });

      expect(calculateProrata).toHaveBeenCalledWith({
        monthlyPrice: 150000,
        activationDate: '2024-01-12',
      });
      expect(result.base_amount).toBe(96774.19);
      expect(result.ppn_amount).toBe(10645.16); // 96774.19 * 0.11 rounded
    });

    it('should use full price for first invoice when prorata is disabled', async () => {
      subscriptionModel.findByIdWithDetails.mockResolvedValue(mockSubscription);
      packageModel.findById.mockResolvedValue(mockPackage);
      invoiceModel.findBySubscriptionAndPeriod.mockResolvedValue(null);
      invoiceModel.generateInvoiceNumber.mockResolvedValue('INV-202401-00004');
      invoiceModel.create.mockImplementation((data) => Promise.resolve({ id: 4, ...data }));
      // system setting: prorata_enabled = false
      appPool.execute.mockResolvedValueOnce([[{ setting_value: 'false' }], []]);

      const result = await billingService.generateInvoice(1, {
        isFirstInvoice: true,
        activationDate: '2024-01-15',
        billingPeriod: '2024-01',
        generationDate: '2024-01-15',
      });

      expect(calculateProrata).not.toHaveBeenCalled();
      expect(result.base_amount).toBe(150000);
    });

    it('should include installation fee and addon charges', async () => {
      subscriptionModel.findByIdWithDetails.mockResolvedValue(mockSubscription);
      packageModel.findById.mockResolvedValue(mockPackage);
      invoiceModel.findBySubscriptionAndPeriod.mockResolvedValue(null);
      invoiceModel.generateInvoiceNumber.mockResolvedValue('INV-202401-00005');
      invoiceModel.create.mockImplementation((data) => Promise.resolve({ id: 5, ...data }));

      const result = await billingService.generateInvoice(1, {
        installationFee: 200000,
        addonCharges: 50000,
        billingPeriod: '2024-01',
        generationDate: '2024-01-01',
      });

      expect(result.installation_fee).toBe(200000);
      expect(result.addon_charges).toBe(50000);
      // total = 150000 + 16500 (PPN) + 200000 + 50000 = 416500
      expect(result.total_amount).toBe(416500);
    });

    it('should apply down payment deduction', async () => {
      subscriptionModel.findByIdWithDetails.mockResolvedValue(mockSubscription);
      packageModel.findById.mockResolvedValue(mockPackage);
      invoiceModel.findBySubscriptionAndPeriod.mockResolvedValue(null);
      invoiceModel.generateInvoiceNumber.mockResolvedValue('INV-202401-00006');
      invoiceModel.create.mockImplementation((data) => Promise.resolve({ id: 6, ...data }));
      // getUnappliedDownPayments
      appPool.execute
        .mockResolvedValueOnce([[{ id: 1, amount: 50000 }], []]) // first call for DP lookup
        .mockResolvedValueOnce([[{ id: 1, amount: 50000 }], []]) // second call for applying
        .mockResolvedValueOnce([{ affectedRows: 1 }, []]); // update DP as applied

      const result = await billingService.generateInvoice(1, {
        applyDp: true,
        billingPeriod: '2024-01',
        generationDate: '2024-01-01',
      });

      expect(result.dp_deduction).toBe(50000);
      // total = 150000 + 16500 - 50000 = 116500
      expect(result.total_amount).toBe(116500);
    });

    it('should cap DP deduction to not exceed total before DP', async () => {
      const cheapPackage = { ...mockPackageNoPpn, monthly_price: 30000 };
      const cheapSub = { ...mockSubscription, package_id: 6 };
      subscriptionModel.findByIdWithDetails.mockResolvedValue(cheapSub);
      packageModel.findById.mockResolvedValue(cheapPackage);
      invoiceModel.findBySubscriptionAndPeriod.mockResolvedValue(null);
      invoiceModel.generateInvoiceNumber.mockResolvedValue('INV-202401-00007');
      invoiceModel.create.mockImplementation((data) => Promise.resolve({ id: 7, ...data }));
      // getUnappliedDownPayments - DP exceeds invoice total
      appPool.execute
        .mockResolvedValueOnce([[{ id: 1, amount: 50000 }], []])
        .mockResolvedValueOnce([[{ id: 1, amount: 50000 }], []])
        .mockResolvedValueOnce([{ affectedRows: 1 }, []]);

      const result = await billingService.generateInvoice(1, {
        applyDp: true,
        billingPeriod: '2024-01',
        generationDate: '2024-01-01',
      });

      // total before DP = 30000, DP = 50000, capped to 30000
      expect(result.dp_deduction).toBe(30000);
      expect(result.total_amount).toBe(0);
    });

    it('should throw 404 when subscription not found', async () => {
      subscriptionModel.findByIdWithDetails.mockResolvedValue(null);

      await expect(
        billingService.generateInvoice(999, { billingPeriod: '2024-01' })
      ).rejects.toMatchObject({
        message: 'Subscription not found.',
        statusCode: 404,
      });
    });

    it('should throw 409 when invoice already exists for period', async () => {
      subscriptionModel.findByIdWithDetails.mockResolvedValue(mockSubscription);
      packageModel.findById.mockResolvedValue(mockPackage);
      invoiceModel.findBySubscriptionAndPeriod.mockResolvedValue({ id: 1, status: 'UNPAID' });

      await expect(
        billingService.generateInvoice(1, { billingPeriod: '2024-01' })
      ).rejects.toMatchObject({
        statusCode: 409,
        code: 'RESOURCE_ALREADY_EXISTS',
      });
    });

    it('should set due date to 10th of billing month', async () => {
      subscriptionModel.findByIdWithDetails.mockResolvedValue(mockSubscription);
      packageModel.findById.mockResolvedValue(mockPackage);
      invoiceModel.findBySubscriptionAndPeriod.mockResolvedValue(null);
      invoiceModel.generateInvoiceNumber.mockResolvedValue('INV-202403-00001');
      invoiceModel.create.mockImplementation((data) => Promise.resolve({ id: 8, ...data }));

      const result = await billingService.generateInvoice(1, {
        billingPeriod: '2024-03',
        generationDate: '2024-03-01',
      });

      expect(result.due_date).toBe('2024-03-10');
    });

    describe('prorata edge cases (Feb 28/29, day-1)', () => {
      it('should calculate prorata for Feb 28 activation in non-leap year (28 days)', async () => {
        subscriptionModel.findByIdWithDetails.mockResolvedValue(mockSubscription);
        packageModel.findById.mockResolvedValue(mockPackage);
        invoiceModel.findBySubscriptionAndPeriod.mockResolvedValue(null);
        invoiceModel.generateInvoiceNumber.mockResolvedValue('INV-202302-00001');
        invoiceModel.create.mockImplementation((data) => Promise.resolve({ id: 9, ...data }));
        // prorata enabled
        appPool.execute.mockResolvedValueOnce([[{ setting_value: 'true' }], []]);

        // Feb 28 in non-leap year: 1 remaining day out of 28
        calculateProrata.mockReturnValue({
          amount: 5357.14, // 150000 / 28 * 1
          dailyRate: 5357.14,
          remainingDays: 1,
          totalDaysInMonth: 28,
          isFullMonth: false,
        });

        const result = await billingService.generateInvoice(1, {
          isFirstInvoice: true,
          activationDate: '2023-02-28',
          billingPeriod: '2023-02',
          generationDate: '2023-02-28',
        });

        expect(calculateProrata).toHaveBeenCalledWith({
          monthlyPrice: 150000,
          activationDate: '2023-02-28',
        });
        expect(result.base_amount).toBe(5357.14);
        // PPN: 5357.14 * 0.11 = 589.29 (rounded)
        expect(result.ppn_amount).toBe(589.29);
      });

      it('should calculate prorata for Feb 29 activation in leap year (29 days)', async () => {
        subscriptionModel.findByIdWithDetails.mockResolvedValue(mockSubscription);
        packageModel.findById.mockResolvedValue(mockPackage);
        invoiceModel.findBySubscriptionAndPeriod.mockResolvedValue(null);
        invoiceModel.generateInvoiceNumber.mockResolvedValue('INV-202402-00001');
        invoiceModel.create.mockImplementation((data) => Promise.resolve({ id: 10, ...data }));
        // prorata enabled
        appPool.execute.mockResolvedValueOnce([[{ setting_value: 'true' }], []]);

        // Feb 29 in leap year: 1 remaining day out of 29
        calculateProrata.mockReturnValue({
          amount: 5172.41, // 150000 / 29 * 1
          dailyRate: 5172.41,
          remainingDays: 1,
          totalDaysInMonth: 29,
          isFullMonth: false,
        });

        const result = await billingService.generateInvoice(1, {
          isFirstInvoice: true,
          activationDate: '2024-02-29',
          billingPeriod: '2024-02',
          generationDate: '2024-02-29',
        });

        expect(calculateProrata).toHaveBeenCalledWith({
          monthlyPrice: 150000,
          activationDate: '2024-02-29',
        });
        expect(result.base_amount).toBe(5172.41);
      });

      it('should charge full month when activation is on day 1 (prorata enabled)', async () => {
        subscriptionModel.findByIdWithDetails.mockResolvedValue(mockSubscription);
        packageModel.findById.mockResolvedValue(mockPackage);
        invoiceModel.findBySubscriptionAndPeriod.mockResolvedValue(null);
        invoiceModel.generateInvoiceNumber.mockResolvedValue('INV-202401-00010');
        invoiceModel.create.mockImplementation((data) => Promise.resolve({ id: 11, ...data }));
        // prorata enabled
        appPool.execute.mockResolvedValueOnce([[{ setting_value: 'true' }], []]);

        // Day 1 activation: full month (31 remaining days out of 31)
        calculateProrata.mockReturnValue({
          amount: 150000,
          dailyRate: 4838.71,
          remainingDays: 31,
          totalDaysInMonth: 31,
          isFullMonth: true,
        });

        const result = await billingService.generateInvoice(1, {
          isFirstInvoice: true,
          activationDate: '2024-01-01',
          billingPeriod: '2024-01',
          generationDate: '2024-01-01',
        });

        expect(calculateProrata).toHaveBeenCalledWith({
          monthlyPrice: 150000,
          activationDate: '2024-01-01',
        });
        // Full month charge even with prorata enabled (day 1 = full month)
        expect(result.base_amount).toBe(150000);
        expect(result.ppn_amount).toBe(16500);
        expect(result.total_amount).toBe(166500);
      });
    });

    describe('DP deduction and carry-over', () => {
      it('should deduct multiple DPs when combined DP <= invoice total', async () => {
        subscriptionModel.findByIdWithDetails.mockResolvedValue(mockSubscription);
        packageModel.findById.mockResolvedValue(mockPackage);
        invoiceModel.findBySubscriptionAndPeriod.mockResolvedValue(null);
        invoiceModel.generateInvoiceNumber.mockResolvedValue('INV-202401-00011');
        invoiceModel.create.mockImplementation((data) => Promise.resolve({ id: 12, ...data }));
        // Multiple DPs totaling less than invoice
        appPool.execute
          .mockResolvedValueOnce([[{ id: 1, amount: 30000 }, { id: 2, amount: 20000 }], []])
          .mockResolvedValueOnce([[{ id: 1, amount: 30000 }, { id: 2, amount: 20000 }], []])
          .mockResolvedValueOnce([{ affectedRows: 1 }, []])
          .mockResolvedValueOnce([{ affectedRows: 1 }, []]);

        const result = await billingService.generateInvoice(1, {
          applyDp: true,
          billingPeriod: '2024-01',
          generationDate: '2024-01-01',
        });

        // total before DP = 150000 + 16500 = 166500
        // DP = 30000 + 20000 = 50000
        expect(result.dp_deduction).toBe(50000);
        expect(result.total_amount).toBe(116500);
      });

      it('should carry over excess DP when DP > invoice total (total becomes 0)', async () => {
        const cheapPkg = { ...mockPackageNoPpn, monthly_price: 20000 };
        const cheapSub = { ...mockSubscription, package_id: 6 };
        subscriptionModel.findByIdWithDetails.mockResolvedValue(cheapSub);
        packageModel.findById.mockResolvedValue(cheapPkg);
        invoiceModel.findBySubscriptionAndPeriod.mockResolvedValue(null);
        invoiceModel.generateInvoiceNumber.mockResolvedValue('INV-202401-00012');
        invoiceModel.create.mockImplementation((data) => Promise.resolve({ id: 13, ...data }));
        // DP of 100000 exceeds invoice total of 20000
        appPool.execute
          .mockResolvedValueOnce([[{ id: 1, amount: 100000 }], []])
          .mockResolvedValueOnce([[{ id: 1, amount: 100000 }], []])
          .mockResolvedValueOnce([{ affectedRows: 1 }, []]);

        const result = await billingService.generateInvoice(1, {
          applyDp: true,
          billingPeriod: '2024-01',
          generationDate: '2024-01-01',
        });

        // total before DP = 20000, DP = 100000, capped to 20000
        expect(result.dp_deduction).toBe(20000);
        expect(result.total_amount).toBe(0);
      });
    });
  });

  describe('waiveInvoice', () => {
    it('should waive an UNPAID invoice with reason', async () => {
      const mockInvoice = { id: 1, status: 'UNPAID', total_amount: 166500 };
      invoiceModel.findById
        .mockResolvedValueOnce(mockInvoice) // first call to check
        .mockResolvedValueOnce({ ...mockInvoice, status: 'WAIVED', waiver_reason: 'Extended Isolir' }); // after update
      invoiceModel.update.mockResolvedValue({ affectedRows: 1 });

      const result = await billingService.waiveInvoice(1, 'Extended Isolir');

      expect(invoiceModel.update).toHaveBeenCalledWith(1, {
        status: 'WAIVED',
        waiver_reason: 'Extended Isolir',
      });
      expect(result.status).toBe('WAIVED');
      expect(result.waiver_reason).toBe('Extended Isolir');
    });

    it('should throw 404 when invoice not found', async () => {
      invoiceModel.findById.mockResolvedValue(null);

      await expect(billingService.waiveInvoice(999, 'reason')).rejects.toMatchObject({
        message: 'Invoice not found.',
        statusCode: 404,
      });
    });

    it('should throw 400 when invoice is not UNPAID', async () => {
      const paidInvoice = { id: 1, status: 'LUNAS' };
      invoiceModel.findById.mockResolvedValue(paidInvoice);

      await expect(billingService.waiveInvoice(1, 'Extended Isolir')).rejects.toMatchObject({
        statusCode: 400,
        code: 'INVALID_STATUS_TRANSITION',
      });
    });

    it('should throw 400 when reason is empty', async () => {
      const mockInvoice = { id: 1, status: 'UNPAID' };
      invoiceModel.findById.mockResolvedValue(mockInvoice);

      await expect(billingService.waiveInvoice(1, '')).rejects.toMatchObject({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
      });
    });

    it('should throw 400 when reason is only whitespace', async () => {
      const mockInvoice = { id: 1, status: 'UNPAID' };
      invoiceModel.findById.mockResolvedValue(mockInvoice);

      await expect(billingService.waiveInvoice(1, '   ')).rejects.toMatchObject({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
      });
    });

    it('should only waive UNPAID invoices (not LUNAS, WAIVED, or CANCELLED)', async () => {
      // LUNAS invoice cannot be waived
      invoiceModel.findById.mockResolvedValue({ id: 2, status: 'LUNAS' });
      await expect(billingService.waiveInvoice(2, 'Extended Isolir')).rejects.toMatchObject({
        statusCode: 400,
        code: 'INVALID_STATUS_TRANSITION',
      });

      // WAIVED invoice cannot be waived again
      invoiceModel.findById.mockResolvedValue({ id: 3, status: 'WAIVED' });
      await expect(billingService.waiveInvoice(3, 'Extended Isolir')).rejects.toMatchObject({
        statusCode: 400,
        code: 'INVALID_STATUS_TRANSITION',
      });

      // CANCELLED invoice cannot be waived
      invoiceModel.findById.mockResolvedValue({ id: 4, status: 'CANCELLED' });
      await expect(billingService.waiveInvoice(4, 'Extended Isolir')).rejects.toMatchObject({
        statusCode: 400,
        code: 'INVALID_STATUS_TRANSITION',
      });
    });

    it('should waive invoice during isolir period with "Extended Isolir" reason', async () => {
      // Simulates waiving an invoice generated during isolir period
      const isolirInvoice = {
        id: 5,
        status: 'UNPAID',
        billing_period: '2024-02',
        total_amount: 166500,
      };
      invoiceModel.findById
        .mockResolvedValueOnce(isolirInvoice)
        .mockResolvedValueOnce({
          ...isolirInvoice,
          status: 'WAIVED',
          waiver_reason: 'Extended Isolir',
        });
      invoiceModel.update.mockResolvedValue({ affectedRows: 1 });

      const result = await billingService.waiveInvoice(5, 'Extended Isolir');

      expect(invoiceModel.update).toHaveBeenCalledWith(5, {
        status: 'WAIVED',
        waiver_reason: 'Extended Isolir',
      });
      expect(result.status).toBe('WAIVED');
      expect(result.waiver_reason).toBe('Extended Isolir');
    });
  });

  describe('getInvoices', () => {
    it('should return paginated invoices', async () => {
      const mockInvoices = [
        { id: 1, invoice_number: 'INV-202401-00001', status: 'UNPAID' },
        { id: 2, invoice_number: 'INV-202401-00002', status: 'LUNAS' },
      ];
      invoiceModel.findAll.mockResolvedValue({ invoices: mockInvoices, total: 2 });

      const result = await billingService.getInvoices({ page: 1, limit: 20 });

      expect(result.invoices).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
      expect(result.totalPages).toBe(1);
    });

    it('should apply branch scoping for non-superadmin users', async () => {
      invoiceModel.findAll.mockResolvedValue({ invoices: [], total: 0 });

      await billingService.getInvoices({}, { branch_id: 3 });

      expect(invoiceModel.findAll).toHaveBeenCalledWith(
        expect.objectContaining({ branch_id: 3 })
      );
    });

    it('should not apply branch scoping for superadmin (null branch_id)', async () => {
      invoiceModel.findAll.mockResolvedValue({ invoices: [], total: 0 });

      await billingService.getInvoices({}, { branch_id: null });

      expect(invoiceModel.findAll).toHaveBeenCalledWith(
        expect.not.objectContaining({ branch_id: expect.anything() })
      );
    });
  });

  describe('getInvoiceById', () => {
    it('should return invoice when found', async () => {
      const mockInvoice = { id: 1, invoice_number: 'INV-202401-00001', status: 'UNPAID' };
      invoiceModel.findById.mockResolvedValue(mockInvoice);

      const result = await billingService.getInvoiceById(1);

      expect(result).toEqual(mockInvoice);
    });

    it('should throw 404 when invoice not found', async () => {
      invoiceModel.findById.mockResolvedValue(null);

      await expect(billingService.getInvoiceById(999)).rejects.toMatchObject({
        message: 'Invoice not found.',
        statusCode: 404,
      });
    });
  });

  describe('PPN_RATE', () => {
    it('should export PPN_RATE as 0.11 (11%)', () => {
      expect(billingService.PPN_RATE).toBe(0.11);
    });
  });

  describe('waiveExtendedIsolir', () => {
    it('should waive all unpaid invoices when customer in Isolir > 30 days', async () => {
      // Customer in Isolir status
      customerModel.findById.mockResolvedValue({
        id: 10,
        lifecycle_status: 'Isolir',
        full_name: 'Test Customer',
      });

      // Isolir started 45 days ago
      const isolirDate = new Date();
      isolirDate.setDate(isolirDate.getDate() - 45);

      // Mock audit log query (isolir start date)
      appPool.execute
        .mockResolvedValueOnce([[{ changed_at: isolirDate.toISOString() }], []])
        // Mock unpaid invoices during isolir period
        .mockResolvedValueOnce([[
          { id: 101, invoice_number: 'INV-202401-00001', billing_period: '2024-01', total_amount: 166500, status: 'UNPAID' },
          { id: 102, invoice_number: 'INV-202402-00001', billing_period: '2024-02', total_amount: 166500, status: 'UNPAID' },
        ], []]);

      invoiceModel.update.mockResolvedValue({ affectedRows: 1 });

      const result = await billingService.waiveExtendedIsolir(10);

      expect(result.waived).toBe(true);
      expect(result.waivedInvoices).toHaveLength(2);
      expect(result.totalWaivedAmount).toBe(333000);
      expect(result.isolirDays).toBe(45);

      // Verify each invoice was waived with correct reason
      expect(invoiceModel.update).toHaveBeenCalledWith(101, {
        status: 'WAIVED',
        waiver_reason: 'Extended Isolir',
      });
      expect(invoiceModel.update).toHaveBeenCalledWith(102, {
        status: 'WAIVED',
        waiver_reason: 'Extended Isolir',
      });
    });

    it('should not waive invoices when isolir duration is 30 days or less', async () => {
      customerModel.findById.mockResolvedValue({
        id: 10,
        lifecycle_status: 'Isolir',
      });

      // Isolir started 20 days ago
      const isolirDate = new Date();
      isolirDate.setDate(isolirDate.getDate() - 20);

      appPool.execute.mockResolvedValueOnce([[{ changed_at: isolirDate.toISOString() }], []]);

      const result = await billingService.waiveExtendedIsolir(10);

      expect(result.waived).toBe(false);
      expect(result.waivedInvoices).toHaveLength(0);
      expect(result.totalWaivedAmount).toBe(0);
      expect(result.isolirDays).toBe(20);
      expect(invoiceModel.update).not.toHaveBeenCalled();
    });

    it('should throw 404 when customer not found', async () => {
      customerModel.findById.mockResolvedValue(null);

      await expect(billingService.waiveExtendedIsolir(999)).rejects.toMatchObject({
        message: 'Customer not found.',
        statusCode: 404,
      });
    });

    it('should throw 400 when customer is not in Isolir status', async () => {
      customerModel.findById.mockResolvedValue({
        id: 10,
        lifecycle_status: 'Aktif',
      });

      await expect(billingService.waiveExtendedIsolir(10)).rejects.toMatchObject({
        statusCode: 400,
        code: 'INVALID_STATUS_TRANSITION',
      });
    });

    it('should throw 404 when isolir start date not found in audit log', async () => {
      customerModel.findById.mockResolvedValue({
        id: 10,
        lifecycle_status: 'Isolir',
      });

      // No audit log entries
      appPool.execute.mockResolvedValueOnce([[], []]);

      await expect(billingService.waiveExtendedIsolir(10)).rejects.toMatchObject({
        statusCode: 404,
        code: 'RESOURCE_NOT_FOUND',
      });
    });

    it('should return waived=false when no unpaid invoices exist during isolir period', async () => {
      customerModel.findById.mockResolvedValue({
        id: 10,
        lifecycle_status: 'Isolir',
      });

      // Isolir started 40 days ago
      const isolirDate = new Date();
      isolirDate.setDate(isolirDate.getDate() - 40);

      appPool.execute
        .mockResolvedValueOnce([[{ changed_at: isolirDate.toISOString() }], []])
        // No unpaid invoices
        .mockResolvedValueOnce([[], []]);

      const result = await billingService.waiveExtendedIsolir(10);

      expect(result.waived).toBe(false);
      expect(result.waivedInvoices).toHaveLength(0);
      expect(result.totalWaivedAmount).toBe(0);
    });

    it('should record waived amount for each invoice', async () => {
      customerModel.findById.mockResolvedValue({
        id: 10,
        lifecycle_status: 'Isolir',
      });

      const isolirDate = new Date();
      isolirDate.setDate(isolirDate.getDate() - 60);

      appPool.execute
        .mockResolvedValueOnce([[{ changed_at: isolirDate.toISOString() }], []])
        .mockResolvedValueOnce([[
          { id: 201, invoice_number: 'INV-202401-00010', billing_period: '2024-01', total_amount: 100000, status: 'UNPAID' },
          { id: 202, invoice_number: 'INV-202402-00010', billing_period: '2024-02', total_amount: 150000, status: 'UNPAID' },
        ], []]);

      invoiceModel.update.mockResolvedValue({ affectedRows: 1 });

      const result = await billingService.waiveExtendedIsolir(10);

      expect(result.waivedInvoices[0]).toEqual({
        id: 201,
        invoice_number: 'INV-202401-00010',
        billing_period: '2024-01',
        waived_amount: 100000,
      });
      expect(result.waivedInvoices[1]).toEqual({
        id: 202,
        invoice_number: 'INV-202402-00010',
        billing_period: '2024-02',
        waived_amount: 150000,
      });
      expect(result.totalWaivedAmount).toBe(250000);
    });
  });
});
