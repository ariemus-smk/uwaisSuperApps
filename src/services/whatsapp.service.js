/**
 * WhatsApp Gateway Service.
 * Handles sending messages to the WhatsApp API gateway.
 * Supports template-based messages with parameter substitution.
 *
 * Requirements: 30.1, 30.2
 */

const axios = require('axios');
const whatsappConfig = require('../config/whatsapp');

/**
 * Send a WhatsApp message via the gateway API.
 * @param {string} recipient - Recipient WhatsApp number
 * @param {string} templateName - Message template name
 * @param {object} parameters - Template parameters for substitution
 * @returns {Promise<{success: boolean, messageId?: string, error?: string}>}
 */
async function sendMessage(recipient, templateName, parameters = {}) {
  if (!whatsappConfig.apiUrl) {
    return { success: false, error: 'WhatsApp API URL not configured' };
  }

  if (!whatsappConfig.apiKey) {
    return { success: false, error: 'WhatsApp API key not configured' };
  }

  try {
    const response = await axios.post(
      `${whatsappConfig.apiUrl}/send`,
      {
        sender: whatsappConfig.senderNumber,
        recipient,
        template: templateName,
        parameters,
      },
      {
        headers: {
          'Authorization': `Bearer ${whatsappConfig.apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 10000, // 10 second timeout
      }
    );

    if (response.status === 200 || response.status === 201) {
      return {
        success: true,
        messageId: response.data?.messageId || response.data?.id || null,
      };
    }

    return {
      success: false,
      error: `Unexpected response status: ${response.status}`,
    };
  } catch (err) {
    const errorMessage = err.response?.data?.message
      || err.response?.data?.error
      || err.message
      || 'Unknown WhatsApp API error';

    return {
      success: false,
      error: errorMessage,
    };
  }
}

/**
 * Build a message from a template and parameters.
 * Replaces {{key}} placeholders in the template with parameter values.
 * @param {string} template - Message template with {{key}} placeholders
 * @param {object} parameters - Key-value pairs for substitution
 * @returns {string} Rendered message
 */
function renderTemplate(template, parameters = {}) {
  let rendered = template;
  for (const [key, value] of Object.entries(parameters)) {
    const placeholder = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
    rendered = rendered.replace(placeholder, String(value));
  }
  return rendered;
}

module.exports = {
  sendMessage,
  renderTemplate,
};
