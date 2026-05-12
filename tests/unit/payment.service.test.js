/**
 * Unit tests for payment service.
 * Tests payment processing, Tripay callback handling, and unisolir triggering.
 *
 * Requirements: 8.3, 8.4
 */

// Mock dependencies before requiring the service
jest.mock('../../src/config/database', () => ({
  appPool: {
    execute: jest.fn().mockResolvedValue([[], []]),
    query: jest.fn().mockResolvedValue([[], []]),
  },
}));

jest.mock('../../src/models/payment.model');
jest.mock('../../src/models/invoice.model');
jest.mock('../../src/models/customer.model');
jest.mock('../../src/models/subscription.model');
jest.mock('../../src/services/tripay.service');

const paymentModel = require('../../src/models/payment.model');
const invoiceModel = require('../../src/models/invoice.model');
const customerModel = require('../../src/models/customer.model');
const subscriptionModel = require('../../src/models/subscription.model');
const tripayService = require('../../src/services/tripay.service');
const paymentService = require('../../src/services/payment.service');

describe('Payment Service', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  const mockInvoice = {
    id: 1,
    invoice_number: 'INV-202401-00001',
    customer_id: 10,
    subscription_id: 5,
    total_amount: 166500,
    status: 'UNPAID',
  };

  const mockCustomerAktif = {
    id: 10,
    full_name: 'John Doe',
    lifecycle_status: 'Aktif',
    branch_id: 1,
  };

  const mockCustomerIsolir = {
    id: 10,
    full_name: 'John Doe',
    lifecycle_status: 'Isolir',
    branch_id: 1,
  };

  const mockSubscription = {
    id: 5,
    customer_id: 10,
    nas_id: 2,
    pppoe_username: 'uwais-abc123',
    status: 'Active',
  };

  describe('processPayment', () => {
    it('should process a payment and update invoice to LUNAS', async () => {
      invoiceModel.findById.mockResolvedValue(mockInvoice);
      paymentModel.create.mockImplementation((data) => Promise.resolve({ id: 1, ...data }));
      invoiceModel.update.mockResolvedValue({ affectedRows: 1 });
      customerModel.findById.mockResolvedValue(mockCustomerAktif);

      const result = await paymentService.processPayment(1, {
        amount: 166500,
        method: 'Cash',
        processed_by: 3,
      });

      expect(result.id).toBe(1);
      expect(result.status).toBe('Success');
      expect(result.method).toBe('Cash');
      expect(invoiceModel.update).toHaveBeenCalledWith(1, expect.objectContaining({
        status: 'LUNAS',
        payment_method: 'Cash',
      }));
    });

    it('should trigger unisolir when customer is in Isolir status', async () => {
      invoiceModel.findById.mockResolvedValue(mockInvoice);
      paymentModel.create.mockImplementation((data) => Promise.resolve({ id: 2, ...data }));
      invoiceModel.update.mockResolvedValue({ affectedRows: 1 });
      customerModel.findById.mockResolvedValue(mockCustomerIsolir);
      subscriptionModel.findById.mockResolvedValue(mockSubscription);
      customerModel.updateStatus.mockResolvedValue({ success: true });

      await paymentService.processPayment(1, {
        amount: 166500,
        method: 'VA',
        tripay_reference: 'TRP-123',
      });

      // Should update customer status from Isolir to Aktif
      expect(customerModel.updateStatus).toHaveBeenCalledWith(10, 'Aktif', 0);
    });

    it('should NOT trigger unisolir when customer is Aktif', async () => {
      invoiceModel.findById.mockResolvedValue(mockInvoice);
      paymentModel.create.mockImplementation((data) => Promise.resolve({ id: 3, ...data }));
      invoiceModel.update.mockResolvedValue({ affectedRows: 1 });
      customerModel.findById.mockResolvedValue(mockCustomerAktif);

      await paymentService.processPayment(1, {
        amount: 166500,
        method: 'Cash',
      });

      expect(customerModel.updateStatus).not.toHaveBeenCalled();
    });

    it('should throw 404 when invoice not found', async () => {
      invoiceModel.findById.mockResolvedValue(null);

      await expect(
        paymentService.processPayment(999, { amount: 100000, method: 'Cash' })
      ).rejects.toMatchObject({
        message: 'Invoice not found.',
        statusCode: 404,
      });
    });

    it('should throw 400 when invoice is already LUNAS', async () => {
      invoiceModel.findById.mockResolvedValue({ ...mockInvoice, status: 'LUNAS' });

      await expect(
        paymentService.processPayment(1, { amount: 166500, method: 'Cash' })
      ).rejects.toMatchObject({
        statusCode: 400,
        code: 'INVALID_STATUS_TRANSITION',
      });
    });

    it('should throw 400 when invoice is WAIVED', async () => {
      invoiceModel.findById.mockResolvedValue({ ...mockInvoice, status: 'WAIVED' });

      await expect(
        paymentService.processPayment(1, { amount: 166500, method: 'Cash' })
      ).rejects.toMatchObject({
        statusCode: 400,
        code: 'INVALID_STATUS_TRANSITION',
      });
    });

    it('should set admin_fee when provided (Merchant payment)', async () => {
      invoiceModel.findById.mockResolvedValue(mockInvoice);
      paymentModel.create.mockImplementation((data) => Promise.resolve({ id: 4, ...data }));
      invoiceModel.update.mockResolvedValue({ affectedRows: 1 });
      customerModel.findById.mockResolvedValue(mockCustomerAktif);

      const result = await paymentService.processPayment(1, {
        amount: 166500,
        method: 'Merchant',
        processed_by: 7,
        admin_fee: 5000,
      });

      expect(result.admin_fee).toBe(5000);
      expect(result.processed_by).toBe(7);
    });
  });

  describe('processTripayCallback', () => {
    const mockCallbackPaid = {
      merchant_ref: '1',
      reference: 'TRP-REF-001',
      status: 'PAID',
      total_amount: 166500,
    };

    it('should reject callback with invalid signature', async () => {
      tripayService.verifyCallback.mockReturnValue(false);

      await expect(
        paymentService.processTripayCallback(mockCallbackPaid, 'invalid-sig')
      ).rejects.toMatchObject({
        message: 'Invalid callback signature.',
        statusCode: 403,
      });
    });

    it('should process PAID callback and update invoice to LUNAS', async () => {
      tripayService.verifyCallback.mockReturnValue(true);
      paymentModel.findByTripayReference.mockResolvedValue(null);
      invoiceModel.findById.mockResolvedValue(mockInvoice);
      paymentModel.create.mockImplementation((data) => Promise.resolve({ id: 5, ...data }));
      invoiceModel.update.mockResolvedValue({ affectedRows: 1 });
      customerModel.findById.mockResolvedValue(mockCustomerAktif);

      const result = await paymentService.processTripayCallback(mockCallbackPaid, 'valid-sig');

      expect(result.message).toBe('Payment processed successfully.');
      expect(invoiceModel.update).toHaveBeenCalledWith(1, expect.objectContaining({
        status: 'LUNAS',
      }));
    });

    it('should handle idempotent callback (invoice already LUNAS)', async () => {
      tripayService.verifyCallback.mockReturnValue(true);
      paymentModel.findByTripayReference.mockResolvedValue(null);
      invoiceModel.findById.mockResolvedValue({ ...mockInvoice, status: 'LUNAS' });

      const result = await paymentService.processTripayCallback(mockCallbackPaid, 'valid-sig');

      expect(result.idempotent).toBe(true);
      expect(result.message).toBe('Invoice already paid.');
    });

    it('should handle idempotent callback (payment already Success)', async () => {
      tripayService.verifyCallback.mockReturnValue(true);
      paymentModel.findByTripayReference.mockResolvedValue({
        id: 5,
        status: 'Success',
        invoice_id: 1,
      });

      const result = await paymentService.processTripayCallback(mockCallbackPaid, 'valid-sig');

      expect(result.idempotent).toBe(true);
      expect(result.message).toBe('Payment already processed.');
    });

    it('should update existing Pending payment on PAID callback', async () => {
      tripayService.verifyCallback.mockReturnValue(true);
      paymentModel.findByTripayReference.mockResolvedValue({
        id: 5,
        status: 'Pending',
        invoice_id: 1,
        method: 'VA',
      });
      invoiceModel.findById.mockResolvedValue(mockInvoice);
      paymentModel.updateStatus.mockResolvedValue({ affectedRows: 1 });
      invoiceModel.update.mockResolvedValue({ affectedRows: 1 });
      customerModel.findById.mockResolvedValue(mockCustomerAktif);

      const result = await paymentService.processTripayCallback(mockCallbackPaid, 'valid-sig');

      expect(result.message).toBe('Payment processed successfully.');
      expect(paymentModel.updateStatus).toHaveBeenCalledWith(5, 'Success', expect.objectContaining({ paid_at: expect.any(String) }));
    });

    it('should handle EXPIRED callback', async () => {
      tripayService.verifyCallback.mockReturnValue(true);
      paymentModel.findByTripayReference.mockResolvedValue({
        id: 6,
        status: 'Pending',
        invoice_id: 1,
      });

      const callbackExpired = { ...mockCallbackPaid, status: 'EXPIRED' };
      const result = await paymentService.processTripayCallback(callbackExpired, 'valid-sig');

      expect(result.status).toBe('Expired');
      expect(paymentModel.updateStatus).toHaveBeenCalledWith(6, 'Expired');
    });

    it('should handle FAILED callback', async () => {
      tripayService.verifyCallback.mockReturnValue(true);
      paymentModel.findByTripayReference.mockResolvedValue({
        id: 7,
        status: 'Pending',
        invoice_id: 1,
      });

      const callbackFailed = { ...mockCallbackPaid, status: 'FAILED' };
      const result = await paymentService.processTripayCallback(callbackFailed, 'valid-sig');

      expect(result.status).toBe('Failed');
      expect(paymentModel.updateStatus).toHaveBeenCalledWith(7, 'Failed');
    });

    it('should trigger unisolir on PAID callback when customer is Isolir', async () => {
      tripayService.verifyCallback.mockReturnValue(true);
      paymentModel.findByTripayReference.mockResolvedValue(null);
      invoiceModel.findById.mockResolvedValue(mockInvoice);
      paymentModel.create.mockImplementation((data) => Promise.resolve({ id: 8, ...data }));
      invoiceModel.update.mockResolvedValue({ affectedRows: 1 });
      customerModel.findById.mockResolvedValue(mockCustomerIsolir);
      subscriptionModel.findById.mockResolvedValue(mockSubscription);
      customerModel.updateStatus.mockResolvedValue({ success: true });

      await paymentService.processTripayCallback(mockCallbackPaid, 'valid-sig');

      expect(customerModel.updateStatus).toHaveBeenCalledWith(10, 'Aktif', 0);
    });

    it('should throw 404 when invoice not found for callback', async () => {
      tripayService.verifyCallback.mockReturnValue(true);
      paymentModel.findByTripayReference.mockResolvedValue(null);
      invoiceModel.findById.mockResolvedValue(null);

      await expect(
        paymentService.processTripayCallback(mockCallbackPaid, 'valid-sig')
      ).rejects.toMatchObject({
        statusCode: 404,
      });
    });
  });

  describe('processTripayCallback - idempotency and race conditions', () => {
    const mockCallbackPaid = {
      merchant_ref: '1',
      reference: 'TRP-REF-001',
      status: 'PAID',
      total_amount: 166500,
    };

    it('should handle duplicate PAID callbacks for same reference gracefully', async () => {
      tripayService.verifyCallback.mockReturnValue(true);

      // First call: payment already exists with Success status (duplicate callback)
      paymentModel.findByTripayReference.mockResolvedValue({
        id: 10,
        status: 'Success',
        invoice_id: 1,
        tripay_reference: 'TRP-REF-001',
      });

      const result = await paymentService.processTripayCallback(mockCallbackPaid, 'valid-sig');

      // Should return idempotent response without re-processing
      expect(result.idempotent).toBe(true);
      expect(result.message).toBe('Payment already processed.');
      // Should NOT create a new payment or update invoice
      expect(paymentModel.create).not.toHaveBeenCalled();
      expect(invoiceModel.update).not.toHaveBeenCalled();
    });

    it('should not double-process when invoice is already LUNAS from a previous callback', async () => {
      tripayService.verifyCallback.mockReturnValue(true);
      paymentModel.findByTripayReference.mockResolvedValue(null);
      // Invoice already marked LUNAS by a previous callback
      invoiceModel.findById.mockResolvedValue({ ...mockInvoice, status: 'LUNAS' });

      const result = await paymentService.processTripayCallback(mockCallbackPaid, 'valid-sig');

      expect(result.idempotent).toBe(true);
      expect(result.message).toBe('Invoice already paid.');
      expect(paymentModel.create).not.toHaveBeenCalled();
      expect(invoiceModel.update).not.toHaveBeenCalled();
    });

    it('should reject callback with tampered data (invalid signature)', async () => {
      tripayService.verifyCallback.mockReturnValue(false);

      await expect(
        paymentService.processTripayCallback(
          { ...mockCallbackPaid, total_amount: 999999 },
          'tampered-sig'
        )
      ).rejects.toMatchObject({
        statusCode: 403,
        message: 'Invalid callback signature.',
      });

      // Should not process anything
      expect(paymentModel.findByTripayReference).not.toHaveBeenCalled();
      expect(invoiceModel.findById).not.toHaveBeenCalled();
    });

    it('should handle concurrent PAID and EXPIRED callbacks for same reference', async () => {
      tripayService.verifyCallback.mockReturnValue(true);

      // Simulate: PAID callback already processed, now EXPIRED arrives
      paymentModel.findByTripayReference.mockResolvedValue({
        id: 10,
        status: 'Success',
        invoice_id: 1,
      });

      const callbackExpired = { ...mockCallbackPaid, status: 'EXPIRED' };
      const result = await paymentService.processTripayCallback(callbackExpired, 'valid-sig');

      // Should recognize payment is already successful and not downgrade
      expect(result.idempotent).toBe(true);
      expect(result.message).toBe('Payment already processed.');
      expect(paymentModel.updateStatus).not.toHaveBeenCalled();
    });
  });

  describe('getPaymentsByInvoice', () => {
    it('should return payments for a valid invoice', async () => {
      invoiceModel.findById.mockResolvedValue(mockInvoice);
      paymentModel.findByInvoiceId.mockResolvedValue([
        { id: 1, invoice_id: 1, amount: 166500, status: 'Success' },
      ]);

      const result = await paymentService.getPaymentsByInvoice(1);

      expect(result).toHaveLength(1);
      expect(result[0].amount).toBe(166500);
    });

    it('should throw 404 when invoice not found', async () => {
      invoiceModel.findById.mockResolvedValue(null);

      await expect(
        paymentService.getPaymentsByInvoice(999)
      ).rejects.toMatchObject({
        message: 'Invoice not found.',
        statusCode: 404,
      });
    });

    it('should return empty array when no payments exist', async () => {
      invoiceModel.findById.mockResolvedValue(mockInvoice);
      paymentModel.findByInvoiceId.mockResolvedValue([]);

      const result = await paymentService.getPaymentsByInvoice(1);

      expect(result).toHaveLength(0);
    });
  });
});
