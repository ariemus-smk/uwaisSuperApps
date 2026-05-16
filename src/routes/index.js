/**
 * Route aggregator.
 * Registers all route modules under the API prefix.
 * Auth, RBAC, and branchScope middleware are applied per-route inside each module.
 */

const { Router } = require('express');

const authRoutes = require('./auth.routes');
const userRoutes = require('./user.routes');
const branchRoutes = require('./branch.routes');
const packageRoutes = require('./package.routes');
const customerRoutes = require('./customer.routes');
const subscriptionRoutes = require('./subscription.routes');
const billingRoutes = require('./billing.routes');
const paymentRoutes = require('./payment.routes');
const coaRoutes = require('./coa.routes');
const nasRoutes = require('./nas.routes');
const vpnChrRoutes = require('./vpnChr.routes');
const infrastructureRoutes = require('./infrastructure.routes');
const packageChangeRoutes = require('./packageChange.routes');
const assetRoutes = require('./asset.routes');
const ticketRoutes = require('./ticket.routes');
const acsRoutes = require('./acs.routes');
const notificationRoutes = require('./notification.routes');
const schedulerRoutes = require('./scheduler.routes');
const kpiRoutes = require('./kpi.routes');
const payrollRoutes = require('./payroll.routes');
const capexRoutes = require('./capex.routes');
const reportRoutes = require('./report.routes');
const selfserviceRoutes = require('./selfservice.routes');
const workJournalRoutes = require('./workJournal.routes');
const regionRoutes = require('./region.routes');

const router = Router();

// Auth routes (public + authenticated)
router.use('/auth', authRoutes);

// User management routes
router.use('/users', userRoutes);

// Branch routes
router.use('/branches', branchRoutes);

// Package routes
router.use('/packages', packageRoutes);

// Customer routes
router.use('/customers', customerRoutes);

// Subscription routes
router.use('/subscriptions', subscriptionRoutes);

// Billing routes
router.use('/billing', billingRoutes);

// Payment routes (mixed auth - callback is public)
router.use('/payments', paymentRoutes);

// CoA/POD engine routes
router.use('/coa', coaRoutes);

// NAS management routes
router.use('/nas', nasRoutes);

// VPN CHR management routes
router.use('/vpn-chr', vpnChrRoutes);

// Infrastructure routes (OLT, ODP, Coverage)
router.use('/infrastructure', infrastructureRoutes);

// Package change routes (upgrade/downgrade)
router.use('/package-change', packageChangeRoutes);

// Asset management routes (inventory, tools, transfers)
router.use('/assets', assetRoutes);

// Ticket/helpdesk routes
router.use('/tickets', ticketRoutes);

// ACS / TR-069 remote device management routes
router.use('/acs', acsRoutes);

// Notification routes (queue, broadcast)
router.use('/notifications', notificationRoutes);

// Scheduler routes (job management, logs, manual trigger)
router.use('/scheduler', schedulerRoutes);

// KPI routes (scores, history)
router.use('/kpi', kpiRoutes);

// Payroll routes (reports, approval, slips)
router.use('/payroll', payrollRoutes);

// CAPEX routes (expansion project proposals)
router.use('/capex', capexRoutes);

// Report routes (Komdigi, financial, growth, export)
router.use('/reports', reportRoutes);

// Self-service routes (Pelanggan portal)
router.use('/selfservice', selfserviceRoutes);

// Work Journal routes (Teknisi daily activity journal)
router.use('/work-journals', workJournalRoutes);

// Regions hierarchy routes
router.use('/regions', regionRoutes);

module.exports = router;
