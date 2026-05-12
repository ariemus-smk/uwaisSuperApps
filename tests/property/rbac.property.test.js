/**
 * Property-based tests for RBAC Permission Enforcement.
 *
 * **Validates: Requirements 31.3**
 *
 * Property 11: RBAC Permission Enforcement
 * - The RBAC middleware ALWAYS allows access to a role in the allowed list
 * - The RBAC middleware NEVER allows access to a role not in the allowed list
 */

const fc = require('fast-check');
const { authorize } = require('../../src/middleware/rbac');
const { USER_ROLE } = require('../../src/utils/constants');

const ALL_ROLES = Object.values(USER_ROLE);

/**
 * Helper to create mock req/res/next for testing the authorize middleware.
 * @param {string} userRole - The role to assign to the mock user
 * @returns {{ req: object, res: object, next: Function, wasNextCalled: Function, getStatusCode: Function }}
 */
function createMocks(userRole) {
  let nextCalled = false;
  let statusCode = null;

  const req = {
    user: { id: 1, role: userRole, branch_id: 1 },
  };

  const res = {
    status(code) {
      statusCode = code;
      return this;
    },
    json() {
      return this;
    },
  };

  const next = () => {
    nextCalled = true;
  };

  return {
    req,
    res,
    next,
    wasNextCalled: () => nextCalled,
    getStatusCode: () => statusCode,
  };
}

describe('Property: RBAC Permission Enforcement', () => {
  it('should ALWAYS grant access when user role is in allowed roles', () => {
    fc.assert(
      fc.property(
        // Generate a random non-empty subset of roles as the "allowed" set
        fc.shuffledSubarray(ALL_ROLES, { minLength: 1 }),
        (allowedRoles) => {
          // For each role in the allowed set, authorize should call next()
          for (const role of allowedRoles) {
            const { req, res, next, wasNextCalled, getStatusCode } = createMocks(role);
            const middleware = authorize(...allowedRoles);

            middleware(req, res, next);

            // Access must be granted (next called, no 403)
            if (!wasNextCalled()) return false;
            if (getStatusCode() !== null) return false;
          }
          return true;
        }
      ),
      { numRuns: 200 }
    );
  });

  it('should NEVER grant access when user role is NOT in allowed roles', () => {
    fc.assert(
      fc.property(
        // Generate a random role
        fc.constantFrom(...ALL_ROLES),
        // Generate a random non-empty subset of roles as the "allowed" set
        fc.shuffledSubarray(ALL_ROLES, { minLength: 1 }),
        (userRole, allowedRoles) => {
          // Only test when the user role is NOT in the allowed set
          fc.pre(!allowedRoles.includes(userRole));

          const { req, res, next, wasNextCalled, getStatusCode } = createMocks(userRole);
          const middleware = authorize(...allowedRoles);

          middleware(req, res, next);

          // Access must be denied (next NOT called, 403 returned)
          if (wasNextCalled()) return false;
          if (getStatusCode() !== 403) return false;
          return true;
        }
      ),
      { numRuns: 200 }
    );
  });
});
