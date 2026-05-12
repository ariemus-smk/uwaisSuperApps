/**
 * Integration tests for critical business flows.
 * Tests the full HTTP request/response cycle through the Express middleware stack.
 *
 * Requirements: 16.1-16.8, 6.1-6.5, 8.1-8.5, 12.1-12.4, 18.1-19.5
 */

// Set environment before any module loads
process.env.JWT_SECRET = 'test-secret-key';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-key';
process.env.NODE_ENV = 'test';

// Mock database pools
jest.mock('../../src/config/database', () => {
  const { appPool, radiusPool } = require('../helpers/dbMock');
  return { appPool, radiusPool };
});

// Mock service-level dependencies for controlled integration testing
jest.mock('../../src/services/customer.service');
jest.mock('../../src/services/subscription.service');
jest.mock('../../src/services/billing.service');
jest.mock('../../src/services/downPayment.service');
jest.mock('../../src/services/payment.service');
jest.mock('../../src/services/tripay.service');
jest.mock('../../src/services/nas.service');
jest.mock('../../src/services/asset.service');
jest.mock('../../src/services/coa.service');
jest.mock('../../src/services/whatsapp.service');
jest.mock('../../src/services/notification.service');
jest.mock('../../src/services/mikrotikChr.service');
jest.mock('../../src/config/tripay', () => ({
  apiUrl: 'https://tripay.co.id/api',
  apiKey: 'test-api-key',
  privateKey: 'test-private-key',
  merchantCode: 'T12345',
  callbackUrl: 'https://example.com/callback',
}));

const { createAuthenticatedRequest, createUnauthenticatedRequest, ROLES } = require('../helpers/requestFactory');
const customerService = require('../../src/services/customer.service');
const subscriptionService = require('../../src/services/subscription.service');
const billingService = require('../../src/services/billing.service');
const downPaymentService = require('../../src/services/downPayment.service');
const paymentService = require('../../src/services/payment.service');
const tripayService = require('../../src/services/tripay.service');
const nasService = require('../../src/services/nas.service');
const assetService = require('../../src/services/asset.service');

describe('Integration Tests - Critical Flows', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // =========================================================================
  // 1. Customer Activation Flow (register -> install -> pay -> activate)
  // Requirements: 16.1-16.8
  // =========================================================================
  describe('Customer Activation Flow', () => {
    it('should register a new customer with status Prospek', async () => {
      const adminReq = createAuthenticatedRequest(ROLES.ADMIN, { id: 1, branch_id: 1 });

      customerService.createCustomer.mockResolvedValue({
        id: 1,
        full_name: 'Budi Santoso',
        ktp_number: '3201234567890001',
        whatsapp_number: '081234567890',
        lifecycle_status: 'Prospek',
        branch_id: 1,
        registered_by: 1,
      });

      const res = await adminReq.post('/api/customers').send({
        full_name: 'Budi Santoso',
        ktp_number: '3201234567890001',
        whatsapp_number: '081234567890',
        email: 'budi@example.com',
        address: 'Jl. Merdeka No. 10, Bandung',
        latitude: -6.9175,
        longitude: 107.6191,
      });

      expect(res.status).toBe(201);
      expect(res.body.status).toBe('success');
      expect(customerService.createCustomer).toHaveBeenCalledWith(
        expect.objectContaining({ full_name: 'Budi Santoso', ktp_number: '3201234567890001' }),
        expect.objectContaining({ id: 1, role: 'Admin', branch_id: 1 })
      );
    });

    it('should transition customer status from Prospek to Instalasi', async () => {
      const adminReq = createAuthenticatedRequest(ROLES.ADMIN, { id: 1, branch_id: 1 });

      customerService.changeStatus.mockResolvedValue({
        id: 1,
        lifecycle_status: 'Instalasi',
        previous_status: 'Prospek',
      });

      const res = await adminReq.patch('/api/customers/1/status').send({
        status: 'Instalasi',
      });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(customerService.changeStatus).toHaveBeenCalledWith(1, 'Instalasi', expect.any(Object));
    });

    it('should create a subscription and generate PPPoE credentials', async () => {
      const adminReq = createAuthenticatedRequest(ROLES.ADMIN, { id: 1, branch_id: 1 });

      subscriptionService.create.mockResolvedValue({
        id: 1,
        customer_id: 1,
        package_id: 1,
        nas_id: 1,
        pppoe_username: 'pppoe-budi-001',
        pppoe_password: 'securepass123',
        status: 'Pending',
      });

      const res = await adminReq.post('/api/subscriptions').send({
        customer_id: 1,
        package_id: 1,
        nas_id: 1,
      });

      expect(res.status).toBe(201);
      expect(res.body.status).toBe('success');
      expect(subscriptionService.create).toHaveBeenCalled();
    });

    it('should submit installation data by Teknisi', async () => {
      const teknisiReq = createAuthenticatedRequest(ROLES.TEKNISI, { id: 5, branch_id: 1 });

      subscriptionService.install.mockResolvedValue({
        id: 1,
        odp_id: 1,
        odp_port: 3,
        onu_serial_number: 'ZTEG12345678',
        onu_mac_address: 'AA:BB:CC:DD:EE:FF',
        install_latitude: -6.9175,
        install_longitude: 107.6191,
      });

      const res = await teknisiReq.post('/api/subscriptions/1/installation').send({
        odp_id: 1,
        odp_port: 3,
        onu_serial_number: 'ZTEG12345678',
        onu_mac_address: 'AA:BB:CC:DD:EE:FF',
        install_latitude: -6.9175,
        install_longitude: 107.6191,
      });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(subscriptionService.install).toHaveBeenCalledWith(
        1,
        expect.objectContaining({ odp_id: 1, onu_serial_number: 'ZTEG12345678' })
      );
    });

    it('should activate subscription after payment via CoA', async () => {
      const adminReq = createAuthenticatedRequest(ROLES.ADMIN, { id: 1, branch_id: 1 });

      subscriptionService.activate.mockResolvedValue({
        id: 1,
        status: 'Active',
        pppoe_username: 'pppoe-budi-001',
        activated_at: '2024-01-15T10:00:00.000Z',
      });

      const res = await adminReq.post('/api/subscriptions/1/activate');

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(subscriptionService.activate).toHaveBeenCalledWith(1);
    });

    it('should reject customer creation with duplicate KTP', async () => {
      const adminReq = createAuthenticatedRequest(ROLES.ADMIN, { id: 1, branch_id: 1 });

      customerService.createCustomer.mockRejectedValue(
        Object.assign(new Error('A customer with this KTP number already exists.'), {
          statusCode: 409,
          code: 'RESOURCE_ALREADY_EXISTS',
        })
      );

      const res = await adminReq.post('/api/customers').send({
        full_name: 'Duplicate Customer',
        ktp_number: '3201234567890001',
        whatsapp_number: '081234567891',
        email: 'dup@example.com',
        address: 'Jl. Duplicate No. 1, Bandung',
      });

      expect(res.status).toBe(409);
      expect(res.body.status).toBe('error');
      expect(res.body.code).toBe('RESOURCE_ALREADY_EXISTS');
    });

    it('should reject status change from unauthorized role (Pelanggan)', async () => {
      const pelangganReq = createAuthenticatedRequest(ROLES.PELANGGAN, { id: 10, branch_id: 1 });

      const res = await pelangganReq.patch('/api/customers/1/status').send({
        status: 'Instalasi',
      });

      expect(res.status).toBe(403);
    });
  });

  // =========================================================================
  // 2. Billing Cycle (generate -> notify -> isolir -> pay -> unisolir)
  // Requirements: 6.1-6.5
  // =========================================================================
  describe('Billing Cycle Flow', () => {
    it('should list invoices for a customer', async () => {
      const adminReq = createAuthenticatedRequest(ROLES.ADMIN, { id: 1, branch_id: 1 });

      billingService.getInvoices.mockResolvedValue({
        invoices: [
          { id: 1, invoice_number: 'INV-2024-01-001', customer_id: 1, total_amount: 111000, status: 'UNPAID' },
        ],
        total: 1,
        page: 1,
        limit: 20,
        totalPages: 1,
      });

      const res = await adminReq.get('/api/billing/invoices?customer_id=1');

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
    });

    it('should get invoice detail by ID', async () => {
      const accountingReq = createAuthenticatedRequest(ROLES.ACCOUNTING, { id: 2, branch_id: 1 });

      billingService.getInvoiceById.mockResolvedValue({
        id: 1,
        invoice_number: 'INV-2024-01-001',
        customer_id: 1,
        subscription_id: 1,
        billing_period: '2024-01',
        base_amount: 100000,
        ppn_amount: 11000,
        total_amount: 111000,
        status: 'UNPAID',
        due_date: '2024-01-10',
      });

      const res = await accountingReq.get('/api/billing/invoices/1');

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.data).toHaveProperty('invoice_number', 'INV-2024-01-001');
      expect(res.body.data).toHaveProperty('total_amount', 111000);
    });

    it('should waive invoice for extended isolir (Accounting only)', async () => {
      const accountingReq = createAuthenticatedRequest(ROLES.ACCOUNTING, { id: 2, branch_id: 1 });

      billingService.waiveInvoice.mockResolvedValue({
        id: 1,
        status: 'WAIVED',
        waiver_reason: 'Extended Isolir - customer isolated for more than 1 month',
      });

      const res = await accountingReq.post('/api/billing/invoices/1/waive').send({
        reason: 'Extended Isolir - customer isolated for more than 1 month',
      });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(billingService.waiveInvoice).toHaveBeenCalledWith(1, 'Extended Isolir - customer isolated for more than 1 month');
    });

    it('should reject waive request from non-Accounting role', async () => {
      const adminReq = createAuthenticatedRequest(ROLES.ADMIN, { id: 1, branch_id: 1 });

      const res = await adminReq.post('/api/billing/invoices/1/waive').send({
        reason: 'Extended Isolir',
      });

      expect(res.status).toBe(403);
      expect(billingService.waiveInvoice).not.toHaveBeenCalled();
    });

    it('should record a down payment', async () => {
      const adminReq = createAuthenticatedRequest(ROLES.ADMIN, { id: 1, branch_id: 1 });

      downPaymentService.recordDP.mockResolvedValue({
        id: 1,
        customer_id: 1,
        amount: 500000,
        payment_date: '2024-01-10',
      });

      const res = await adminReq.post('/api/billing/dp').send({
        customer_id: 1,
        amount: 500000,
        payment_date: '2024-01-10',
      });

      expect(res.status).toBe(201);
      expect(res.body.status).toBe('success');
    });
  });

  // =========================================================================
  // 3. Tripay Callback Processing with Signature Verification
  // Requirements: 8.1-8.5
  // =========================================================================
  describe('Tripay Callback Processing', () => {
    it('should process valid Tripay callback and mark invoice as LUNAS', async () => {
      const callbackData = {
        merchant_ref: '1',
        reference: 'TRP-REF-001',
        status: 'PAID',
        total_amount: 111000,
      };

      paymentService.processTripayCallback.mockResolvedValue({
        message: 'Payment processed successfully.',
        payment_id: 1,
      });

      const unauthReq = createUnauthenticatedRequest();
      const res = await unauthReq
        .post('/api/payments/tripay/callback')
        .set('x-callback-signature', 'valid-signature-hash')
        .send(callbackData);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(paymentService.processTripayCallback).toHaveBeenCalledWith(
        callbackData,
        'valid-signature-hash'
      );
    });

    it('should reject Tripay callback with invalid signature', async () => {
      const callbackData = {
        merchant_ref: '1',
        reference: 'TRP-REF-002',
        status: 'PAID',
        total_amount: 111000,
      };

      paymentService.processTripayCallback.mockRejectedValue(
        Object.assign(new Error('Invalid callback signature.'), {
          statusCode: 403,
          code: 'AUTH_FORBIDDEN',
        })
      );

      const unauthReq = createUnauthenticatedRequest();
      const res = await unauthReq
        .post('/api/payments/tripay/callback')
        .set('x-callback-signature', 'invalid-signature')
        .send(callbackData);

      expect(res.status).toBe(403);
      expect(res.body.status).toBe('error');
    });

    it('should handle duplicate callback idempotently', async () => {
      const callbackData = {
        merchant_ref: '1',
        reference: 'TRP-REF-001',
        status: 'PAID',
        total_amount: 111000,
      };

      paymentService.processTripayCallback.mockResolvedValue({
        message: 'Invoice already paid.',
        idempotent: true,
      });

      const unauthReq = createUnauthenticatedRequest();
      const res = await unauthReq
        .post('/api/payments/tripay/callback')
        .set('x-callback-signature', 'valid-signature-hash')
        .send(callbackData);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.data).toHaveProperty('idempotent', true);
    });

    it('should handle expired payment callback', async () => {
      const callbackData = {
        merchant_ref: '1',
        reference: 'TRP-REF-003',
        status: 'EXPIRED',
        total_amount: 111000,
      };

      paymentService.processTripayCallback.mockResolvedValue({
        message: 'Payment expired.',
        status: 'Expired',
      });

      const unauthReq = createUnauthenticatedRequest();
      const res = await unauthReq
        .post('/api/payments/tripay/callback')
        .set('x-callback-signature', 'valid-signature-hash')
        .send(callbackData);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
    });

    it('should not require authentication for Tripay callback endpoint', async () => {
      paymentService.processTripayCallback.mockResolvedValue({
        message: 'Payment processed successfully.',
        payment_id: 2,
      });

      const unauthReq = createUnauthenticatedRequest();
      const res = await unauthReq
        .post('/api/payments/tripay/callback')
        .send({ merchant_ref: '2', reference: 'TRP-004', status: 'PAID', total_amount: 50000 });

      // Should NOT return 401 - callback is public
      expect(res.status).not.toBe(401);
      expect(res.status).toBe(200);
    });
  });

  // =========================================================================
  // 4. NAS Registration with Script Generation
  // Requirements: 12.1-12.4
  // =========================================================================
  describe('NAS Registration and Script Generation', () => {
    it('should register a new NAS device with VPN accounts (Superadmin)', async () => {
      const superadminReq = createAuthenticatedRequest(ROLES.SUPERADMIN, { id: 1, branch_id: null });

      nasService.register.mockResolvedValue({
        id: 1,
        name: 'NAS-Bandung-01',
        ip_address: '10.0.1.1',
        radius_secret: 'supersecret123',
        api_port: 8728,
        branch_id: 1,
        status: 'Active',
        vpn_accounts: [
          { type: 'pptp', username: 'nas-bandung-01-pptp', password: 'pass1' },
          { type: 'l2tp', username: 'nas-bandung-01-l2tp', password: 'pass2' },
          { type: 'sstp', username: 'nas-bandung-01-sstp', password: 'pass3' },
          { type: 'ovpn', username: 'nas-bandung-01-ovpn', password: 'pass4' },
        ],
      });

      const res = await superadminReq.post('/api/nas').send({
        name: 'NAS-Bandung-01',
        ip_address: '10.0.1.1',
        radius_secret: 'supersecret123',
        api_port: 8728,
        branch_id: 1,
      });

      expect(res.status).toBe(201);
      expect(res.body.status).toBe('success');
      expect(nasService.register).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'NAS-Bandung-01',
          ip_address: '10.0.1.1',
          radius_secret: 'supersecret123',
        })
      );
    });

    it('should generate and return NAS configuration script', async () => {
      const superadminReq = createAuthenticatedRequest(ROLES.SUPERADMIN, { id: 1, branch_id: null });

      const mockScript = [
        '/interface pptp-client add name=vpn-pptp connect-to=vpn.uwais.id user=nas-01-pptp password=pass1',
        '/radius add address=10.0.0.1 secret=supersecret123 service=ppp',
        '/ip firewall address-list add list=isolir',
      ].join('\n');

      nasService.generateScript.mockResolvedValue(mockScript);

      const res = await superadminReq.get('/api/nas/1/script');

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.data).toHaveProperty('script');
      expect(res.body.data.script).toContain('pptp');
      expect(res.body.data.script).toContain('radius');
      expect(nasService.generateScript).toHaveBeenCalledWith(1);
    });

    it('should test NAS connectivity and report result', async () => {
      const superadminReq = createAuthenticatedRequest(ROLES.SUPERADMIN, { id: 1, branch_id: null });

      nasService.testConnectivity.mockResolvedValue({
        nas_id: 1,
        api_reachable: true,
        radius_reachable: true,
        vpn_connected: true,
        status: 'Active',
      });

      const res = await superadminReq.post('/api/nas/1/test');

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.data).toHaveProperty('api_reachable', true);
      expect(nasService.testConnectivity).toHaveBeenCalledWith(1);
    });

    it('should reject NAS registration from non-Superadmin (Admin)', async () => {
      const adminReq = createAuthenticatedRequest(ROLES.ADMIN, { id: 2, branch_id: 1 });

      const res = await adminReq.post('/api/nas').send({
        name: 'NAS-Unauthorized',
        ip_address: '10.0.2.1',
        radius_secret: 'secret123',
        api_port: 8728,
        branch_id: 1,
      });

      expect(res.status).toBe(403);
      expect(nasService.register).not.toHaveBeenCalled();
    });

    it('should reject NAS registration with invalid IP address', async () => {
      const superadminReq = createAuthenticatedRequest(ROLES.SUPERADMIN, { id: 1, branch_id: null });

      const res = await superadminReq.post('/api/nas').send({
        name: 'NAS-Invalid',
        ip_address: 'not-an-ip-address',
        radius_secret: 'secret123',
        api_port: 8728,
        branch_id: 1,
      });

      expect(res.status).toBe(400);
      expect(res.body.status).toBe('error');
      expect(nasService.register).not.toHaveBeenCalled();
    });

    it('should reject NAS registration with missing required fields', async () => {
      const superadminReq = createAuthenticatedRequest(ROLES.SUPERADMIN, { id: 1, branch_id: null });

      const res = await superadminReq.post('/api/nas').send({
        name: 'NAS-Incomplete',
        // missing ip_address, radius_secret, branch_id
      });

      expect(res.status).toBe(400);
      expect(res.body.status).toBe('error');
    });
  });

  // =========================================================================
  // 5. Asset Lifecycle (inbound -> outbound -> install -> return)
  // Requirements: 18.1-19.5
  // =========================================================================
  describe('Asset Lifecycle Flow', () => {
    it('should record asset inbound with serial numbers (Admin)', async () => {
      const adminReq = createAuthenticatedRequest(ROLES.ADMIN, { id: 1, branch_id: 1 });

      assetService.recordInbound.mockResolvedValue({
        inbound_id: 1,
        items_recorded: 2,
        items: [
          { id: 1, product_name: 'ONU ZTE F660', serial_number: 'ZTEG12345678', status: 'Tersedia' },
          { id: 2, product_name: 'Kabel FO Drop 1 Core', serial_number: 'UBG-20240115-000001', status: 'Tersedia' },
        ],
      });

      const res = await adminReq.post('/api/assets/inbound').send({
        invoice_number: 'PO-2024-001',
        purchase_date: '2024-01-15',
        supplier_name: 'PT Fiber Optik Indonesia',
        branch_id: 1,
        items: [
          {
            product_name: 'ONU ZTE F660',
            brand_model: 'ZTE F660',
            category: 'PerangkatAktif',
            serial_number: 'ZTEG12345678',
            mac_address: 'AA:BB:CC:DD:EE:01',
          },
          {
            product_name: 'Kabel FO Drop 1 Core',
            brand_model: 'Furukawa',
            category: 'Kabel',
            quantity: 500,
          },
        ],
      });

      expect(res.status).toBe(201);
      expect(res.body.status).toBe('success');
      expect(assetService.recordInbound).toHaveBeenCalled();
    });

    it('should approve asset outbound for technician (Admin)', async () => {
      const adminReq = createAuthenticatedRequest(ROLES.ADMIN, { id: 1, branch_id: 1 });

      assetService.approveOutbound.mockResolvedValue({
        success: true,
        items_dispatched: 1,
        teknisi_id: 5,
      });

      const res = await adminReq.post('/api/assets/outbound').send({
        branch_id: 1,
        teknisi_id: 5,
        items: [
          { category: 'Kabel', quantity: 100, asset_id: 1 },
        ],
      });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(assetService.approveOutbound).toHaveBeenCalled();
    });

    it('should allow Teknisi to return unused assets', async () => {
      const teknisiReq = createAuthenticatedRequest(ROLES.TEKNISI, { id: 5, branch_id: 1 });

      assetService.processReturn.mockResolvedValue({
        success: true,
        items_returned: 1,
      });

      const res = await teknisiReq.post('/api/assets/return').send({
        branch_id: 1,
        items: [
          { asset_id: 1, condition: 'Tersedia', remaining_quantity: 50 },
        ],
      });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(assetService.processReturn).toHaveBeenCalled();
    });

    it('should initiate inter-branch asset transfer (Admin)', async () => {
      const adminReq = createAuthenticatedRequest(ROLES.ADMIN, { id: 1, branch_id: 1 });

      assetService.initiateTransfer.mockResolvedValue({
        transfer_id: 1,
        source_branch_id: 1,
        destination_branch_id: 2,
        status: 'InTransit',
        items: [{ asset_id: 1, serial_number: 'ZTEG12345678' }],
      });

      const res = await adminReq.post('/api/assets/transfer').send({
        source_branch_id: 1,
        destination_branch_id: 2,
        items: [
          { asset_id: 1, serial_number: 'ZTEG12345678' },
        ],
      });

      expect(res.status).toBe(201);
      expect(res.body.status).toBe('success');
      expect(assetService.initiateTransfer).toHaveBeenCalled();
    });

    it('should confirm transfer receipt at destination branch', async () => {
      const adminReq = createAuthenticatedRequest(ROLES.ADMIN, { id: 3, branch_id: 2 });

      assetService.confirmReceipt.mockResolvedValue({
        transfer_id: 1,
        status: 'Received',
        confirmed_by: 3,
      });

      const res = await adminReq.post('/api/assets/transfer/1/confirm');

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(assetService.confirmReceipt).toHaveBeenCalledWith(1, 3);
    });

    it('should reject asset outbound from unauthorized role (Sales)', async () => {
      const salesReq = createAuthenticatedRequest(ROLES.SALES, { id: 4, branch_id: 1 });

      const res = await salesReq.post('/api/assets/outbound').send({
        branch_id: 1,
        teknisi_id: 5,
        items: [{ category: 'PerangkatAktif', quantity: 1 }],
      });

      expect(res.status).toBe(403);
      expect(assetService.approveOutbound).not.toHaveBeenCalled();
    });

    it('should reject inbound with missing required fields', async () => {
      const adminReq = createAuthenticatedRequest(ROLES.ADMIN, { id: 1, branch_id: 1 });

      const res = await adminReq.post('/api/assets/inbound').send({
        // Missing required fields: invoice_number, purchase_date, supplier_name, branch_id, items
      });

      expect(res.status).toBe(400);
      expect(res.body.status).toBe('error');
      expect(assetService.recordInbound).not.toHaveBeenCalled();
    });
  });
});
