/**
 * Report routes.
 * GET  /api/reports/komdigi/packages   - Komdigi package report
 * GET  /api/reports/komdigi/customers  - Komdigi customer report
 * GET  /api/reports/komdigi/revenue    - Komdigi revenue report
 * GET  /api/reports/financial          - Financial reports (income, receivables, etc.)
 * GET  /api/reports/growth             - Customer growth report (MoM/YoY)
 * GET  /api/reports/export/:type       - Export report as Excel/PDF
 *
 * RBAC:
 * - Komdigi reports: Superadmin, Admin
 * - Financial reports: Accounting, Superadmin
 * - Growth reports: Superadmin, Admin, Sales
 * - Export: varies by type (Superadmin, Admin, Accounting, Sales)
 *
 * Requirements: 34.1, 35.1, 36.4
 */

const { Router } = require('express');
const reportController = require('../controllers/report.controller');
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/rbac');
const { branchScope } = require('../middleware/branchScope');
const { USER_ROLE } = require('../utils/constants');

const router = Router();

// Komdigi regulatory reports (Superadmin, Admin)
router.get(
  '/komdigi/packages',
  authenticate,
  authorize(USER_ROLE.SUPERADMIN, USER_ROLE.ADMIN),
  reportController.getKomdigiPackages
);

router.get(
  '/komdigi/customers',
  authenticate,
  authorize(USER_ROLE.SUPERADMIN, USER_ROLE.ADMIN),
  reportController.getKomdigiCustomers
);

router.get(
  '/komdigi/revenue',
  authenticate,
  authorize(USER_ROLE.SUPERADMIN, USER_ROLE.ADMIN),
  reportController.getKomdigiRevenue
);

// Financial reports (Accounting, Superadmin)
router.get(
  '/financial',
  authenticate,
  authorize(USER_ROLE.ACCOUNTING, USER_ROLE.SUPERADMIN),
  reportController.getFinancialReport
);

// Customer growth report (Superadmin, Admin, Sales)
router.get(
  '/growth',
  authenticate,
  authorize(USER_ROLE.SUPERADMIN, USER_ROLE.ADMIN, USER_ROLE.SALES),
  branchScope,
  reportController.getGrowthReport
);

// Export report as Excel/PDF (Superadmin, Admin, Accounting, Sales)
router.get(
  '/export/:type',
  authenticate,
  authorize(USER_ROLE.SUPERADMIN, USER_ROLE.ADMIN, USER_ROLE.ACCOUNTING, USER_ROLE.SALES),
  branchScope,
  reportController.exportReport
);

module.exports = router;
