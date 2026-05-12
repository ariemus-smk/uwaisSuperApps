/**
 * Unit tests for Branch scoping middleware.
 */

const { branchScope, BRANCH_BYPASS_ROLES } = require('../../src/middleware/branchScope');
const { USER_ROLE } = require('../../src/utils/constants');

/**
 * Helper to create a mock request object with user data.
 */
function createMockReq(user) {
  return { user };
}

/**
 * Helper to create a mock response object.
 */
function createMockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

describe('Branch Scope Middleware', () => {
  let res;
  let next;

  beforeEach(() => {
    res = createMockRes();
    next = jest.fn();
  });

  describe('when req.user is not set', () => {
    it('should return 401 with AUTH_UNAUTHORIZED error', () => {
      const req = {};

      branchScope(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'error',
          message: 'Access denied. Authentication required.',
          code: 'AUTH_UNAUTHORIZED',
        })
      );
      expect(next).not.toHaveBeenCalled();
    });

    it('should return 401 when req.user is null', () => {
      const req = { user: null };

      branchScope(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(next).not.toHaveBeenCalled();
    });

    it('should return 401 when req.user is undefined', () => {
      const req = { user: undefined };

      branchScope(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('Superadmin bypass', () => {
    it('should set branchFilter to null for Superadmin', () => {
      const req = createMockReq({ id: 1, role: USER_ROLE.SUPERADMIN, branch_id: null });

      branchScope(req, res, next);

      expect(req.branchFilter).toBeNull();
      expect(next).toHaveBeenCalled();
    });

    it('should set branchFilter to null even if Superadmin has a branch_id', () => {
      const req = createMockReq({ id: 1, role: USER_ROLE.SUPERADMIN, branch_id: 5 });

      branchScope(req, res, next);

      expect(req.branchFilter).toBeNull();
      expect(next).toHaveBeenCalled();
    });
  });

  describe('Branch-scoped roles', () => {
    const scopedRoles = [
      USER_ROLE.ADMIN,
      USER_ROLE.ACCOUNTING,
      USER_ROLE.TEKNISI,
      USER_ROLE.SALES,
      USER_ROLE.MITRA,
      USER_ROLE.MERCHANT,
      USER_ROLE.PELANGGAN,
    ];

    scopedRoles.forEach((role) => {
      it(`should set branchFilter to branch_id for ${role}`, () => {
        const branchId = 3;
        const req = createMockReq({ id: 1, role, branch_id: branchId });

        branchScope(req, res, next);

        expect(req.branchFilter).toBe(branchId);
        expect(next).toHaveBeenCalled();
      });
    });

    it('should set branchFilter to the correct branch_id value', () => {
      const req = createMockReq({ id: 10, role: USER_ROLE.ADMIN, branch_id: 7 });

      branchScope(req, res, next);

      expect(req.branchFilter).toBe(7);
      expect(next).toHaveBeenCalled();
    });
  });

  describe('BRANCH_BYPASS_ROLES constant', () => {
    it('should only contain Superadmin', () => {
      expect(BRANCH_BYPASS_ROLES).toEqual([USER_ROLE.SUPERADMIN]);
    });
  });
});
