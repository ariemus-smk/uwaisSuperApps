const {
  generatePPPoECredentials,
  generatePassword,
  generateUsername,
  generateRandomString,
  createRadcheckUniquenessChecker,
} = require('../../src/utils/pppoeGenerator');

describe('PPPoE Credential Generator', () => {
  describe('generateRandomString', () => {
    it('should generate a string of the specified length', () => {
      const result = generateRandomString(6);
      expect(result).toHaveLength(6);
    });

    it('should only contain lowercase alphanumeric characters', () => {
      const result = generateRandomString(100);
      expect(result).toMatch(/^[a-z0-9]+$/);
    });

    it('should generate different strings on successive calls', () => {
      const results = new Set();
      for (let i = 0; i < 20; i++) {
        results.add(generateRandomString(8));
      }
      // With 8 chars from 36 possible, collisions are extremely unlikely
      expect(results.size).toBeGreaterThan(15);
    });
  });

  describe('generatePassword', () => {
    it('should generate a password of the specified length', () => {
      const result = generatePassword(16);
      expect(result).toHaveLength(16);
    });

    it('should default to 12 characters', () => {
      const result = generatePassword();
      expect(result).toHaveLength(12);
    });

    it('should enforce minimum length of 8', () => {
      const result = generatePassword(4);
      expect(result).toHaveLength(8);
    });

    it('should only contain alphanumeric characters', () => {
      const result = generatePassword(50);
      expect(result).toMatch(/^[A-Za-z0-9]+$/);
    });

    it('should generate different passwords on successive calls', () => {
      const results = new Set();
      for (let i = 0; i < 20; i++) {
        results.add(generatePassword(12));
      }
      expect(results.size).toBeGreaterThan(15);
    });
  });

  describe('generateUsername', () => {
    it('should generate a username with default prefix', () => {
      const result = generateUsername();
      expect(result).toMatch(/^uwais-[a-z0-9]{6}$/);
    });

    it('should generate a username with custom prefix', () => {
      const result = generateUsername('pppoe-');
      expect(result).toMatch(/^pppoe-[a-z0-9]{6}$/);
    });

    it('should generate different usernames on successive calls', () => {
      const results = new Set();
      for (let i = 0; i < 20; i++) {
        results.add(generateUsername());
      }
      expect(results.size).toBeGreaterThan(15);
    });
  });

  describe('generatePPPoECredentials', () => {
    it('should throw if isUsernameUnique is not provided', async () => {
      await expect(generatePPPoECredentials({})).rejects.toThrow(
        'isUsernameUnique checker function is required'
      );
    });

    it('should throw if isUsernameUnique is not a function', async () => {
      await expect(
        generatePPPoECredentials({ isUsernameUnique: 'not a function' })
      ).rejects.toThrow('isUsernameUnique checker function is required');
    });

    it('should generate credentials when username is unique on first attempt', async () => {
      const checker = jest.fn().mockResolvedValue(true);
      const result = await generatePPPoECredentials({ isUsernameUnique: checker });

      expect(result).toHaveProperty('username');
      expect(result).toHaveProperty('password');
      expect(result.username).toMatch(/^uwais-[a-z0-9]{6}$/);
      expect(result.password).toHaveLength(12);
      expect(checker).toHaveBeenCalledTimes(1);
    });

    it('should retry when username already exists', async () => {
      const checker = jest
        .fn()
        .mockResolvedValueOnce(false) // first attempt: exists
        .mockResolvedValueOnce(false) // second attempt: exists
        .mockResolvedValueOnce(true); // third attempt: unique

      const result = await generatePPPoECredentials({ isUsernameUnique: checker });

      expect(result).toHaveProperty('username');
      expect(result).toHaveProperty('password');
      expect(checker).toHaveBeenCalledTimes(3);
    });

    it('should throw after maxAttempts exceeded', async () => {
      const checker = jest.fn().mockResolvedValue(false); // always exists

      await expect(
        generatePPPoECredentials({ isUsernameUnique: checker, maxAttempts: 5 })
      ).rejects.toThrow('Failed to generate unique PPPoE username after 5 attempts');

      expect(checker).toHaveBeenCalledTimes(5);
    });

    it('should use custom prefix', async () => {
      const checker = jest.fn().mockResolvedValue(true);
      const result = await generatePPPoECredentials({
        isUsernameUnique: checker,
        prefix: 'isp-',
      });

      expect(result.username).toMatch(/^isp-[a-z0-9]{6}$/);
    });

    it('should use custom password length', async () => {
      const checker = jest.fn().mockResolvedValue(true);
      const result = await generatePPPoECredentials({
        isUsernameUnique: checker,
        passwordLength: 20,
      });

      expect(result.password).toHaveLength(20);
    });

    it('should pass the generated username to the checker function', async () => {
      const checker = jest.fn().mockResolvedValue(true);
      await generatePPPoECredentials({ isUsernameUnique: checker });

      const calledWith = checker.mock.calls[0][0];
      expect(calledWith).toMatch(/^uwais-[a-z0-9]{6}$/);
    });
  });

  describe('createRadcheckUniquenessChecker', () => {
    it('should return true when username does not exist in radcheck', async () => {
      const mockPool = {
        execute: jest.fn().mockResolvedValue([[{ count: 0 }]]),
      };

      const checker = createRadcheckUniquenessChecker(mockPool);
      const result = await checker('uwais-abc123');

      expect(result).toBe(true);
      expect(mockPool.execute).toHaveBeenCalledWith(
        'SELECT COUNT(*) as count FROM radcheck WHERE username = ?',
        ['uwais-abc123']
      );
    });

    it('should return false when username already exists in radcheck', async () => {
      const mockPool = {
        execute: jest.fn().mockResolvedValue([[{ count: 1 }]]),
      };

      const checker = createRadcheckUniquenessChecker(mockPool);
      const result = await checker('uwais-existing');

      expect(result).toBe(false);
      expect(mockPool.execute).toHaveBeenCalledWith(
        'SELECT COUNT(*) as count FROM radcheck WHERE username = ?',
        ['uwais-existing']
      );
    });

    it('should use parameterized query to prevent SQL injection', async () => {
      const mockPool = {
        execute: jest.fn().mockResolvedValue([[{ count: 0 }]]),
      };

      const checker = createRadcheckUniquenessChecker(mockPool);
      await checker("'; DROP TABLE radcheck; --");

      expect(mockPool.execute).toHaveBeenCalledWith(
        'SELECT COUNT(*) as count FROM radcheck WHERE username = ?',
        ["'; DROP TABLE radcheck; --"]
      );
    });
  });
});
