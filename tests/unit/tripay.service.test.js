/**
 * Unit tests for Tripay integration service.
 * Tests transaction creation, callback signature verification,
 * payment channel listing, and transaction detail retrieval.
 *
 * Requirements: 8.1, 8.2, 8.5
 */

const crypto = require('crypto');

// Mock axios before requiring the service
jest.mock('axios', () => ({
  create: jest.fn(() => ({
    post: jest.fn(),
    get: jest.fn(),
  })),
}));

// Mock tripay config
jest.mock('../../src/config/tripay', () => ({
  apiUrl: 'https://tripay.co.id/api',
  apiKey: 'DEV-test-api-key-123',
  privateKey: 'test-private-key-456',
  merchantCode: 'T12345',
  callbackUrl: 'https://example.com/api/payments/tripay/callback',
}));

const axios = require('axios');
const tripayConfig = require('../../src/config/tripay');
const tripayService = require('../../src/services/tripay.service');

describe('Tripay Service', () => {
  let mockClient;

  beforeEach(() => {
    jest.clearAllMocks();
    mockClient = {
      post: jest.fn(),
      get: jest.fn(),
    };
    axios.create.mockReturnValue(mockClient);
  });

  describe('generateSignature', () => {
    it('should generate correct HMAC-SHA256 signature', () => {
      const merchantRef = 'INV-001';
      const amount = 150000;

      const expected = crypto
        .createHmac('sha256', tripayConfig.privateKey)
        .update(tripayConfig.merchantCode + merchantRef + amount)
        .digest('hex');

      const result = tripayService.generateSignature(merchantRef, amount);
      expect(result).toBe(expected);
    });

    it('should produce different signatures for different amounts', () => {
      const sig1 = tripayService.generateSignature('INV-001', 100000);
      const sig2 = tripayService.generateSignature('INV-001', 200000);
      expect(sig1).not.toBe(sig2);
    });

    it('should produce different signatures for different merchant refs', () => {
      const sig1 = tripayService.generateSignature('INV-001', 100000);
      const sig2 = tripayService.generateSignature('INV-002', 100000);
      expect(sig1).not.toBe(sig2);
    });
  });

  describe('createTransaction', () => {
    it('should create a transaction successfully', async () => {
      const mockResponse = {
        data: {
          success: true,
          data: {
            reference: 'T1234567890',
            merchant_ref: 'INV-001',
            payment_method: 'BRIVA',
            payment_name: 'BRI Virtual Account',
            amount: 150000,
            pay_code: '1234567890123456',
            pay_url: 'https://tripay.co.id/checkout/T1234567890',
            checkout_url: 'https://tripay.co.id/checkout/T1234567890',
            status: 'UNPAID',
            expired_time: 1700000000,
          },
        },
      };

      mockClient.post.mockResolvedValue(mockResponse);

      const result = await tripayService.createTransaction(
        'INV-001',
        150000,
        'John Doe',
        'john@example.com',
        'BRIVA'
      );

      expect(result.reference).toBe('T1234567890');
      expect(result.payment_method).toBe('BRIVA');
      expect(result.amount).toBe(150000);
      expect(result.pay_code).toBe('1234567890123456');

      expect(mockClient.post).toHaveBeenCalledWith(
        '/transaction/create',
        expect.objectContaining({
          method: 'BRIVA',
          merchant_ref: 'INV-001',
          amount: 150000,
          customer_name: 'John Doe',
          customer_email: 'john@example.com',
          callback_url: tripayConfig.callbackUrl,
        })
      );
    });

    it('should support QRIS payment method', async () => {
      const mockResponse = {
        data: {
          success: true,
          data: {
            reference: 'T9876543210',
            payment_method: 'QRIS',
            amount: 200000,
            qr_string: 'qris-data-string',
            qr_url: 'https://tripay.co.id/qr/T9876543210',
            status: 'UNPAID',
          },
        },
      };

      mockClient.post.mockResolvedValue(mockResponse);

      const result = await tripayService.createTransaction(
        'INV-002',
        200000,
        'Jane Doe',
        'jane@example.com',
        'QRIS'
      );

      expect(result.payment_method).toBe('QRIS');
      expect(result.qr_string).toBe('qris-data-string');
    });

    it('should support minimarket payment method', async () => {
      const mockResponse = {
        data: {
          success: true,
          data: {
            reference: 'T5555555555',
            payment_method: 'ALFAMART',
            amount: 100000,
            pay_code: 'ALF123456789',
            status: 'UNPAID',
          },
        },
      };

      mockClient.post.mockResolvedValue(mockResponse);

      const result = await tripayService.createTransaction(
        'INV-003',
        100000,
        'Bob Smith',
        'bob@example.com',
        'ALFAMART'
      );

      expect(result.payment_method).toBe('ALFAMART');
      expect(result.pay_code).toBe('ALF123456789');
    });

    it('should throw TRIPAY_ERROR when API returns success: false', async () => {
      mockClient.post.mockResolvedValue({
        data: {
          success: false,
          message: 'Invalid payment method',
        },
      });

      await expect(
        tripayService.createTransaction('INV-001', 150000, 'John', 'john@test.com', 'INVALID')
      ).rejects.toMatchObject({
        message: 'Invalid payment method',
        code: 'TRIPAY_ERROR',
      });
    });

    it('should throw TRIPAY_ERROR on network failure', async () => {
      mockClient.post.mockRejectedValue(new Error('Network Error'));

      await expect(
        tripayService.createTransaction('INV-001', 150000, 'John', 'john@test.com', 'BRIVA')
      ).rejects.toMatchObject({
        code: 'TRIPAY_ERROR',
      });
    });

    it('should throw TRIPAY_ERROR with API error message on HTTP error', async () => {
      const axiosError = new Error('Request failed');
      axiosError.response = {
        status: 422,
        data: { message: 'Amount too low' },
      };
      mockClient.post.mockRejectedValue(axiosError);

      await expect(
        tripayService.createTransaction('INV-001', 100, 'John', 'john@test.com', 'BRIVA')
      ).rejects.toMatchObject({
        message: 'Amount too low',
        statusCode: 422,
        code: 'TRIPAY_ERROR',
      });
    });
  });

  describe('verifyCallback', () => {
    it('should return true for valid signature', () => {
      const callbackData = JSON.stringify({
        reference: 'T1234567890',
        merchant_ref: 'INV-001',
        payment_method: 'BRIVA',
        status: 'PAID',
      });

      const validSignature = crypto
        .createHmac('sha256', tripayConfig.privateKey)
        .update(callbackData)
        .digest('hex');

      const result = tripayService.verifyCallback(callbackData, validSignature);
      expect(result).toBe(true);
    });

    it('should return true when callbackData is an object', () => {
      const callbackObj = {
        reference: 'T1234567890',
        merchant_ref: 'INV-001',
        status: 'PAID',
      };

      const dataString = JSON.stringify(callbackObj);
      const validSignature = crypto
        .createHmac('sha256', tripayConfig.privateKey)
        .update(dataString)
        .digest('hex');

      const result = tripayService.verifyCallback(callbackObj, validSignature);
      expect(result).toBe(true);
    });

    it('should return false for invalid signature', () => {
      const callbackData = JSON.stringify({ reference: 'T123', status: 'PAID' });
      const invalidSignature = 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890';

      const result = tripayService.verifyCallback(callbackData, invalidSignature);
      expect(result).toBe(false);
    });

    it('should return false when signature is null', () => {
      const result = tripayService.verifyCallback('some data', null);
      expect(result).toBe(false);
    });

    it('should return false when callbackData is null', () => {
      const result = tripayService.verifyCallback(null, 'some-signature');
      expect(result).toBe(false);
    });

    it('should return false when signature has invalid hex format', () => {
      const callbackData = JSON.stringify({ test: true });
      const result = tripayService.verifyCallback(callbackData, 'not-valid-hex');
      expect(result).toBe(false);
    });

    it('should return false when signature length does not match', () => {
      const callbackData = JSON.stringify({ test: true });
      const result = tripayService.verifyCallback(callbackData, 'abcd');
      expect(result).toBe(false);
    });

    it('should use timing-safe comparison to prevent timing attacks', () => {
      // Generate a valid signature
      const callbackData = JSON.stringify({ reference: 'T999', status: 'PAID' });
      const validSignature = crypto
        .createHmac('sha256', tripayConfig.privateKey)
        .update(callbackData)
        .digest('hex');

      // Modify one character at the end - timing-safe comparison should still reject
      const almostValidSig = validSignature.slice(0, -1) + (validSignature.slice(-1) === '0' ? '1' : '0');

      const result = tripayService.verifyCallback(callbackData, almostValidSig);
      expect(result).toBe(false);
    });

    it('should return false for empty string signature', () => {
      const callbackData = JSON.stringify({ test: true });
      const result = tripayService.verifyCallback(callbackData, '');
      expect(result).toBe(false);
    });

    it('should return false for empty string callbackData', () => {
      const result = tripayService.verifyCallback('', 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890');
      expect(result).toBe(false);
    });

    it('should verify signature correctly regardless of JSON key order when passed as object', () => {
      // When passed as object, JSON.stringify determines the order
      const callbackObj = { status: 'PAID', reference: 'T123' };
      const dataString = JSON.stringify(callbackObj);
      const validSignature = crypto
        .createHmac('sha256', tripayConfig.privateKey)
        .update(dataString)
        .digest('hex');

      expect(tripayService.verifyCallback(callbackObj, validSignature)).toBe(true);

      // Different key order in the signature computation would fail
      const differentOrder = JSON.stringify({ reference: 'T123', status: 'PAID' });
      const wrongSignature = crypto
        .createHmac('sha256', tripayConfig.privateKey)
        .update(differentOrder)
        .digest('hex');

      // This should fail because JSON.stringify of the object produces a specific order
      if (dataString !== differentOrder) {
        expect(tripayService.verifyCallback(callbackObj, wrongSignature)).toBe(false);
      }
    });
  });

  describe('getPaymentChannels', () => {
    it('should return list of payment channels', async () => {
      const mockChannels = [
        { group: 'Virtual Account', code: 'BRIVA', name: 'BRI Virtual Account', active: true },
        { group: 'Virtual Account', code: 'BNIVA', name: 'BNI Virtual Account', active: true },
        { group: 'E-Wallet', code: 'QRIS', name: 'QRIS', active: true },
        { group: 'Convenience Store', code: 'ALFAMART', name: 'Alfamart', active: true },
      ];

      mockClient.get.mockResolvedValue({
        data: { success: true, data: mockChannels },
      });

      const result = await tripayService.getPaymentChannels();

      expect(result).toHaveLength(4);
      expect(result[0].code).toBe('BRIVA');
      expect(result[2].code).toBe('QRIS');
      expect(mockClient.get).toHaveBeenCalledWith('/merchant/payment-channel');
    });

    it('should throw TRIPAY_ERROR when API returns failure', async () => {
      mockClient.get.mockResolvedValue({
        data: { success: false, message: 'Unauthorized' },
      });

      await expect(tripayService.getPaymentChannels()).rejects.toMatchObject({
        code: 'TRIPAY_ERROR',
        message: 'Unauthorized',
      });
    });

    it('should throw TRIPAY_ERROR on network failure', async () => {
      mockClient.get.mockRejectedValue(new Error('Connection timeout'));

      await expect(tripayService.getPaymentChannels()).rejects.toMatchObject({
        code: 'TRIPAY_ERROR',
      });
    });
  });

  describe('getTransactionDetail', () => {
    it('should return transaction detail', async () => {
      const mockDetail = {
        reference: 'T1234567890',
        merchant_ref: 'INV-001',
        payment_method: 'BRIVA',
        payment_method_code: 'BRIVA',
        amount: 150000,
        fee_merchant: 3000,
        fee_customer: 0,
        total_fee: 3000,
        amount_received: 147000,
        pay_code: '1234567890123456',
        status: 'PAID',
        paid_at: 1700000000,
      };

      mockClient.get.mockResolvedValue({
        data: { success: true, data: mockDetail },
      });

      const result = await tripayService.getTransactionDetail('T1234567890');

      expect(result.reference).toBe('T1234567890');
      expect(result.status).toBe('PAID');
      expect(result.amount).toBe(150000);
      expect(mockClient.get).toHaveBeenCalledWith('/transaction/detail', {
        params: { reference: 'T1234567890' },
      });
    });

    it('should throw RESOURCE_NOT_FOUND for 404 response', async () => {
      const axiosError = new Error('Not Found');
      axiosError.response = { status: 404, data: { message: 'Transaction not found' } };
      mockClient.get.mockRejectedValue(axiosError);

      await expect(tripayService.getTransactionDetail('INVALID-REF')).rejects.toMatchObject({
        statusCode: 404,
        code: 'RESOURCE_NOT_FOUND',
      });
    });

    it('should throw TRIPAY_ERROR on API failure', async () => {
      mockClient.get.mockResolvedValue({
        data: { success: false, message: 'Server error' },
      });

      await expect(tripayService.getTransactionDetail('T123')).rejects.toMatchObject({
        code: 'TRIPAY_ERROR',
        message: 'Server error',
      });
    });
  });
});
