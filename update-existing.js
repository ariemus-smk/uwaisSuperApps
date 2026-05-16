require('dotenv').config();
const { appPool } = require('./src/config/database');
const radiusService = require('./src/services/radius.service');
const subscriptionModel = require('./src/models/subscription.model');
const customerModel = require('./src/models/customer.model');
const billingService = require('./src/services/billing.service');
const coaService = require('./src/services/coa.service');
const { SUBSCRIPTION_STATUS, CUSTOMER_STATUS } = require('./src/utils/constants');

async function main() {
  try {
    // Get a valid user ID for actor_id
    const [users] = await appPool.execute('SELECT id FROM users LIMIT 1');
    const actorId = users.length > 0 ? users[0].id : 1;

    // Get the latest 2 subscriptions that are Active (one was already processed but failed at audit log, so let's get any that are 'Active')
    const [subs] = await appPool.execute('SELECT * FROM subscriptions WHERE status = "Active" ORDER BY id DESC LIMIT 2');
    
    // Also we need to get the ones that might be suspended but missing an invoice.
    const [susSubs] = await appPool.execute('SELECT * FROM subscriptions WHERE status = "Suspended" ORDER BY id DESC LIMIT 2');
    
    const allSubs = [...subs, ...susSubs].reduce((acc, current) => {
      const x = acc.find(item => item.id === current.id);
      if (!x) {
        return acc.concat([current]);
      } else {
        return acc;
      }
    }, []);

    if (allSubs.length === 0) {
      console.log('No subscriptions found to process.');
      process.exit(0);
    }

    console.log(`Found ${allSubs.length} subscriptions. Isolating them...`);

    for (const sub of allSubs) {
      console.log(`Processing subscription ID: ${sub.id}, PPPoE Username: ${sub.pppoe_username}`);
      
      // 1. Set Isolir profile in RADIUS
      await radiusService.setIsolirProfile(sub.pppoe_username);
      console.log(' - RADIUS profile set to Isolir');

      // 2. Update subscription status
      await subscriptionModel.update(sub.id, {
        status: SUBSCRIPTION_STATUS.SUSPENDED
      });
      console.log(' - Subscription status set to Suspended');

      // 3. Update customer status
      try {
        await customerModel.updateStatus(sub.customer_id, CUSTOMER_STATUS.ISOLIR, actorId);
        console.log(' - Customer status set to ISOLIR');
      } catch(err) {
        if(err.code === 'INVALID_STATUS_TRANSITION') {
           console.log(' - Customer is already ISOLIR or cannot transition directly (Ignored)');
        } else {
           throw err;
        }
      }

      // 4. Generate Prorated Invoice
      const activationDate = sub.activated_at ? new Date(sub.activated_at) : new Date();
      try {
        const invoice = await billingService.generateInvoice(sub.id, {
          isFirstInvoice: true,
          activationDate: activationDate,
          applyDp: true
        });
        console.log(` - Generated Invoice: ${invoice.invoice_number} for amount: ${invoice.total_amount}`);
      } catch (err) {
        console.log(` - Skipping invoice generation (maybe already exists?): ${err.message}`);
      }

      // 5. Send CoA Isolir to Mikrotik to enforce it immediately
      if (sub.nas_id) {
        try {
          await coaService.isolir(sub.id, sub.nas_id, sub.pppoe_username);
          console.log(' - Sent CoA Isolir to Mikrotik');
        } catch (coaErr) {
          console.log(` - Failed to send CoA Isolir (maybe NAS is offline): ${coaErr.message}`);
        }
      }
    }
    
    console.log('Done!');
  } catch (error) {
    console.error('Error:', error);
  } finally {
    process.exit(0);
  }
}

main();
