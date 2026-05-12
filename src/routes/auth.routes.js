/**
 * Authentication routes.
 * POST /api/auth/login - User login
 * POST /api/auth/refresh - Refresh access token
 * POST /api/auth/password-reset/request - Request password reset
 * POST /api/auth/password-reset/confirm - Confirm password reset
 */

const { Router } = require('express');
const authController = require('../controllers/auth.controller');

const router = Router();

router.post('/login', authController.login);
router.post('/refresh', authController.refreshToken);
router.post('/password-reset/request', authController.passwordResetRequest);
router.post('/password-reset/confirm', authController.passwordResetConfirm);

module.exports = router;
